import { Executor, ExecuteInput } from './Executor';
import { Engine } from '@starships/autopilot';
import { createRunnerHostRuntime } from '../hostRuntime/RunnerHostRuntime';

export class InProcessExecutor implements Executor {
  async execute(input: ExecuteInput): Promise<unknown> {
    const blueprint = JSON.parse(input.blueprintJson || '{}');
    const execution = JSON.parse(input.executionJson || '{}');
    const config = JSON.parse(input.configJson || '{}');

    const hostRuntime = createRunnerHostRuntime();

    const engine = new Engine({
      ...(config || {}),
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
      failOnNodeError: config?.failOnNodeError ?? true,
    });

    const result = await engine.executeBlueprint(blueprint, execution);

    return result;
  }
}
