import { ConnectorEventIngestionService } from '@/services/ConnectorEventIngestionService';
import { getAutopilotAutomationQueue } from '@/queues/autopilotAutomationQueue';

jest.mock('@/queues/autopilotAutomationQueue', () => ({
  getAutopilotAutomationQueue: jest.fn(() => ({
    add: jest.fn(),
  })),
}));

describe('ConnectorEventIngestionService (global webhooks)', () => {
  it('fans out to all routed connectors and enqueues resumes', async () => {
    const svc = new ConnectorEventIngestionService();

    const templateRepo = {
      findByProvider: jest.fn(async () => ({
        webhooksJson: {
          routing: { externalAccountId: { jsonPointer: '/externalAccountId' } },
        },
      })),
    };
    const bindingRepo = {
      listConnectorIds: jest.fn(async () => ['c1', 'c2']),
    };
    const connectorRepo = {
      findByIds: jest.fn(async () => [
        { id: 'c1', starshipId: 's1', provider: 'provider' },
        { id: 'c2', starshipId: 's2', provider: 'provider' },
      ]),
    };
    const connectorEventRepo = {
      createOrGetByExternalId: jest
        .fn()
        .mockResolvedValueOnce({ id: 'e1' })
        .mockResolvedValueOnce({ id: 'e2' }),
    };
    const awaitRepo = {
      findWaitingMatches: jest.fn(async (args: { connectorId: string }) => {
        return args.connectorId === 'c1' ? [{ id: 'a1' }] : [{ id: 'a2' }];
      }),
    };
    const awaitFiringRepo = {
      createOrIgnore: jest.fn(async (args: { awaitId: string }) => ({ id: `f_${args.awaitId}` })),
    };

    // Monkeypatch internals (private fields/methods).
    const anySvc = svc as unknown as Record<string, unknown>;
    anySvc.templateRepo = templateRepo;
    anySvc.bindingRepo = bindingRepo;
    anySvc.connectorRepo = connectorRepo;
    anySvc.connectorEventRepo = connectorEventRepo;
    anySvc.awaitRepo = awaitRepo;
    anySvc.awaitFiringRepo = awaitFiringRepo;
    anySvc.verifyWebhook = jest.fn(async () => undefined);

    const req = {
      body: Buffer.from(JSON.stringify({ externalAccountId: 'ext-1' })),
      headers: {},
      get: (_name: string) => '',
    };

    const res = await svc.ingestConnectorWebhook({ provider: 'provider', req: req as any });

    const queue = (getAutopilotAutomationQueue as unknown as jest.Mock).mock.results?.[0]?.value;
    expect(queue?.add).toHaveBeenCalledTimes(2);

    expect(templateRepo.findByProvider).toHaveBeenCalled();
    expect(bindingRepo.listConnectorIds).toHaveBeenCalledWith('provider', 'ext-1');
    expect(connectorRepo.findByIds).toHaveBeenCalledWith(['c1', 'c2']);
    expect(connectorEventRepo.createOrGetByExternalId).toHaveBeenCalledTimes(2);
    expect(awaitRepo.findWaitingMatches).toHaveBeenCalledTimes(2);
    expect(awaitFiringRepo.createOrIgnore).toHaveBeenCalledTimes(2);

    expect(res.externalAccountId).toBe('ext-1');
    expect(res.routedConnectorIds).toEqual(['c1', 'c2']);
    expect(res.connectorEventIds).toEqual(['e1', 'e2']);
    expect(res.matchedAwaitIds.sort()).toEqual(['a1', 'a2']);
    expect(res.enqueuedFiringIds.sort()).toEqual(['f_a1', 'f_a2']);
  });
});

