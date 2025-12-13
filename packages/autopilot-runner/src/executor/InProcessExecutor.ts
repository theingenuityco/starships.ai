import { Executor, ExecuteInput } from './Executor';
import { Engine } from '@starships/autopilot';
import { createRunnerHostRuntime, type ConnectorHttpConfig, type LlmRuntimeConfig } from '../hostRuntime/RunnerHostRuntime';

export class InProcessExecutor implements Executor {
  async execute(input: ExecuteInput): Promise<unknown> {
    const blueprint = JSON.parse(input.blueprintJson || '{}');
    const execution = JSON.parse(input.executionJson || '{}');
    const rawConfig = JSON.parse(input.configJson || '{}') as {
      failOnNodeError?: boolean;
      runtimeEnv?: Record<string, unknown>;
      /**
       * Optional connector HTTP configuration passed from the embedding host.
       * This is consumed ONLY by the runner HostRuntime and is never exposed
       * to workflows as runtimeEnv or execution state.
       */
      connectors?: Record<string, ConnectorHttpConfig | undefined>;
      /**
       * Optional LLM runtime configuration used by HostRuntime.llm. When set,
       * the runner does not need to read provider keys from its own env.
       */
      llm?: LlmRuntimeConfig;
      [key: string]: unknown;
    };

    // Extract host-runtime-only configuration; do NOT expose this via Engine
    // runtimeEnv or execution state so secrets remain hidden from workflows.
    const { connectors, llm, ...engineConfig } = rawConfig;

    const hostRuntime = createRunnerHostRuntime({
      connectors: connectors ?? {},
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
