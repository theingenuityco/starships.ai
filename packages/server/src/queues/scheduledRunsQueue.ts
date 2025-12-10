import { Queue } from 'bullmq';
import { getEnvConfig } from '@starships/env';

export const SCHEDULED_RUNS_QUEUE_NAME = 'scheduled-runs';

export interface ScheduledRunJobData {
  scheduleId: string;
  starshipId: string;
  agentId: string;
  prompt: string;
  timezone?: string | null;
}

let queueInstance: Queue<ScheduledRunJobData> | null = null;

function getRedisConnection() {
  const env = getEnvConfig();

  if (!env.REDIS_URL) {
    throw new Error('[ScheduledRunsQueue] REDIS_URL is not configured. Please set REDIS_URL in the environment to enable scheduling.');
  }

  return {
    url: env.REDIS_URL,
  };
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
