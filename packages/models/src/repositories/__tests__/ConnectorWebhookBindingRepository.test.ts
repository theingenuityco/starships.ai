import 'reflect-metadata';
import { ConnectorWebhookBindingRepository } from '../ConnectorWebhookBindingRepository';
import { ConnectorWebhookBindingEntity } from '@/entities/ConnectorWebhookBindingEntity';
import { DatabaseError } from '@starships/errors';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'binding-id-123'),
}));

jest.mock('@/helpers/database', () => ({
  getConnection: jest.fn(),
}));

jest.spyOn(ConnectorWebhookBindingEntity, 'validate').mockResolvedValue(undefined);

describe('ConnectorWebhookBindingRepository', () => {
  let repository: ConnectorWebhookBindingRepository;
  let testHelper: RepositoryTestHelper;

  beforeEach(() => {
    testHelper = new RepositoryTestHelper();
    repository = new ConnectorWebhookBindingRepository();
    testHelper.reset();
    jest.clearAllMocks();
  });

  it('lists bindings by provider and externalAccountId', async () => {
    const mockRows = [
      {
        id: 'b1',
        provider: 'provider',
        external_account_id: 'ext-1',
        connector_id: 'c1',
        starship_id: 's1',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'b2',
        provider: 'provider',
        external_account_id: 'ext-1',
        connector_id: 'c2',
        starship_id: 's2',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    ];
    testHelper.mockConnection.query.mockResolvedValue(mockRows);

    const res = await repository.listByProviderAndExternalAccountId('provider', 'ext-1');

    expect(testHelper.mockConnection.query).toHaveBeenCalled();
    expect(res).toHaveLength(2);
    expect(res[0]?.externalAccountId).toBe('ext-1');
    expect(res[1]?.connectorId).toBe('c2');
  });

  it('returns connector ids for a routing key', async () => {
    const mockRows = [
      {
        id: 'b1',
        provider: 'provider',
        external_account_id: 'ext-1',
        connector_id: 'c1',
        starship_id: 's1',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'b2',
        provider: 'provider',
        external_account_id: 'ext-1',
        connector_id: 'c2',
        starship_id: 's2',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    ];
    testHelper.mockConnection.query.mockResolvedValue(mockRows);

    const ids = await repository.listConnectorIds('provider', 'ext-1');
    expect(ids).toEqual(['c1', 'c2']);
  });

  it('upserts a binding (fanout supported)', async () => {
    const mockRow = {
      id: 'binding-id-123',
      provider: 'provider',
      external_account_id: 'ext-1',
      connector_id: 'c1',
      starship_id: 's1',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    };
    testHelper.mockConnection.queryOne.mockResolvedValue(mockRow);

    const res = await repository.upsert({ provider: 'provider', externalAccountId: 'ext-1', connectorId: 'c1', starshipId: 's1' });

    expect(testHelper.mockConnection.queryOne).toHaveBeenCalled();
    expect(res.externalAccountId).toBe('ext-1');
    expect(res.connectorId).toBe('c1');
  });

  it('validates required args', async () => {
    await expect(repository.listByProviderAndExternalAccountId('', 'x')).rejects.toThrow(DatabaseError);
    await expect(repository.listByProviderAndExternalAccountId('p', '')).rejects.toThrow(DatabaseError);
    await expect(
      repository.upsert({ provider: 'p', externalAccountId: '', connectorId: 'c', starshipId: 's' })
    ).rejects.toThrow(DatabaseError);
  });
});

