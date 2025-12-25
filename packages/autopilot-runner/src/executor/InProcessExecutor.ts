import { Executor, ExecuteInput } from './Executor';
import { Engine } from '@starships/autopilot';
import { createRunnerHostRuntime, type ConnectorSession, type LlmRuntimeConfig } from '../hostRuntime/RunnerHostRuntime';
import type { ConnectorTemplateRuntimeFieldsV2 } from '@starships/protocol';

export class InProcessExecutor implements Executor {
  async execute(input: ExecuteInput): Promise<unknown> {
    const blueprint = JSON.parse(input.blueprintJson || '{}');
    const execution = JSON.parse(input.executionJson || '{}');
    const rawConfig = JSON.parse(input.configJson || '{}') as {
      failOnNodeError?: boolean;
      runtimeEnv?: Record<string, unknown>;
      /**
       * Connector templates (safe) passed from embedding host.
       */
      connectorTemplates?: Record<string, ConnectorTemplateRuntimeFieldsV2 | undefined>;
      /**
       * Connector sessions (auth headers) passed from embedding host.
       */
      connectorSessions?: Record<string, ConnectorSession | undefined>;
      /**
       * Optional LLM runtime configuration used by HostRuntime.llm. When set,
       * the runner does not need to read provider keys from its own env.
       */
      llm?: LlmRuntimeConfig;
      [key: string]: unknown;
    };

    // Extract host-runtime-only configuration; do NOT expose this via Engine
    // runtimeEnv or execution state so secrets remain hidden from workflows.
    const { connectorTemplates, connectorSessions, llm, runtimeEnv, ...engineConfig } = rawConfig;

    const hostRuntime = createRunnerHostRuntime({
      connectorTemplates: connectorTemplates ?? {},
      connectorSessions: connectorSessions ?? {},
      runtimeEnv: runtimeEnv ?? {},
      llm,
    });

    const engine = new Engine({
      ...(engineConfig || {}),
      hostRuntime,
      eventCallback: input.onEvent
        ? async (event: unknown) => {
            try {
              await input.onEvent?.({ type: 'event', data: event });
            } catch (err) {
              console.error('[InProcessExecutor] Failed to forward event to onEvent handler', {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        : undefined,
      failOnNodeError: engineConfig.failOnNodeError ?? true,
    });

    const result = await engine.executeBlueprint(blueprint, execution);

    return result;
  }
}
