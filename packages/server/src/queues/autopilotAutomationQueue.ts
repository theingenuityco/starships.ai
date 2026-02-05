import { Queue } from 'bullmq';
import { getRedisConnection } from '@/queues/scheduledRunsQueue';
import type { Blueprint } from '@starships/autopilot';

export const AUTOPILOT_AUTOMATION_QUEUE_NAME = 'autopilot-automation';

export interface AutopilotAutomationResumeJobData {
  awaitFiringId: string;
}

export interface AutopilotAutomationRunJobData {
  starshipId: string;
  ownerUserId: string;
  /**
   * Serialized Autopilot Blueprint JSON.
   */
  blueprint: Blueprint;
  /**
   * Optional initial input injected as __initial__.
   */
  initialInput?: Record<string, unknown> | null;
  /**
   * Optional persisted execution state snapshot to seed execution.state.
   */
  state?: Record<string, unknown> | null;
}

export type AutopilotAutomationJobData =
  | ({ kind: 'resume' } & AutopilotAutomationResumeJobData)
  | ({ kind: 'run' } & AutopilotAutomationRunJobData);

let queueInstance: Queue<AutopilotAutomationJobData> | null = null;

export function getAutopilotAutomationQueue(): Queue<AutopilotAutomationJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<AutopilotAutomationJobData>(AUTOPILOT_AUTOMATION_QUEUE_NAME, {
      connection: getRedisConnection(),
      prefix: 'starships',
    });
  }
  return queueInstance;
}

export async function closeAutopilotAutomationQueue(): Promise<void> {
  if (queueInstance) {
    try {
      await queueInstance.close();
    } catch (err) {
      console.error('[AutopilotAutomationQueue] Failed to close queue', err);
    } finally {
      queueInstance = null;
    }
  }
}

