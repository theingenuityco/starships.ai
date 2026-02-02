import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';
import { ConversationRepository, LlmModelRepository, getConnection } from '@starships/models';
import type { ConversationSummaryCursor, MessageModel } from '@starships/protocol';
import { isTextFile, MAX_TEXT_FILE_SIZE } from '@starships/protocol';
import { AttachmentService } from '@/services/AttachmentService';
import { fetchTextFromS3 } from '@/utils/s3-helper';

export interface ConversationSummaryJobData {
  conversationId: string;
  starshipId: string;
  /**
   * Summarize all messages strictly before this cursor (typically the oldest
   * message in the last-N window used for LLM execution).
   *
   * Note: we treat this as a hint only; the job recomputes its own boundary.
   */
  targetBefore: ConversationSummaryCursor;
  /**
   * The last-N window size used by the host when deciding the target cursor.
   * (Used only for logging/debugging; job recomputes its own view.)
   */
  llmHistoryLimit?: number;
}

/**
 * Best-effort, fire-and-forget conversation summarization.
 *
 * This intentionally runs in-process (no queue/worker). It should never block request handling.
 */
export class ConversationSummaryService {
  runAsync(data: ConversationSummaryJobData): void {
    setImmediate(() => {
      void summarizeConversationJob(data).catch((err) => {
        console.warn('[ConversationSummaries] Async summarization failed', {
          conversationId: data.conversationId,
          starshipId: data.starshipId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      });
    });
  }
}

/**
 * Provider-agnostic summarizer message. Keep it strictly text to maximize compatibility
 * across providers behind the Autopilot LLM node.
 */
type SummarizerMessage = { role: 'system' | 'user'; content: string };

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function formatSummarizerMessagesForLog(messages: SummarizerMessage[]): string {
  const out: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    out.push(`#${i + 1} ${m.role}`);
    out.push(m.content);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

function sameCursor(a: ConversationSummaryCursor | null, b: ConversationSummaryCursor | null): boolean {
  return Boolean(a && b && a.createdAt === b.createdAt && a.id === b.id);
}

type ConversationSummaryRow = {
  conversation_id: string;
  summary: string;
  summary_before_created_at: unknown | null;
  summary_before_message_id: string | null;
  updated_at: unknown;
  version: number;
};

const toIso = (v: unknown): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : v;
  }
  try {
    const s = String(v);
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t).toISOString() : s;
  } catch {
    return '';
  }
};

async function getConversationSummaryRow(conversationId: string): Promise<ConversationSummaryRow | null> {
  const conn = getConnection();
  const row = await conn.queryOne<ConversationSummaryRow>(
    `
      SELECT
        conversation_id,
        summary,
        summary_before_created_at,
        summary_before_message_id,
        updated_at,
        version
      FROM conversation_summaries
      WHERE conversation_id = $1
      LIMIT 1
    `,
    [conversationId]
  );
  return row || null;
}

async function upsertConversationSummary(args: {
  conversationId: string;
  summary: string;
  summaryBeforeCreatedAt: string | null;
  summaryBeforeMessageId: string | null;
}): Promise<{ version: number }> {
  const conn = getConnection();
  const result = await conn.queryOne<{ version: number }>(
    `
      INSERT INTO conversation_summaries (
        conversation_id,
        summary,
        summary_before_created_at,
        summary_before_message_id,
        updated_at,
        version
      )
      VALUES ($1, $2, $3::timestamptz, $4::varchar(255), NOW(), 1)
      ON CONFLICT (conversation_id) DO UPDATE
        SET summary = EXCLUDED.summary,
            summary_before_created_at = EXCLUDED.summary_before_created_at,
            summary_before_message_id = EXCLUDED.summary_before_message_id,
            updated_at = NOW(),
            version = conversation_summaries.version + 1
      RETURNING version
    `,
    [args.conversationId, args.summary, args.summaryBeforeCreatedAt, args.summaryBeforeMessageId]
  );
  return { version: typeof result?.version === 'number' ? result.version : 0 };
}

async function buildMessageTextWithAttachments(args: { message: MessageModel; starshipId: string }): Promise<string> {
  const { message, starshipId } = args;
  if (!Array.isArray(message.attachmentIds) || message.attachmentIds.length === 0) {
    return message.content;
  }

  const attachmentService = new AttachmentService();
  const attachments = await attachmentService.getAttachments(message.attachmentIds, starshipId);

  let text = message.content;
  for (const attachment of attachments) {
    // Always include attachment metadata, but redact URLs to avoid leaking presigned tokens in logs.
    text += `\n\n[Attachment] filename="${attachment.filename}" attachmentId="${attachment.id}" mimeType="${attachment.mimeType}" sizeBytes=${attachment.sizeBytes}`;
    if (attachment.mimeType.startsWith('image/') || attachment.mimeType === 'application/pdf') {
      // For now, do not attempt multimodal summarization across providers; just note that it exists.
      // (We still include metadata so the summary can reference it.)
      text += `\n[AttachmentNote] url=${redactUrl(attachment.url)}`;
      continue;
    }
    if (isTextFile(attachment.mimeType)) {
      try {
        if (attachment.sizeBytes > MAX_TEXT_FILE_SIZE) {
          // Best-effort: still try to fetch, but we'll truncate aggressively below.
          console.warn(`[ConversationSummaries] Text attachment ${attachment.filename} exceeds MAX_TEXT_FILE_SIZE; will truncate heavily`);
        }

        const textContent = await fetchTextFromS3(attachment.s3Key);
        const maxChars = 20000; // keep summarizer prompt bounded
        const truncated = textContent.length > maxChars ? textContent.slice(0, maxChars) + '\n\n[... content truncated ...]' : textContent;

        text += `\n\n--- Content of ${attachment.filename} (attachmentId: ${attachment.id}) ---\n${truncated}\n--- End of ${attachment.filename} ---`;
      } catch (err) {
        text += `\n\n[Note: Could not load content of ${attachment.filename} (attachmentId: ${attachment.id})]`;
        console.warn('[ConversationSummaries] Failed to load text attachment content', {
          attachmentId: attachment.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }
  }

  return text;
}

async function llmUpdateSummary(args: {
  previousSummary: string;
  newMessages: SummarizerMessage[];
  engineConfig: EngineConfig;
  conversationId?: string;
  starshipId?: string;
}): Promise<string> {
  // Pick a small, fast model identifier; routing is handled by modelRoutes in engineConfig.
  const model = 'openai/gpt-4o-mini';

  const sys = [
    'You maintain a rolling summary of a conversation.',
    'Goal: preserve important context while keeping the summary compact.',
    'Write in plain text with compact bullet points.',
    'Include these sections when applicable:',
    '- Key facts',
    '- Decisions',
    '- Open questions',
    '- Important entities/links',
    'Constraints:',
    '- Keep the full summary under ~1200 characters.',
    '- Do not include secrets unless explicitly present in the messages.',
    '- Prefer stable wording; update incrementally rather than rewriting everything.',
    'Return only the updated summary text.',
  ].join('\n');

  const previous = args.previousSummary?.trim() ? args.previousSummary.trim() : '(none)';

  const messages: SummarizerMessage[] = [
    { role: 'system', content: sys },
    { role: 'user', content: `Previous summary (may be empty):\n${previous}` },
    { role: 'user', content: 'New messages to incorporate are provided next.' },
    ...args.newMessages,
    { role: 'user', content: 'Now update the rolling summary. Return only the updated summary text.' },
  ];

  // Log the exact summarizer prompt (readable, with URL redaction).
  try {
    console.log('[ConversationSummaries] SUMMARY_PROMPT', {
      conversationId: args.conversationId,
      starshipId: args.starshipId,
      model,
      messagesCount: messages.length,
      previousSummaryChars: previous.length,
      newMessagesCount: args.newMessages.length,
    });
    const formatted = formatSummarizerMessagesForLog(messages);
    const maxLogChars = 120000; // guardrail for log aggregation systems
    console.log(formatted.length > maxLogChars ? formatted.slice(0, maxLogChars) + '\n\n[...truncated...]' : formatted);
  } catch {
    // best-effort only
  }

  // Execute via Autopilot runner/LLM node for provider routing.
  const blueprint: Blueprint = {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'llm_1',
        type: 'llm',
        name: 'Summarize Conversation',
        description: '',
        parameters: {
          model,
          messages,
          temperature: 0.2,
          maxTokens: 600,
          stream: false,
        },
      },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'llm_1' },
      { ref: 'e2', from: 'llm_1', to: 'end_1' },
    ],
    metadata: {},
  };

  const execution = ExecutionItemUtils.createExecution();
  execution.results.push({ nodeRef: '__initial__', items: ExecutionItemUtils.wrapSingle({}) });

  const runner = RunnerFactory.getTopLevelRunner(execution.depth ?? 0);
  const items = await runner.run(blueprint, execution, {
    ...(args.engineConfig as object),
    failOnNodeError: true,
  });

  // Extract LLM node output (mirror MarketingContentGenerationService strategy).
  const llmJson = ExecutionItemUtils.unwrapSingle(items);
  const extractNodeJsonFromExecutionResults = (value: unknown, nodeRef: string): unknown => {
    if (!Array.isArray(value)) return undefined;
    for (let i = value.length - 1; i >= 0; i--) {
      const entry = value[i];
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      if (rec.nodeRef !== nodeRef) continue;
      const it = rec.items;
      if (!Array.isArray(it) || it.length === 0) return undefined;
      const last = it[it.length - 1];
      if (!last || typeof last !== 'object') return undefined;
      return (last as Record<string, unknown>).json;
    }
    return undefined;
  };

  const llmNodeJson = Array.isArray(llmJson) ? extractNodeJsonFromExecutionResults(llmJson, 'llm_1') : llmJson;
  const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const unwrapResponse = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    if (Array.isArray(value.choices)) return value;
    for (const key of ['response', 'data', 'result'] as const) {
      const nested = value[key];
      if (isRecord(nested) && Array.isArray((nested as Record<string, unknown>).choices)) return nested;
    }
    return value;
  };
  const response = unwrapResponse(llmNodeJson);
  const choices = isRecord(response) ? response.choices : undefined;
  const choice0 = Array.isArray(choices) ? choices[0] : undefined;
  const msg = isRecord(choice0) && isRecord(choice0.message) ? (choice0.message as Record<string, unknown>) : undefined;
  const out = msg && typeof msg.content === 'string' ? String(msg.content).trim() : '';
  return out || '';
}

async function summarizeConversationJob(data: ConversationSummaryJobData): Promise<void> {
  const repo = new ConversationRepository();
  const conversation = await repo.findById(data.conversationId);
  if (!conversation) return;
  console.log('[ConversationSummaries] Start', {
    conversationId: data.conversationId,
    starshipId: data.starshipId,
    llmHistoryLimit: data.llmHistoryLimit,
  });

  // Recompute the “oldest in last-N” cursor to avoid trusting stale payloads.
  const llmHistoryLimit = Math.max(1, Math.min(200, Number(data.llmHistoryLimit || 30)));
  const latestPage = await repo.getConversationMessagesPage({ conversationId: data.conversationId, limit: llmHistoryLimit });
  const oldestInWindow = latestPage.messages.length > 0 ? latestPage.messages[0] : null;
  // Normalize cursor fields because MessageModel.createdAt may be a Date in some code paths.
  const targetBefore = oldestInWindow ? { createdAt: toIso(oldestInWindow.createdAt), id: String(oldestInWindow.id) } : null;

  // If the conversation fits in the window, nothing to summarize.
  if (!latestPage.hasMoreBefore || !targetBefore) return;

  // Summary state is stored in conversation_summaries only.
  const existingRow = await getConversationSummaryRow(data.conversationId).catch(() => null);
  const existingSummary = existingRow && typeof existingRow.summary === 'string' ? existingRow.summary : '';
  const existingCursor =
    existingRow && typeof existingRow.summary_before_message_id === 'string' && existingRow.summary_before_message_id
      ? (() => {
          const createdAtIso = toIso(existingRow.summary_before_created_at);
          return createdAtIso
            ? ({ createdAt: createdAtIso, id: existingRow.summary_before_message_id } as ConversationSummaryCursor)
            : null;
        })()
      : null;

  // Already summarized up to the current window boundary.
  if (sameCursor(existingCursor, targetBefore)) return;

  // Incremental strategy with a resume cursor + bounded work per run.
  const chunkSize = 100;

  // If we don't yet have a cursor, initialize it to the oldest message strictly before targetBefore.
  let startCursor: ConversationSummaryCursor | null = existingCursor;
  if (!startCursor) {
    const first = await repo.getConversationMessagesRangePage({
      conversationId: data.conversationId,
      limit: 1,
      beforeCreatedAt: targetBefore.createdAt,
      beforeId: targetBefore.id,
    });
    const m0 = first.messages[0];
    if (!m0) return;
    startCursor = { createdAt: toIso(m0.createdAt), id: String(m0.id) };
  }

  // Fetch the next chunk in [startCursor (inclusive), targetBefore (exclusive)).
  const range = await repo.getConversationMessagesRangePage({
    conversationId: data.conversationId,
    limit: chunkSize,
    afterCreatedAt: startCursor.createdAt,
    afterId: startCursor.id,
    afterInclusive: true,
    beforeCreatedAt: targetBefore.createdAt,
    beforeId: targetBefore.id,
  });

  // Nothing new to summarize (cursor already at/after targetBefore).
  if (!range.messages.length) return;

  // The next cursor boundary is either:
  // - the first message *after* the chunk (range.nextCursor), or
  // - the targetBefore window boundary (we caught up to the current window).
  const nextCursorBoundary: ConversationSummaryCursor = range.nextCursor ? range.nextCursor : targetBefore;

  // Build a text-only summarizer input (max compatibility across providers).
  const newMessages: SummarizerMessage[] = [];
  for (const msg of range.messages) {
    const role = msg.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') continue;
    const baseText = await buildMessageTextWithAttachments({ message: msg, starshipId: data.starshipId });
    newMessages.push({ role: 'user', content: `From ${role}:\n${baseText}` });
  }
  if (newMessages.length === 0) return;

  // Build an engine config compatible with the Autopilot LLM node (provider routing via modelRoutes).
  const env = getEnvConfig();
  const llmModelRepo = new LlmModelRepository();
  const providers = await llmModelRepo.getAllModelProviders({ enabledOnly: true });
  const modelRoutes: Record<string, { provider: string; providerModelId: string }[]> = {};
  for (const p of providers) {
    if (!modelRoutes[p.model]) modelRoutes[p.model] = [];
    modelRoutes[p.model].push({ provider: p.provider, providerModelId: p.providerModelId });
  }
  const engineConfig: EngineConfig = {
    runtimeEnv: {
      STARSHIP_ID: data.starshipId,
      CONVERSATION_ID: data.conversationId,
      SERVER_URL: env.SERVER_URL,
    },
    // No connectors needed for summarization.
    connectorTemplates: [],
    connectorSessions: [],
    connectorMetadata: [],
    llm: env.OPENROUTER_API_KEY ? { apiKey: env.OPENROUTER_API_KEY, baseUrl: 'https://openrouter.ai/api/v1' } : undefined,
    aws: {
      accessKeyId: process.env.AWS_BEDROCK_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
      region: process.env.AWS_BEDROCK_REGION,
    },
    azureAiFoundry:
      env.AZURE_AI_FOUNDRY_API_KEY && env.AZURE_AI_FOUNDRY_ENDPOINT
        ? { apiKey: env.AZURE_AI_FOUNDRY_API_KEY, endpoint: env.AZURE_AI_FOUNDRY_ENDPOINT, apiVersion: env.AZURE_AI_FOUNDRY_API_VERSION }
        : undefined,
    modelRoutes,
  } as unknown as EngineConfig;

  const updated = await llmUpdateSummary({
    previousSummary: existingSummary,
    newMessages,
    engineConfig,
    conversationId: data.conversationId,
    starshipId: data.starshipId,
  });
  if (!updated.trim()) return;

  const now = new Date().toISOString();
  const nextSummary = updated.trim();
  const nextCursorCreatedAt = toIso(nextCursorBoundary?.createdAt);
  const nextCursorId = nextCursorBoundary?.id != null ? String(nextCursorBoundary.id) : '';
  const cursorValid = Boolean(nextCursorCreatedAt && nextCursorId);
  await upsertConversationSummary({
    conversationId: data.conversationId,
    summary: nextSummary,
    summaryBeforeCreatedAt: cursorValid ? nextCursorCreatedAt : null,
    summaryBeforeMessageId: cursorValid ? nextCursorId : null,
  });

  console.log('[ConversationSummaries] Updated summary', {
    conversationId: data.conversationId,
    starshipId: data.starshipId,
    updatedAt: now,
    summaryBefore: nextCursorBoundary,
  });
}
