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
       * Connector instance metadata (non-secret) passed from embedding host.
       * Used for template evaluation in baseUrl/mappings.
       */
      connectorMetadata?: Record<string, Record<string, unknown> | undefined>;
      /**
       * Optional LLM runtime configuration used by HostRuntime.llm. When set,
       * the runner does not need to read provider keys from its own env.
       */
      llm?: LlmRuntimeConfig;
      [key: string]: unknown;
    };

    // Extract host-runtime-only configuration. NOTE: runtimeEnv is explicitly
    // intended to be exposed to templates via env("KEY") and to user-authored
    // Code/Mutate nodes, but MUST NOT contain secrets.
    const { connectorTemplates, connectorSessions, connectorMetadata, llm, runtimeEnv, ...engineConfig } = rawConfig;

    const hostRuntime = createRunnerHostRuntime({
      connectorTemplates: connectorTemplates ?? {},
      connectorSessions: connectorSessions ?? {},
      connectorMetadata: connectorMetadata ?? {},
      runtimeEnv: runtimeEnv ?? {},
      llm,
    });

    const engine = new Engine({
      ...(engineConfig || {}),
      // Ensure env("...") templates resolve inside the Engine (Eval uses Engine.runtimeEnv).
      runtimeEnv: runtimeEnv ?? {},
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
