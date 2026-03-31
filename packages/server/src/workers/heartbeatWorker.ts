import { getEnvConfig } from '@starships/env';
import { createConnection, HeartbeatConfigRepository, HeartbeatRunRepository } from '@starships/models';
import { Worker } from 'bullmq';
import {
  closeHeartbeatQueue,
  getHeartbeatQueue,
  HEARTBEAT_QUEUE_NAME,
  type HeartbeatJobData,
} from '@/queues/heartbeatQueue';
import { getRedisConnection } from '@/queues/scheduledRunsQueue';
import { generateJWT } from '@/utils/jwt';
import { HeartbeatService } from '@/services/HeartbeatService';

async function main(): Promise<void> {
  const env = getEnvConfig();

  const connection = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });

  await connection.connect();
  console.log('[HeartbeatWorker] Connected to PostgreSQL');

  getHeartbeatQueue();

  const configRepo = new HeartbeatConfigRepository();
  const runRepo = new HeartbeatRunRepository();

  const worker = new Worker<HeartbeatJobData>(
    HEARTBEAT_QUEUE_NAME,
    async (job) => {
      const {
        heartbeatConfigId,
        roomConversationId,
        starshipId,
        agentId,
        prompt,
        ackMaxChars,
        ownerUserId,
        lastConversationId,
        lastAlertText,
        lastAlertAt,
      } = job.data;

      const startedAt = Date.now();

      console.log('[HeartbeatWorker] Processing heartbeat job', {
        jobId: job.id,
        heartbeatConfigId,
        roomConversationId,
        starshipId,
        agentId,
      });

      const baseUrl = (env.SERVER_URL || 'http://localhost:4000').replace(/\/+$/, '');
      const apiBase = `${baseUrl}/api/v1`;

      const token = await generateJWT({
        id: ownerUserId,
        agentId,
        starshipId,
      });

      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      let conversationId = lastConversationId ?? null;

      // Reuse existing heartbeat thread or create a new one inside the room.
      if (!conversationId) {
        const createRes = await fetch(`${apiBase}/conversations`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            title: `Heartbeat`,
            starshipId,
            agentId,
            parentConversationId: roomConversationId,
          }),
        });

        if (!createRes.ok) {
          const text = await createRes.text().catch(() => '');
          throw new Error(
            `[HeartbeatWorker] Failed to create conversation: ${createRes.status} ${createRes.statusText}${text ? ` - ${text}` : ''}`
          );
        }

        const createBody = (await createRes.json().catch(() => null)) as { data?: { id?: string } } | null;
        conversationId = createBody?.data?.id ?? null;

        if (!conversationId) {
          throw new Error('[HeartbeatWorker] Conversation creation response missing id');
        }

        await configRepo.update(heartbeatConfigId, {
          lastConversationId: conversationId,
        });
      }

      // Post heartbeat prompt synchronously to get the agent's response.
      const messageRes = await fetch(`${apiBase}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          content: prompt,
          agentId,
          sync: true,
        }),
      });

      if (!messageRes.ok) {
        const text = await messageRes.text().catch(() => '');
        const durationMs = Date.now() - startedAt;

        await runRepo.create({
          heartbeatConfigId,
          agentId,
          starshipId,
          status: 'failed',
          result: `http-${messageRes.status}`,
          durationMs,
          conversationId,
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date().toISOString(),
        });

        await configRepo.update(heartbeatConfigId, { lastRunStatus: 'failed' });

        throw new Error(
          `[HeartbeatWorker] Failed to post heartbeat message: ${messageRes.status} ${messageRes.statusText}${text ? ` - ${text}` : ''}`
        );
      }

      const responseBody = (await messageRes.json().catch(() => null)) as {
        data?: {
          conversation?: {
            messages?: Array<{ role?: string; content?: string; messageType?: string }>;
          };
        };
      } | null;

      const messages = responseBody?.data?.conversation?.messages ?? [];
      const lastAssistantMessage = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.messageType === 'agent_response');

      const replyText = lastAssistantMessage?.content ?? '';
      const durationMs = Date.now() - startedAt;

      const { shouldSuppress, strippedText } = HeartbeatService.parseHeartbeatResponse(replyText, ackMaxChars);

      if (shouldSuppress) {
        console.log('[HeartbeatWorker] HEARTBEAT_OK received, suppressing', {
          jobId: job.id,
          heartbeatConfigId,
          durationMs,
        });

        await runRepo.create({
          heartbeatConfigId,
          agentId,
          starshipId,
          status: 'ran',
          result: 'ok',
          durationMs,
          conversationId,
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date().toISOString(),
        });

        await configRepo.update(heartbeatConfigId, { lastRunStatus: 'ok' });
        return;
      }

      const isDuplicate = HeartbeatService.isDuplicateAlert(
        strippedText,
        lastAlertText,
        lastAlertAt,
        startedAt,
      );

      if (isDuplicate) {
        console.log('[HeartbeatWorker] Duplicate alert suppressed', {
          jobId: job.id,
          heartbeatConfigId,
          durationMs,
        });

        await runRepo.create({
          heartbeatConfigId,
          agentId,
          starshipId,
          status: 'ran',
          result: 'duplicate',
          durationMs,
          conversationId,
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date().toISOString(),
        });

        await configRepo.update(heartbeatConfigId, { lastRunStatus: 'ok' });
        return;
      }

      console.log('[HeartbeatWorker] Alert delivered', {
        jobId: job.id,
        heartbeatConfigId,
        preview: strippedText.slice(0, 200),
        durationMs,
      });

      await runRepo.create({
        heartbeatConfigId,
        agentId,
        starshipId,
        status: 'ran',
        result: 'alert',
        durationMs,
        conversationId,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date().toISOString(),
      });

      await configRepo.update(heartbeatConfigId, {
        lastRunStatus: 'alert',
        lastAlertText: strippedText,
        lastAlertAt: new Date().toISOString(),
      });

      console.log('[HeartbeatWorker] Completed heartbeat job', {
        jobId: job.id,
        heartbeatConfigId,
        conversationId,
        durationMs,
      });
    },
    {
      connection: getRedisConnection(),
      prefix: 'starships',
    }
  );

  worker.on('failed', (job, err) => {
    console.error('[HeartbeatWorker] Job failed', {
      jobId: job?.id,
      name: job?.name,
      heartbeatConfigId: job?.data?.heartbeatConfigId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  worker.on('error', (err) => {
    console.error('[HeartbeatWorker] Worker error', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  const shutdown = async () => {
    console.log('[HeartbeatWorker] Shutting down...');
    try {
      await worker.close();
    } catch (err) {
      console.error('[HeartbeatWorker] Failed to close worker', err);
    }

    try {
      await closeHeartbeatQueue();
    } catch (err) {
      console.error('[HeartbeatWorker] Failed to close heartbeat queue', err);
    }

    try {
      await connection.disconnect();
    } catch (err) {
      console.error('[HeartbeatWorker] Failed to disconnect database', err);
    }

    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[HeartbeatWorker] Fatal error during startup', err);
  process.exit(1);
});
