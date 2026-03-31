import { Queue } from 'bullmq';
import { getRedisConnection } from './scheduledRunsQueue';

export const HEARTBEAT_QUEUE_NAME = 'heartbeat-runs';

export interface HeartbeatJobData {
  heartbeatConfigId: string;
  roomConversationId: string;
  starshipId: string;
  agentId: string;
  prompt: string;
  ackMaxChars: number;
  ownerUserId: string;
  lastConversationId?: string | null;
  lastAlertText?: string | null;
  lastAlertAt?: string | null;
}

let queueInstance: Queue<HeartbeatJobData> | null = null;

export function getHeartbeatQueue(): Queue<HeartbeatJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<HeartbeatJobData>(HEARTBEAT_QUEUE_NAME, {
      connection: getRedisConnection(),
      prefix: 'starships',
    });
  }

  return queueInstance;
}

export async function closeHeartbeatQueue(): Promise<void> {
  if (queueInstance) {
    try {
      await queueInstance.close();
    } catch (err) {
      console.error('[HeartbeatQueue] Failed to close queue', err);
    } finally {
      queueInstance = null;
    }
  }
}
