import { autopilot } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';
import { createConnection } from '@starships/models';
import { Worker } from 'bullmq';
import { ConversationService } from '@/services/ConversationService';
import {
  closeScheduledRunsQueue,
  getRedisConnection,
  getScheduledRunsQueue,
  SCHEDULED_RUNS_QUEUE_NAME,
  type ScheduledRunJobData,
} from '@/queues/scheduledRunsQueue';

async function main(): Promise<void> {
  const env = getEnvConfig();

  // Configure remote runner for Autopilot so scheduled conversations behave like API-triggered ones.
  autopilot.setRunnerConfig({
    url: env.RUNNER_URL,
    token: env.RUNNER_AUTH_TOKEN,
  });

  const connection = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });

  await connection.connect();
  console.log('[ScheduledRunsWorker] Connected to PostgreSQL');

  // Ensure queue instance is initialized with Redis connection from env.
  getScheduledRunsQueue();

  const conversationService = new ConversationService();

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

      // Materialize as a new conversation + first message, mirroring the previous inline behavior.
      const conversation = await conversationService.createConversation({
        title: `Scheduled – ${scheduleId}`,
        status: 'active',
        starshipId,
        agentId,
      });

      await conversationService.addConversationMessage(
        {
          conversationId: conversation.id,
          content: prompt,
          role: 'user',
          messageType: 'user_input',
          agentId,
        },
        {}
      );

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

    try {
      await connection.disconnect();
    } catch (err) {
      console.error('[ScheduledRunsWorker] Failed to disconnect database', err);
    }

    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main().catch((err) => {
  console.error('[ScheduledRunsWorker] Fatal error during startup', err);
  process.exit(1);
});
