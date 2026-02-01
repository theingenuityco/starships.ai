import { Worker } from 'bullmq';
import { getEnvConfig } from '@starships/env';
import OpenAI from 'openai';
import { ConversationRepository } from '@starships/models';
import type { ConversationState, ConversationSummaryCursor, MessageModel } from '@starships/protocol';
import {
  closeConversationSummariesQueue,
  CONVERSATION_SUMMARIES_QUEUE_NAME,
  type ConversationSummaryJobData,
} from '@/queues/conversationSummariesQueue';
import { getRedisConnection } from '@/queues/scheduledRunsQueue';
import { mergeConversationState } from '@/utils/conversation-state';

function normalizeCursor(c: unknown): ConversationSummaryCursor | null {
  if (!c || typeof c !== 'object') return null;
  const createdAt = typeof (c as Record<string, unknown>).createdAt === 'string' ? String((c as Record<string, unknown>).createdAt) : '';
  const id = typeof (c as Record<string, unknown>).id === 'string' ? String((c as Record<string, unknown>).id) : '';
  return createdAt && id ? { createdAt, id } : null;
}

function sameCursor(a: ConversationSummaryCursor | null, b: ConversationSummaryCursor | null): boolean {
  return Boolean(a && b && a.createdAt === b.createdAt && a.id === b.id);
}

function formatMessagesForSummarizer(messages: MessageModel[]): string {
  const clamp = (s: string, max: number) => (s.length > max ? s.slice(0, max) + '…' : s);
  const lines: string[] = [];
  for (const m of messages) {
    const role = typeof m.role === 'string' ? m.role : 'unknown';
    const content = typeof m.content === 'string' ? m.content : '';
    // Keep prompts bounded; we just need salient bits.
    const safe = clamp(content.replace(/\s+/g, ' ').trim(), 400);
    if (!safe) continue;
    lines.push(`${role}: ${safe}`);
  }
  return lines.join('\n');
}

async function llmUpdateSummary(args: {
  previousSummary: string;
  newMessagesText: string;
}): Promise<string> {
  const env = getEnvConfig();
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const client = new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://starships.ai',
      'X-Title': 'Starships.ai',
    },
  });

  const model = 'openai/gpt-4o-mini';

  const sys = [
    'You maintain a rolling conversation summary for an agent.',
    'Goal: preserve important context while keeping the summary short.',
    'Write in plain text with compact bullet points.',
    'Include these sections when applicable:',
    '- Key facts',
    '- Decisions',
    '- Open questions',
    '- Important entities/links',
    'Constraints:',
    '- Keep the full summary under ~1200 characters.',
    '- Do not include private secrets unless explicitly present in the messages.',
    '- Prefer stable wording; update incrementally rather than rewriting everything.',
    'Return only the updated summary text.',
  ].join('\n');

  const prompt = [
    'Previous summary (may be empty):',
    args.previousSummary?.trim() ? args.previousSummary.trim() : '(none)',
    '',
    'New messages to incorporate:',
    args.newMessagesText?.trim() ? args.newMessagesText.trim() : '(none)',
  ].join('\n');

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 600,
  });

  const out = completion.choices?.[0]?.message?.content;
  const text = typeof out === 'string' ? out.trim() : '';
  return text || '';
}

async function summarizeConversationJob(data: ConversationSummaryJobData): Promise<void> {
  const repo = new ConversationRepository();
  const conversation = await repo.findById(data.conversationId);
  if (!conversation) return;

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

  // Best-effort incremental strategy:
  // - If we have an existing cursor, summarize messages from that cursor (inclusive) up to targetBefore (exclusive).
  // - If not, summarize the messages immediately preceding targetBefore (bounded) and create an initial summary.
  const maxNewMessages = 250;
  const collected: MessageModel[] = [];

  // Page backwards from targetBefore until we hit existingCursor (or limit).
  let cursorBefore: ConversationSummaryCursor = targetBefore;
  while (collected.length < maxNewMessages) {
    const page = await repo.getConversationMessagesPage({
      conversationId: data.conversationId,
      limit: Math.min(200, maxNewMessages - collected.length),
      beforeCreatedAt: cursorBefore.createdAt,
      beforeId: cursorBefore.id,
    });

    if (!page.messages.length) break;

    // page.messages is chronological (oldest → newest)
    // We want to keep chronological order across pages; since we’re paging backwards,
    // prepend older pages.
    collected.unshift(...page.messages);

    const pageOldest = page.messages[0]!;
    cursorBefore = { createdAt: pageOldest.createdAt, id: pageOldest.id };

    if (existingCursor) {
      const hit = page.messages.findIndex((m) => m.createdAt === existingCursor.createdAt && m.id === existingCursor.id);
      if (hit >= 0) {
        // Drop messages older than the existing cursor; include cursor message itself (inclusive).
        const keep = page.messages.slice(hit);
        // Replace the portion we just unshifted for this page with the trimmed portion.
        // Prefix length equals the full page we just unshifted.
        collected.splice(0, page.messages.length, ...keep);
        break;
      }
    } else {
      // No prior cursor: we only take a bounded slice immediately before targetBefore.
      // The loop + maxNewMessages already bounds this; stop after one (or few) pages.
      if (!page.hasMoreBefore) break;
      if (collected.length >= maxNewMessages) break;
    }
  }

  const newMessagesText = formatMessagesForSummarizer(collected);
  if (!newMessagesText.trim()) return;

  const updated = await llmUpdateSummary({ previousSummary: existingSummary, newMessagesText });
  if (!updated.trim()) return;

  const now = new Date().toISOString();
  const nextState = mergeConversationState(state, {
    contextSummary: updated.trim(),
    contextSummaryBefore: targetBefore,
    contextSummaryUpdatedAt: now,
    contextSummaryVersion: (typeof state.contextSummaryVersion === 'number' ? state.contextSummaryVersion : 0) + 1,
  });

  await repo.update(data.conversationId, { state: nextState, updatedAt: now });
}

async function main(): Promise<void> {
  // Ensure Redis config is present early (throws if missing).
  getRedisConnection();

  const worker = new Worker<ConversationSummaryJobData>(
    CONVERSATION_SUMMARIES_QUEUE_NAME,
    async (job) => {
      await summarizeConversationJob(job.data);
    },
    { connection: getRedisConnection(), prefix: 'starships' }
  );

  worker.on('failed', (job, err) => {
    console.error('[ConversationSummariesWorker] Job failed', {
      jobId: job?.id,
      name: job?.name,
      conversationId: job?.data?.conversationId,
      error: err instanceof Error ? err.message : String(err),
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

