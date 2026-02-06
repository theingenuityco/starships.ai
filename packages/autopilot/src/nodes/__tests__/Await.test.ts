import { Await } from '@/nodes/Await';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { NodeHandlerOptions } from '@/types/node-handler';
import type { EventCallback } from '@/types/events';

describe('Await Node', () => {
  test('emits await_requested and pauses execution', async () => {
    const exec = ExecutionItemUtils.createExecution();
    exec.status = 'running';
    exec.currentNodeRef = 'aw';

    const eventCallback: jest.MockedFunction<EventCallback> = jest.fn(async (event) => {
      void event;
    });

    const node = new Await({ kind: 'connector_event', spec: { provider: 'slack', eventTypes: ['message.created'] } }, {
      execution: exec,
      eventCallback,
    } as unknown as NodeHandlerOptions);

    const out = await node.execute(ExecutionItemUtils.wrapSingle({}));
    expect(exec.status).toBe('paused');
    expect(ExecutionItemUtils.unwrapSingle(out)).toEqual({
      kind: 'connector_event',
      spec: { provider: 'slack', eventTypes: ['message.created'] },
    });

    expect(eventCallback).toHaveBeenCalledTimes(1);
    const evt = eventCallback.mock.calls[0]?.[0];
    expect(evt?.type).toBe('await_requested');
    if (evt?.type !== 'await_requested') throw new Error(`Expected await_requested but got ${evt?.type ?? 'undefined'}`);
    expect(evt.data.kind).toBe('connector_event');
    expect(evt.data.nodeRef).toBe('aw');
  });

  test('validates kind + spec', () => {
    const node = new Await({ kind: 'connector_event', spec: {} }, {} as NodeHandlerOptions);
    const v = node.validate();
    expect(v.valid).toBe(true);
  });
});
