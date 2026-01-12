/**
 * ConnectorAction Node Handler Tests
 *
 * Validates default non-throwing behavior and optional strict mode (failOnNon2xx).
 */

import { ConnectorAction } from '../ConnectorAction';
import type { ConnectorActionParams } from '@/types/node-parameters';
import type { HostRuntime } from '@/types/node-handler';

describe('ConnectorAction Node Handler', () => {
  let hostRuntime: HostRuntime;
  let connectorActionMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    connectorActionMock = jest.fn(async ({ connector, action, args, timeoutMs }) => ({
      status: 200,
      statusText: 'OK',
      headers: {},
      body: { ok: true, connector, action, args, timeoutMs },
      url: `connector://${String(connector)}/${String(action)}`,
    }));

    hostRuntime = {
      http: jest.fn() as HostRuntime['http'],
      connectorAction: connectorActionMock as HostRuntime['connectorAction'],
    };
  });

  it('does not throw on non-2xx by default', async () => {
    const params: ConnectorActionParams = {
      connector: 'starships',
      action: 'GET /api/v1/foo',
    };

    connectorActionMock.mockResolvedValueOnce({
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      body: { success: false, error: { message: 'Validation failed' } },
      url: 'connector://starships/GET /api/v1/foo',
    });

    const node = new ConnectorAction(params, { hostRuntime });
    const result = await node.execute();

    expect(result).toHaveLength(1);
    expect(result[0].json).toEqual(
      expect.objectContaining({
        status: 400,
        statusText: 'Bad Request',
        body: { success: false, error: { message: 'Validation failed' } },
      })
    );
  });

  it('throws on non-2xx when failOnNon2xx is enabled (prefers body.error.message)', async () => {
    const params: ConnectorActionParams = {
      connector: 'starships',
      action: 'POST /api/v1/foo',
      failOnNon2xx: true,
    };

    connectorActionMock.mockResolvedValueOnce({
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      body: { success: false, error: { message: 'Unauthorized' } },
      url: 'connector://starships/POST /api/v1/foo',
    });

    const node = new ConnectorAction(params, { hostRuntime });
    await expect(node.execute()).rejects.toThrow('Unauthorized');
  });

  it('throws on non-2xx when failOnNon2xx is enabled (falls back to generic message)', async () => {
    const params: ConnectorActionParams = {
      connector: 'starships',
      action: 'GET /api/v1/foo',
      failOnNon2xx: true,
    };

    connectorActionMock.mockResolvedValueOnce({
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      body: 'oops',
      url: 'connector://starships/GET /api/v1/foo',
    });

    const node = new ConnectorAction(params, { hostRuntime });
    await expect(node.execute()).rejects.toThrow('Request failed (500)');
  });
});

