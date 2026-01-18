import { UIAction } from '@/nodes/UIAction';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { NodeHandlerOptions } from '@/types/node-handler';

describe('UIAction Node', () => {
  test('emits UIActionEvent with action+payload and returns {action,payload}', async () => {
    const exec = ExecutionItemUtils.createExecution();
    const eventCallback = jest.fn(async () => {});

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
    const evt = (eventCallback as any).mock.calls[0][0];
    expect(evt?.type).toBe('ui_action');
    expect(evt?.data?.action).toBe('onboarding_connectors');
    expect(evt?.data?.payload).toEqual({ providers: ['github', 'slack'] });
  });

  test('validates required action', () => {
    const node = new UIAction({ action: '' } as any, {} as NodeHandlerOptions);
    const v = node.validate();
    expect(v.valid).toBe(false);
  });
});

