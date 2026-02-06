import { Worker } from 'bullmq';
import { getEnvConfig } from '@starships/env';
import { createConnection, AutopilotAwaitFiringRepository, AutopilotAwaitRepository, ConnectorEventRepository } from '@starships/models';
import { autopilot, RunnerFactory, type AutopilotEvent } from '@starships/autopilot';
import type { Blueprint, Execution, ExecutionEvent, ExecutionEventType, ExecutionItem } from '@starships/autopilot';
import type { AutopilotAwaitConnectorEventSpec, AutopilotAwaitRequest, ConnectorEventModel } from '@starships/protocol';
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

type ResumeConnectorEvent = Pick<
  ConnectorEventModel,
  'id' | 'starshipId' | 'connectorId' | 'provider' | 'eventType' | 'externalEventId' | 'receivedAt' | 'payloadJson'
>;

type ConnectorEventAwaitRequest = {
  kind: 'connector_event';
  nodeRef: string;
  spec: AutopilotAwaitConnectorEventSpec;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function upsertNodeResult(execution: Execution, nodeRef: string, items: ExecutionItem[]): void {
  const normalizedItems: ExecutionItem[] = items.map((i) => ({ json: i.json, pairedItem: i.pairedItem, error: i.error }));
  for (let i = execution.results.length - 1; i >= 0; i--) {
    if (execution.results[i]?.nodeRef === nodeRef) {
      execution.results[i] = { nodeRef, items: normalizedItems };
      return;
    }
  }
  execution.results.push({ nodeRef, items: normalizedItems });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const ms = Number.isFinite(timeoutMs) ? Math.floor(timeoutMs) : 0;
  if (ms <= 0) return promise;

  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function main(): Promise<void> {
  const env = getEnvConfig();

  // Configure remote runner (required for headless automation).
  autopilot.setRunnerConfig({
    url: env.RUNNER_URL,
    token: env.RUNNER_AUTH_TOKEN,
  });

  if (!process.env.RUNNER_URL) {
    throw new Error('[AutopilotAutomationResumeWorker] RUNNER_URL is required (headless automation requires remote runner)');
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
  const firingRepo = new AutopilotAwaitFiringRepository();
  const eventRepo = new ConnectorEventRepository();

  const worker = new Worker<AutopilotAutomationJobData>(
    AUTOPILOT_AUTOMATION_QUEUE_NAME,
    async (job) => {
      const data = job.data;
      if (!data || data.kind !== 'resume') {
        return;
      }

      const firing = await firingRepo.findById(data.awaitFiringId);
      if (!firing) {
        throw new Error(`Await firing not found: ${data.awaitFiringId}`);
      }
      if (firing.status === 'completed' || firing.status === 'cancelled') {
        return;
      }

      const aw = await awaitRepo.findById(firing.awaitId);
      if (!aw) {
        throw new Error(`Await not found: ${firing.awaitId}`);
      }

      const evt = await eventRepo.findById(firing.connectorEventId);
      if (!evt) {
        throw new Error(`Connector event not found: ${firing.connectorEventId}`);
      }

      const ownerUserId = aw.ownerUserId;
      if (!ownerUserId) {
        throw new Error(`Await ${aw.id} has no ownerUserId; cannot build connector sessions safely`);
      }

      await firingRepo.update(firing.id, { status: 'running', startedAt: new Date().toISOString(), error: null });
      await awaitRepo.update(aw.id, { status: 'resuming', lastError: null });

      const runtimeEnv: Record<string, unknown> = {
        STARSHIP_ID: aw.starshipId,
        SERVER_URL: env.SERVER_URL,
      };

      const { engineConfig } = await buildAutopilotExecutionBundle({
        starshipId: aw.starshipId,
        authUserId: ownerUserId,
        runtimeEnv,
      });

      const connectorEventEnvelope: ResumeConnectorEvent = {
        id: evt.id,
        starshipId: evt.starshipId,
        connectorId: evt.connectorId,
        provider: evt.provider,
        eventType: evt.eventType,
        externalEventId: evt.externalEventId ?? null,
        receivedAt: evt.receivedAt,
        payloadJson: evt.payloadJson ?? {},
      };

      const req = aw.specJson as AutopilotAwaitRequest;
      if (req.kind !== 'connector_event') {
        throw new Error(`Unsupported await kind: ${(req as { kind?: unknown }).kind ?? 'unknown'}`);
      }
      if (!req.nodeRef) {
        throw new Error(`Await ${aw.id} is missing nodeRef`);
      }

      const execution: Execution = aw.executionJson as unknown as Execution;
      upsertNodeResult(execution, req.nodeRef, [{ json: connectorEventEnvelope }]);

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

          // Capture execution snapshots (for state checkpointing)
          const exec = getExecutionFromEvent(event);
          if (event.type === 'workflow_paused' && exec) {
            capture.pausedExecution = exec;
          }
        } catch {
          // best-effort
        }
      };

      try {
        const runner = RunnerFactory.getTopLevelRunner(0);
        const executionTimeoutMs = process.env.AUTOPILOT_EXECUTION_TIMEOUT_MS
          ? parseInt(process.env.AUTOPILOT_EXECUTION_TIMEOUT_MS, 10)
          : 10 * 60_000; // 10 minutes

        await withTimeout(
          runner.run(aw.blueprintJson as unknown as Blueprint, execution, {
          ...engineConfig,
          eventCallback,
          failOnNodeError: true,
          }),
          executionTimeoutMs,
          'Autopilot execution'
        );

        // Mark connector event processed (best-effort)
        try {
          await eventRepo.markProcessed(evt.id, new Date().toISOString());
        } catch {
          // ignore
        }

        const awaitRequest = capture.awaitRequest;
        const pausedExecution = capture.pausedExecution;
        if (awaitRequest && pausedExecution) {
          // Paused again: create a new await and complete the current one.
          const persistedState = extractPersistableState(pausedExecution.state as Record<string, unknown>) ?? {};
          const executionSnapshot = JSON.parse(JSON.stringify(pausedExecution)) as Execution;
          executionSnapshot.state = persistedState;

          const specJson: AutopilotAwaitRequest = { kind: 'connector_event', nodeRef: awaitRequest.nodeRef, spec: awaitRequest.spec };

          const next = await awaitRepo.create({
            starshipId: aw.starshipId,
            ownerUserId,
            status: 'waiting',
            specJson,
            blueprintJson: aw.blueprintJson,
            executionJson: executionSnapshot,
            stateJson: persistedState,
            expiresAt: null,
            lastError: null,
          });

          await awaitRepo.update(aw.id, { status: 'completed', lastError: null });
          await firingRepo.update(firing.id, { status: 'completed', completedAt: new Date().toISOString(), error: null });

          void next;
          return;
        }

        // Completed (no new await requested)
        await awaitRepo.update(aw.id, { status: 'completed', lastError: null });
        await firingRepo.update(firing.id, { status: 'completed', completedAt: new Date().toISOString(), error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await awaitRepo.update(aw.id, { status: 'failed', lastError: msg });
        await firingRepo.update(firing.id, { status: 'failed', completedAt: new Date().toISOString(), error: msg });
        throw err;
      }
    },
    {
      connection: getRedisConnection(),
      prefix: 'starships',
    }
  );

  worker.on('error', (err) => {
    console.error('[AutopilotAutomationResumeWorker] Worker error', err);
  });
  worker.on('failed', (job, err) => {
    console.error('[AutopilotAutomationResumeWorker] Job failed', {
      jobId: job?.id,
      name: job?.name,
      err: err instanceof Error ? err.message : String(err),
    });
  });

  const shutdown = async () => {
    console.log('[AutopilotAutomationResumeWorker] Shutting down...');
    try {
      await worker.close();
    } catch (err) {
      console.error('[AutopilotAutomationResumeWorker] Failed to close worker', err);
    }
    try {
      await closeAutopilotAutomationQueue();
    } catch (err) {
      console.error('[AutopilotAutomationResumeWorker] Failed to close queue', err);
    }
    try {
      await connection.disconnect();
    } catch (err) {
      console.error('[AutopilotAutomationResumeWorker] Failed to disconnect DB', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[AutopilotAutomationResumeWorker] Fatal error during startup', err);
  process.exit(1);
});
