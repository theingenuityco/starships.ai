import { UIAction } from '@/nodes/UIAction';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { NodeHandlerOptions } from '@/types/node-handler';
import type { EventCallback } from '@/types/events';

describe('UIAction Node', () => {
  test('emits UIActionEvent with action+payload and returns {action,payload}', async () => {
    const exec = ExecutionItemUtils.createExecution();
    const eventCallback: jest.MockedFunction<EventCallback> = jest.fn(async (event) => {
      void event;
    });

    const node = new UIAction(
      { action: 'onboarding_connectors', payload: { providers: ['github', 'slack'] } },
      { execution: exec, eventCallback } as unknown as NodeHandlerOptions
    );

    const out = await node.execute(ExecutionItemUtils.wrapSingle({}));
    expect(ExecutionItemUtils.unwrapSingle(out)).toEqual({
      action: 'onboarding_connectors',
      payload: { providers: ['github', 'slack'] },
    });

    expect(eventCallback).toHaveBeenCalledTimes(1);
    const evt = eventCallback.mock.calls[0]?.[0];
    expect(evt?.type).toBe('ui_action');
    if (evt?.type !== 'ui_action') throw new Error(`Expected ui_action event but got ${evt?.type ?? 'undefined'}`);
    expect(evt?.data?.action).toBe('onboarding_connectors');
    expect(evt?.data?.payload).toEqual({ providers: ['github', 'slack'] });
  });

  test('validates required action', () => {
    const node = new UIAction({ action: '' }, {} as NodeHandlerOptions);
    const v = node.validate();
    expect(v.valid).toBe(false);
  });
});

