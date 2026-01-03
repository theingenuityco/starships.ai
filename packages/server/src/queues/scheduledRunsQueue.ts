import { Queue } from 'bullmq';
import { getEnvConfig } from '@starships/env';

export const SCHEDULED_RUNS_QUEUE_NAME = 'scheduled-runs';

export interface ScheduledRunJobData {
  scheduleId: string;
  starshipId: string;
  agentId: string;
  prompt: string;
  timezone?: string | null;
  /**
   * The user who owns/created this schedule. Used by the worker
   * to mint a JWT and execute the scheduled run under that user's
   * authentication context.
   */
  ownerUserId: string;
}

let queueInstance: Queue<ScheduledRunJobData> | null = null;

export function getRedisConnection() {
  const env = getEnvConfig();

  if (!env.REDIS_HOST) {
    throw new Error(
      '[ScheduledRunsQueue] REDIS_HOST is not configured. Please set REDIS_HOST and REDIS_PORT (and optionally REDIS_DB, REDIS_PASSWORD).'
    );
  }

  const port = typeof env.REDIS_PORT === 'number' && !Number.isNaN(env.REDIS_PORT) ? env.REDIS_PORT : 6379;

  const connection: Record<string, unknown> = {
    host: env.REDIS_HOST,
    port,
  };

  if (typeof env.REDIS_DB === 'number' && !Number.isNaN(env.REDIS_DB)) {
    connection.db = env.REDIS_DB;
  }

  if (env.REDIS_PASSWORD) {
    connection.password = env.REDIS_PASSWORD;
  }

  return connection;
}

export function getScheduledRunsQueue(): Queue<ScheduledRunJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<ScheduledRunJobData>(SCHEDULED_RUNS_QUEUE_NAME, {
      connection: getRedisConnection(),
      // Namespacing jobs per-environment via prefix keeps dev/prod queues isolated
      // while still allowing a single Redis instance if desired.
      prefix: 'starships',
    });
  }

  return queueInstance;
}

/**
 * Gracefully close the shared scheduled runs queue and its Redis connection.
 * Safe to call multiple times.
 */
export async function closeScheduledRunsQueue(): Promise<void> {
  if (queueInstance) {
    try {
      await queueInstance.close();
    } catch (err) {
       
      console.error('[ScheduledRunsQueue] Failed to close queue', err);
    } finally {
      queueInstance = null;
    }
  }
}
