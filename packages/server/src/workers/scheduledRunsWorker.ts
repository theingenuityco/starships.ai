import { getEnvConfig } from '@starships/env';
import { Worker } from 'bullmq';
import {
  closeScheduledRunsQueue,
  getRedisConnection,
  getScheduledRunsQueue,
  SCHEDULED_RUNS_QUEUE_NAME,
  type ScheduledRunJobData,
} from '@/queues/scheduledRunsQueue';

async function main(): Promise<void> {
  const env = getEnvConfig();

  // Ensure queue instance is initialized with Redis connection from env.
  getScheduledRunsQueue();

  const worker = new Worker<ScheduledRunJobData>(
    SCHEDULED_RUNS_QUEUE_NAME,
    async (job) => {
      const { scheduleId, starshipId, agentId, prompt } = job.data;

      console.log('[ScheduledRunsWorker] Processing scheduled run job', {
        jobId: job.id,
        scheduleId,
        starshipId,
        agentId,
      });

      // Materialize as a new conversation + first message via HTTP API.
      const baseUrl = (env.SERVER_URL || 'http://localhost:4000').replace(/\/+$/, '');
      const apiBase = `${baseUrl}/api/v1`;
      const scheduleToken = process.env.SCHEDULE_WORKER_TOKEN;

      if (!scheduleToken) {
        throw new Error('[ScheduledRunsWorker] SCHEDULE_WORKER_TOKEN is not configured; cannot authenticate internal API calls.');
      }

      // 1) Create conversation
      const createRes = await fetch(`${apiBase}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-schedule-token': scheduleToken,
        },
        body: JSON.stringify({
          title: `Scheduled – ${scheduleId}`,
          status: 'active',
          starshipId,
          agentId,
        }),
      });

      if (!createRes.ok) {
        const text = await createRes.text().catch(() => '');
        throw new Error(
          `[ScheduledRunsWorker] Failed to create conversation via API: ${createRes.status} ${
            createRes.statusText
          }${text ? ` - ${text}` : ''}`
        );
      }

      const conversation = (await createRes.json()) as { id: string };

      // 2) Post first user message (fire-and-forget turn)
      const messageRes = await fetch(`${apiBase}/conversations/${conversation.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-schedule-token': scheduleToken,
        },
        body: JSON.stringify({
          content: prompt,
          agentId,
          // Fire-and-forget; streaming / final response is handled by ConversationService
          sync: false,
        }),
      });

      if (!messageRes.ok) {
        const text = await messageRes.text().catch(() => '');
        throw new Error(
          `[ScheduledRunsWorker] Failed to enqueue first message via API: ${messageRes.status} ${
            messageRes.statusText
          }${text ? ` - ${text}` : ''}`
        );
      }

      console.log('[ScheduledRunsWorker] Completed scheduled run job', {
        jobId: job.id,
        scheduleId,
        conversationId: conversation.id,
      });
    },
    {
      connection: getRedisConnection(),
      prefix: 'starships',
    }
  );

  worker.on('failed', (job, err) => {
    console.error('[ScheduledRunsWorker] Job failed', {
      jobId: job?.id,
      name: job?.name,
      scheduleId: job?.data?.scheduleId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  worker.on('error', (err) => {
    console.error('[ScheduledRunsWorker] Worker error', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  const shutdown = async () => {
    console.log('[ScheduledRunsWorker] Shutting down...');
    try {
      await worker.close();
    } catch (err) {
      console.error('[ScheduledRunsWorker] Failed to close worker', err);
    }

    try {
      await closeScheduledRunsQueue();
    } catch (err) {
      console.error('[ScheduledRunsWorker] Failed to close scheduled runs queue', err);
    }

    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[ScheduledRunsWorker] Fatal error during startup', err);
  process.exit(1);
});
