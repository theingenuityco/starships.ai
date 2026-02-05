import { Worker } from 'bullmq';
import { getEnvConfig } from '@starships/env';
import { createConnection, AutopilotAwaitFiringRepository, AutopilotAwaitRepository, ConnectorEventRepository } from '@starships/models';
import { autopilot, ExecutionItemUtils, RunnerFactory, type AutopilotEvent } from '@starships/autopilot';
import type { Blueprint, Execution, ExecutionEvent, ExecutionEventType, UIActionEvent } from '@starships/autopilot';
import type { AutopilotAwaitSpec, ConnectorEventModel } from '@starships/protocol';
import { buildAutopilotExecutionBundle } from '@/services/autopilot-execution-bundle';
import { extractPersistableState } from '@/utils/conversation-state';
import {
  AUTOPILOT_AUTOMATION_QUEUE_NAME,
  type AutopilotAutomationJobData,
  closeAutopilotAutomationQueue,
} from '@/queues/autopilotAutomationQueue';
import { getRedisConnection } from '@/queues/scheduledRunsQueue';

const AWAIT_UI_ACTION = 'await.connector_event';

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

      const execution: Execution = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle(connectorEventEnvelope));
      execution.state = (aw.stateJson && typeof aw.stateJson === 'object' ? aw.stateJson : {}) as Record<string, unknown>;

      let latestState: Record<string, unknown> | null = null;
      let awaitSpecFromUi: AutopilotAwaitSpec | null = null;

      const eventCallback = async (event: AutopilotEvent): Promise<void> => {
        try {
          if (event.type === 'ui_action') {
            const evt = event as UIActionEvent;
            const action = String(evt.data?.action || '').trim();
            if (action !== AWAIT_UI_ACTION) return;
            const payload = evt.data?.payload;
            awaitSpecFromUi = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as AutopilotAwaitSpec) : {};
            return;
          }

          // Capture execution snapshots (for state checkpointing)
          const exec = getExecutionFromEvent(event);
          const state = exec?.state;
          if (state && typeof state === 'object') {
            latestState = state as Record<string, unknown>;
          }
        } catch {
          // best-effort
        }
      };

      try {
        const runner = RunnerFactory.getTopLevelRunner(0);
        await runner.run(aw.blueprintJson as unknown as Blueprint, execution, {
          ...engineConfig,
          eventCallback,
          failOnNodeError: true,
        });

        // Mark connector event processed (best-effort)
        try {
          await eventRepo.markProcessed(evt.id, new Date().toISOString());
        } catch {
          // ignore
        }

        if (awaitSpecFromUi) {
          // Recurring: create a new await and complete the current one.
          const persistedState = extractPersistableState(latestState ?? (execution.state as Record<string, unknown>)) ?? null;

          const next = await awaitRepo.create({
            starshipId: aw.starshipId,
            ownerUserId,
            status: 'waiting',
            specJson: awaitSpecFromUi,
            blueprintJson: aw.blueprintJson,
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
    } catch {}
    try {
      await closeAutopilotAutomationQueue();
    } catch {}
    try {
      await connection.disconnect();
    } catch {}
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[AutopilotAutomationResumeWorker] Fatal error during startup', err);
  process.exit(1);
});

