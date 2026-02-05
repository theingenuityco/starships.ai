import { Worker } from 'bullmq';
import { getEnvConfig } from '@starships/env';
import { createConnection, AutopilotAwaitRepository } from '@starships/models';
import { autopilot, ExecutionItemUtils, RunnerFactory, type AutopilotEvent } from '@starships/autopilot';
import type { Execution, ExecutionEvent, ExecutionEventType } from '@starships/autopilot';
import type { AutopilotAwaitConnectorEventSpec, AutopilotAwaitRequest } from '@starships/protocol';
import { buildAutopilotExecutionBundle } from '@/services/autopilot-execution-bundle';
import { extractPersistableState } from '@/utils/conversation-state';
import {
  AUTOPILOT_AUTOMATION_QUEUE_NAME,
  type AutopilotAutomationJobData,
  closeAutopilotAutomationQueue,
} from '@/queues/autopilotAutomationQueue';
import { getRedisConnection } from '@/queues/scheduledRunsQueue';

const EXECUTION_EVENT_TYPES: ReadonlySet<ExecutionEventType> = new Set([
  'workflow_started',
  'node_started',
  'node_completed',
  'node_failed',
  'workflow_paused',
  'workflow_resumed',
  'workflow_completed',
  'workflow_failed',
]);

function getExecutionFromEvent(event: AutopilotEvent): Execution | undefined {
  if (!EXECUTION_EVENT_TYPES.has(event.type as ExecutionEventType)) return undefined;
  const evt = event as ExecutionEvent;
  const exec = evt.data?.execution;
  return exec && typeof exec === 'object' ? exec : undefined;
}

type ConnectorEventAwaitRequest = {
  kind: 'connector_event';
  nodeRef: string;
  spec: AutopilotAwaitConnectorEventSpec;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function main(): Promise<void> {
  const env = getEnvConfig();

  autopilot.setRunnerConfig({
    url: env.RUNNER_URL,
    token: env.RUNNER_AUTH_TOKEN,
  });

  if (!process.env.RUNNER_URL) {
    throw new Error('[AutopilotAutomationWorker] RUNNER_URL is required (headless automation requires remote runner)');
  }

  const connection = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });
  await connection.connect();

  const awaitRepo = new AutopilotAwaitRepository();

  const worker = new Worker<AutopilotAutomationJobData>(
    AUTOPILOT_AUTOMATION_QUEUE_NAME,
    async (job) => {
      const data = job.data;
      if (!data || data.kind !== 'run') {
        return;
      }

      const runtimeEnv: Record<string, unknown> = {
        STARSHIP_ID: data.starshipId,
        SERVER_URL: env.SERVER_URL,
      };

      const { engineConfig } = await buildAutopilotExecutionBundle({
        starshipId: data.starshipId,
        authUserId: data.ownerUserId,
        runtimeEnv,
      });

      const initial = data.initialInput && typeof data.initialInput === 'object' ? data.initialInput : null;
      const execution: Execution = initial
        ? ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle(initial))
        : ExecutionItemUtils.createExecution();

      if (data.state && typeof data.state === 'object') {
        execution.state = data.state as Record<string, unknown>;
      }

      const capture: {
        awaitRequest?: ConnectorEventAwaitRequest;
        pausedExecution?: Execution;
      } = {};

      const eventCallback = async (event: AutopilotEvent): Promise<void> => {
        try {
          if (event.type === 'await_requested') {
            const data = (event as { data?: unknown }).data;
            if (!isPlainObject(data)) return;
            const nodeRef = data.nodeRef;
            const kind = data.kind;
            const spec = data.spec;
            if (kind !== 'connector_event') return;
            if (typeof nodeRef !== 'string' || nodeRef.trim().length === 0) return;
            if (!isPlainObject(spec)) return;
            capture.awaitRequest = { kind: 'connector_event', nodeRef: nodeRef.trim(), spec: spec as AutopilotAwaitConnectorEventSpec };
            return;
          }

          const exec = getExecutionFromEvent(event);
          if (event.type === 'workflow_paused' && exec) {
            capture.pausedExecution = exec;
          }
        } catch {
          // best-effort
        }
      };

      const runner = RunnerFactory.getTopLevelRunner(0);
      await runner.run(data.blueprint, execution, {
        ...engineConfig,
        eventCallback,
        failOnNodeError: true,
      });

      const awaitRequest = capture.awaitRequest;
      const pausedExecution = capture.pausedExecution;
      if (awaitRequest && pausedExecution) {
        const persistedState = extractPersistableState(pausedExecution.state as Record<string, unknown>) ?? {};
        const executionSnapshot = JSON.parse(JSON.stringify(pausedExecution)) as Execution;
        executionSnapshot.state = persistedState;

        const specJson: AutopilotAwaitRequest = { kind: 'connector_event', nodeRef: awaitRequest.nodeRef, spec: awaitRequest.spec };

        await awaitRepo.create({
          starshipId: data.starshipId,
          ownerUserId: data.ownerUserId,
          status: 'waiting',
          specJson,
          blueprintJson: data.blueprint,
          executionJson: executionSnapshot,
          stateJson: persistedState,
          expiresAt: null,
          lastError: null,
        });
      }
    },
    {
      connection: getRedisConnection(),
      prefix: 'starships',
    }
  );

  worker.on('error', (err) => {
    console.error('[AutopilotAutomationWorker] Worker error', err);
  });
  worker.on('failed', (job, err) => {
    console.error('[AutopilotAutomationWorker] Job failed', {
      jobId: job?.id,
      name: job?.name,
      err: err instanceof Error ? err.message : String(err),
    });
  });

  const shutdown = async () => {
    console.log('[AutopilotAutomationWorker] Shutting down...');
    try {
      await worker.close();
    } catch (err) {
      console.error('[AutopilotAutomationWorker] Failed to close worker', err);
    }
    try {
      await closeAutopilotAutomationQueue();
    } catch (err) {
      console.error('[AutopilotAutomationWorker] Failed to close queue', err);
    }
    try {
      await connection.disconnect();
    } catch (err) {
      console.error('[AutopilotAutomationWorker] Failed to disconnect DB', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[AutopilotAutomationWorker] Fatal error during startup', err);
  process.exit(1);
});

