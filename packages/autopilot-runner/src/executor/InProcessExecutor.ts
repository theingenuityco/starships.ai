import { Executor, ExecuteInput } from './Executor';
import { Engine } from '@starships/autopilot/dist/engine/Engine';

export class InProcessExecutor implements Executor {
  async execute(input: ExecuteInput): Promise<unknown> {
    const blueprint = JSON.parse(input.blueprintJson || '{}');
    const execution = JSON.parse(input.executionJson || '{}');
    const config = JSON.parse(input.configJson || '{}');

    const engine = new Engine({
      ...(config || {}),
      eventCallback: input.onEvent
        ? async (event: unknown) => {
            try {
              await input.onEvent?.({ type: 'event', data: event });
            } catch {}
          }
        : undefined,
      failOnNodeError: config?.failOnNodeError ?? true,
    });

    const result = await engine.executeBlueprint(blueprint, execution);
    return result;
  }
}
