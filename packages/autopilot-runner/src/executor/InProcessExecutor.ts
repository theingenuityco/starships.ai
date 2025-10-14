import { Executor, ExecuteInput } from './Executor';
import { Engine } from '@starships/autopilot';

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
              // eslint-disable-next-line no-console
              console.log('[InProcessExecutor] Forwarding event', {
                type: (event as any)?.type,
                depth: (event as any)?.executionDepth,
              });
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

    // eslint-disable-next-line no-console
    console.log('[InProcessExecutor] Executing blueprint');
    const result = await engine.executeBlueprint(blueprint, execution);
    // eslint-disable-next-line no-console
    console.log('[InProcessExecutor] Execution finished');
    return result;
  }
}
