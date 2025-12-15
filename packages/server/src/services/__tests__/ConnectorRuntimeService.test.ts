import { ConnectorRuntimeService } from '../ConnectorRuntimeService';

// ---- Mocks ----
const listTemplatesMock = jest.fn();
const findConnectorMock = jest.fn();

jest.mock('@starships/models', () => {
  return {
    ConnectorTemplateRepository: class {
      list = listTemplatesMock;
    },
    ConnectorRepository: class {
      findByStarshipAndProvider = findConnectorMock;
    },
  };
});

const getDecryptedSecretsMock = jest.fn();
jest.mock('../ConnectorSecretService', () => {
  return {
    ConnectorSecretService: class {
      getDecryptedSecrets = getDecryptedSecretsMock;
    },
  };
});

const getPlatformSecretMock = jest.fn();
jest.mock('../PlatformSecretService', () => {
  return {
    PlatformSecretService: class {
      getSecret = getPlatformSecretMock;
    },
  };
});

jest.mock('@starships/env', () => {
  return {
    getEnvConfig: () => ({
      SERVER_URL: 'http://localhost:3000',
      PUBLIC_URL: 'http://localhost:3000',
    }),
  };
});

describe('ConnectorRuntimeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves oauth.accessToken from platform_secret object ref', async () => {
    listTemplatesMock.mockResolvedValue([
      {
        provider: 'discord',
        runtimeConfig: {
          apiBaseUrl: 'https://discord.com',
          oauth: {
            accessToken: { type: 'platform_secret', key: 'DISCORD_BOT_TOKEN' },
            authPrefix: 'Bot',
          },
        },
      },
    ]);
    getDecryptedSecretsMock.mockResolvedValue({});
    getPlatformSecretMock.mockResolvedValue('secret123');
    findConnectorMock.mockResolvedValue({ status: 'connected' });

    const svc = new ConnectorRuntimeService();
    const out = await svc.buildConnectorHttpConfig('starship-1', 'user-1');

    expect(getPlatformSecretMock).toHaveBeenCalledWith('DISCORD_BOT_TOKEN');
    expect(out.discord).toEqual({
      baseUrl: 'https://discord.com',
      headers: {
        Authorization: 'Bot secret123',
      },
    });
  });

  it('resolves oauth.accessToken from connector_secret object ref', async () => {
    listTemplatesMock.mockResolvedValue([
      {
        provider: 'github',
        runtimeConfig: {
          apiBaseUrl: 'https://api.github.com',
          oauth: {
            accessToken: { type: 'connector_secret', key: 'GH_APP_ACCESS_TOKEN' },
            authPrefix: 'Bearer',
          },
        },
      },
    ]);
    getDecryptedSecretsMock.mockResolvedValue({ GH_APP_ACCESS_TOKEN: 'tok_abc' });
    findConnectorMock.mockResolvedValue({ status: 'connected' });

    const svc = new ConnectorRuntimeService();
    const out = await svc.buildConnectorHttpConfig('starship-1', 'user-1');

    expect(out.github).toEqual({
      baseUrl: 'https://api.github.com',
      headers: {
        Authorization: 'Bearer tok_abc',
      },
    });
  });

  it('keeps supporting legacy "platform:" string refs', async () => {
    listTemplatesMock.mockResolvedValue([
      {
        provider: 'discord',
        runtimeConfig: {
          apiBaseUrl: 'https://discord.com',
          oauth: {
            accessToken: 'platform:DISCORD_BOT_TOKEN',
            authPrefix: 'Bot',
          },
        },
      },
    ]);
    getDecryptedSecretsMock.mockResolvedValue({});
    getPlatformSecretMock.mockResolvedValue('secret123');
    findConnectorMock.mockResolvedValue({ status: 'connected' });

    const svc = new ConnectorRuntimeService();
    const out = await svc.buildConnectorHttpConfig('starship-1', 'user-1');

    expect(getPlatformSecretMock).toHaveBeenCalledWith('DISCORD_BOT_TOKEN');
    expect(out.discord?.headers.Authorization).toBe('Bot secret123');
  });
});


