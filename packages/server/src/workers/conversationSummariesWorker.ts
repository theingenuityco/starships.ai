import { Worker } from 'bullmq';
import { getEnvConfig } from '@starships/env';
import { ConversationRepository, LlmModelRepository, createConnection } from '@starships/models';
import { autopilot, ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig } from '@starships/autopilot';
import type { ConversationState, ConversationSummaryCursor, MessageModel } from '@starships/protocol';
import { isTextFile, MAX_TEXT_FILE_SIZE } from '@starships/protocol';
import {
  closeConversationSummariesQueue,
  CONVERSATION_SUMMARIES_QUEUE_NAME,
  type ConversationSummaryJobData,
} from '@/queues/conversationSummariesQueue';
import { getRedisConnection } from '@/queues/scheduledRunsQueue';
import { mergeConversationState } from '@/utils/conversation-state';
import { AttachmentService } from '@/services/AttachmentService';
import { fetchTextFromS3 } from '@/utils/s3-helper';

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

function normalizeCursor(c: unknown): ConversationSummaryCursor | null {
  if (!c || typeof c !== 'object') return null;
  const createdAt = typeof (c as Record<string, unknown>).createdAt === 'string' ? String((c as Record<string, unknown>).createdAt) : '';
  const id = typeof (c as Record<string, unknown>).id === 'string' ? String((c as Record<string, unknown>).id) : '';
  return createdAt && id ? { createdAt, id } : null;
}

function sameCursor(a: ConversationSummaryCursor | null, b: ConversationSummaryCursor | null): boolean {
  return Boolean(a && b && a.createdAt === b.createdAt && a.id === b.id);
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
          console.warn(
            `[ConversationSummariesWorker] Text attachment ${attachment.filename} exceeds MAX_TEXT_FILE_SIZE; will truncate heavily`
          );
        }

        const textContent = await fetchTextFromS3(attachment.s3Key);
        const maxChars = 20000; // keep summarizer prompt bounded
        const truncated = textContent.length > maxChars ? textContent.slice(0, maxChars) + '\n\n[... content truncated ...]' : textContent;

        text += `\n\n--- Content of ${attachment.filename} (attachmentId: ${attachment.id}) ---\n${truncated}\n--- End of ${attachment.filename} ---`;
      } catch (err) {
        text += `\n\n[Note: Could not load content of ${attachment.filename} (attachmentId: ${attachment.id})]`;
        console.warn('[ConversationSummariesWorker] Failed to load text attachment content', {
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
    console.log('[ConversationSummariesWorker] SUMMARY_PROMPT', {
      conversationId: args.conversationId,
      starshipId: args.starshipId,
      model,
      messagesCount: messages.length,
      previousSummaryChars: previous.length,
      newMessagesCount: args.newMessages.length,
    });
    const formatted = formatSummarizerMessagesForLog(messages);
    const maxLogChars = 120000; // guardrail for log aggregation systems
    console.log(
      formatted.length > maxLogChars
        ? formatted.slice(0, maxLogChars) + '\n\n[...summary prompt log truncated...]'
        : formatted
    );
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
  console.log('[ConversationSummariesWorker] Start', {
    conversationId: data.conversationId,
    starshipId: data.starshipId,
    llmHistoryLimit: data.llmHistoryLimit,
  });

  // Worker recomputes the “oldest in last-N” cursor to avoid trusting stale job payloads.
  const llmHistoryLimit = Math.max(1, Math.min(200, Number(data.llmHistoryLimit || 30)));
  const latestPage = await repo.getConversationMessagesPage({ conversationId: data.conversationId, limit: llmHistoryLimit });
  const oldestInWindow = latestPage.messages.length > 0 ? latestPage.messages[0] : null;
  const targetBefore = oldestInWindow ? { createdAt: oldestInWindow.createdAt, id: oldestInWindow.id } : null;

  // If the conversation fits in the window, nothing to summarize.
  if (!latestPage.hasMoreBefore || !targetBefore) return;

  const state = (conversation.state && typeof conversation.state === 'object' ? conversation.state : {}) as ConversationState;
  const existingSummary = typeof state.contextSummary === 'string' ? state.contextSummary : '';
  const existingCursor = normalizeCursor(state.contextSummaryBefore);

  // Already summarized up to the current window boundary.
  if (sameCursor(existingCursor, targetBefore)) return;

  // Incremental strategy with a resume cursor + bounded work per job.
  //
  // We model contextSummaryBefore as "the first unsummarized message cursor":
  // summary covers messages strictly before that cursor.
  //
  // Each job advances the cursor forward by at most `chunkSize` messages, never re-reading
  // from the first message once a cursor exists.
  const chunkSize = 100;

  // If we don't yet have a cursor, initialize it to the oldest message strictly before targetBefore.
  // That makes the summary start at "covers nothing" and lets us advance from the beginning in chunks.
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
    startCursor = { createdAt: m0.createdAt, id: m0.id };
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
  const nextState = mergeConversationState(state, {
    contextSummary: updated.trim(),
    contextSummaryBefore: nextCursorBoundary,
    contextSummaryUpdatedAt: now,
    contextSummaryVersion: (typeof state.contextSummaryVersion === 'number' ? state.contextSummaryVersion : 0) + 1,
  });

  // IMPORTANT: merge only summary keys to avoid clobbering concurrent state updates from the main server.
  await repo.mergeState(data.conversationId, {
    contextSummary: nextState.contextSummary,
    contextSummaryBefore: nextState.contextSummaryBefore,
    contextSummaryUpdatedAt: nextState.contextSummaryUpdatedAt,
    contextSummaryVersion: nextState.contextSummaryVersion,
  });
  console.log('[ConversationSummariesWorker] Updated summary', {
    conversationId: data.conversationId,
    starshipId: data.starshipId,
    contextSummaryVersion: nextState.contextSummaryVersion,
    contextSummaryUpdatedAt: nextState.contextSummaryUpdatedAt,
    contextSummaryBefore: nextState.contextSummaryBefore,
  });
}

async function main(): Promise<void> {
  const env = getEnvConfig();

  // Ensure Redis config is present early (throws if missing).
  getRedisConnection();

  // Configure remote runner (URL and optional token) the same way the main server does.
  // This is REQUIRED when process.env.RUNNER_URL is set; otherwise RunnerFactory selects RemoteRunner
  // and it will throw if autopilot.setRunnerConfig() was never called in this process.
  autopilot.setRunnerConfig({
    url: env.RUNNER_URL,
    token: env.RUNNER_AUTH_TOKEN,
  });

  // IMPORTANT: repositories use the shared models connection singleton.
  // Workers must initialize it explicitly (unlike the main server process).
  const db = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });
  await db.connect();
  console.log('[ConversationSummariesWorker] Connected to PostgreSQL');

  console.log('[ConversationSummariesWorker] Started', {
    queue: CONVERSATION_SUMMARIES_QUEUE_NAME,
    prefix: 'starships',
  });

  const worker = new Worker<ConversationSummaryJobData>(
    CONVERSATION_SUMMARIES_QUEUE_NAME,
    async (job) => {
      await summarizeConversationJob(job.data);
    },
    { connection: getRedisConnection(), prefix: 'starships' }
  );

  worker.on('ready', () => {
    console.log('[ConversationSummariesWorker] Ready');
  });

  worker.on('failed', (job, err) => {
    console.error('[ConversationSummariesWorker] Job failed', {
      jobId: job?.id,
      name: job?.name,
      conversationId: job?.data?.conversationId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  });

  worker.on('error', (err) => {
    console.error('[ConversationSummariesWorker] Worker error', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  process.on('SIGINT', async () => {
    console.log('[ConversationSummariesWorker] Shutting down...');
    try {
      await worker.close();
    } catch (err) {
      console.error('[ConversationSummariesWorker] Failed to close worker', err);
    }
    try {
      await db.disconnect();
    } catch (err) {
      console.error('[ConversationSummariesWorker] Failed to disconnect database', err);
    }
    try {
      await closeConversationSummariesQueue();
    } catch (err) {
      console.error('[ConversationSummariesWorker] Failed to close queue', err);
    }
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[ConversationSummariesWorker] Fatal error during startup', err);
  process.exit(1);
});
