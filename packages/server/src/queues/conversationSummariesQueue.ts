import { Queue } from 'bullmq';
import { getRedisConnection } from '@/queues/scheduledRunsQueue';
import type { ConversationSummaryCursor } from '@starships/protocol';

export const CONVERSATION_SUMMARIES_QUEUE_NAME = 'conversation-summaries';

export interface ConversationSummaryJobData {
  conversationId: string;
  starshipId: string;
  /**
   * Summarize all messages strictly before this cursor (typically the oldest
   * message in the last-N window used for LLM execution).
   */
  targetBefore: ConversationSummaryCursor;
  /**
   * The last-N window size used by the host when deciding the target cursor.
   * (Used only for logging/debugging; worker recomputes its own view.)
   */
  llmHistoryLimit?: number;
}

let queueInstance: Queue<ConversationSummaryJobData> | null = null;

export function getConversationSummariesQueue(): Queue<ConversationSummaryJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<ConversationSummaryJobData>(CONVERSATION_SUMMARIES_QUEUE_NAME, {
      connection: getRedisConnection(),
      prefix: 'starships',
    });
  }
  return queueInstance;
}

export async function closeConversationSummariesQueue(): Promise<void> {
  if (queueInstance) {
    try {
      await queueInstance.close();
    } catch (err) {
      console.error('[ConversationSummariesQueue] Failed to close queue', err);
    } finally {
      queueInstance = null;
    }
  }
}

