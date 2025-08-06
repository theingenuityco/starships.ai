import { ConnectorConfigHistoryRepository } from '../../src/repositories/ConnectorConfigHistoryRepository';
import { ConnectorConfigHistory, ConnectorInstanceConfig } from '../../src/types';
import { getConnection } from '../../src/connection';

// Mock dependencies
jest.mock('../../src/connection');
// Use the global UUID mock

const mockConnection = {
  executeQuery: jest.fn(),
  executeWrite: jest.fn(),
};

const mockGetConnection = getConnection as jest.MockedFunction<typeof getConnection>;

describe('ConnectorConfigHistoryRepository', () => {
  let repository: ConnectorConfigHistoryRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnection.mockReturnValue(mockConnection as any);
    repository = new ConnectorConfigHistoryRepository();
  });

  describe('createEntry', () => {
    const mockConfig: ConnectorInstanceConfig = {
      customName: 'test-server',
      customDescription: 'Test connector configuration',
      environmentVariables: '{"TEST": "value"}',
      timeouts: {
        connection: 30000,
        request: 60000,
        idle: 300000
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        exponentialBackoff: true
      },
      logging: {
        level: 'info',
        enableDebug: false,
        logRequests: false
      }
    };

    it('should create a configuration history entry', async () => {
      mockConnection.executeWrite.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await repository.createEntry(
        'connector-1',
        mockConfig,
        'user-1',
        'Test change',
        'Testing'
      );

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'CREATE (h:ConnectorConfigHistory $props) RETURN h',
        expect.objectContaining({
          props: expect.objectContaining({
            id: expect.any(String),
            connectorId: 'connector-1',
            config: JSON.stringify(mockConfig),
            changedBy: 'user-1',
            changeSummary: 'Test change',
            changeReason: 'Testing',
            createdAt: expect.any(String)
          })
        })
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          connectorId: 'connector-1',
          config: mockConfig,
          changedBy: 'user-1',
          changeSummary: 'Test change',
          changeReason: 'Testing'
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Created configuration history entry for connector: connector-1')
      );

      consoleSpy.mockRestore();
    });

    it('should throw error when required fields are missing', async () => {
      await expect(repository.createEntry('', mockConfig, 'user-1'))
        .rejects.toThrow('Connector ID, config, and changedBy are required fields');

      await expect(repository.createEntry('connector-1', null as any, 'user-1'))
        .rejects.toThrow('Connector ID, config, and changedBy are required fields');

      await expect(repository.createEntry('connector-1', mockConfig, ''))
        .rejects.toThrow('Connector ID, config, and changedBy are required fields');
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(repository.createEntry('connector-1', mockConfig, 'user-1'))
        .rejects.toThrow('Failed to create configuration history entry: Database error');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in createEntry:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('findAll', () => {
    it('should return all configuration history entries', async () => {
      const mockHistoryData = [
        {
          id: '1',
          connectorId: 'connector-1',
          config: '{"test": "config"}',
          changedBy: 'user-1',
          createdAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockHistoryData.map(h => ({ h }))
      );

      const result = await repository.findAll();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (h:ConnectorConfigHistory) RETURN h ORDER BY h.createdAt DESC'
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: '1',
          connectorId: 'connector-1',
          config: { test: 'config' },
          changedBy: 'user-1'
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(repository.findAll())
        .rejects.toThrow('Failed to retrieve configuration history: Database error');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in findAll:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('findById', () => {
    it('should return history entry by id', async () => {
      const mockHistoryData = {
        id: '1',
        connectorId: 'connector-1',
        config: '{"test": "config"}',
        changedBy: 'user-1',
        createdAt: '2023-01-01'
      };
      mockConnection.executeQuery.mockResolvedValue([{ h: mockHistoryData }]);

      const result = await repository.findById('1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (h:ConnectorConfigHistory) WHERE h.id = $id RETURN h',
        { id: '1' }
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: '1',
          connectorId: 'connector-1',
          config: { test: 'config' }
        })
      );
    });

    it('should return null when entry not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error when id is missing', async () => {
      await expect(repository.findById(''))
        .rejects.toThrow('ID parameter is required');
    });
  });

  describe('findByConnector', () => {
    it('should return history entries for connector without limit', async () => {
      const mockHistoryData = [
        {
          id: '1',
          connectorId: 'connector-1',
          config: '{"test": "config"}',
          changedBy: 'user-1',
          createdAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockHistoryData.map(h => ({ h }))
      );

      const result = await repository.findByConnector('connector-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (h:ConnectorConfigHistory) WHERE h.connectorId = $connectorId RETURN h ORDER BY h.createdAt DESC',
        { connectorId: 'connector-1' }
      );
      expect(result).toHaveLength(1);
    });

    it('should return history entries for connector with limit', async () => {
      const mockHistoryData = [
        {
          id: '1',
          connectorId: 'connector-1',
          config: '{"test": "config"}',
          changedBy: 'user-1',
          createdAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockHistoryData.map(h => ({ h }))
      );

      const result = await repository.findByConnector('connector-1', 10);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $limit'),
        { connectorId: 'connector-1', limit: 10 }
      );
      expect(result).toHaveLength(1);
    });

    it('should throw error when connectorId is missing', async () => {
      await expect(repository.findByConnector(''))
        .rejects.toThrow('Connector ID parameter is required');
    });
  });

  describe('findByUser', () => {
    it('should return history entries for user', async () => {
      const mockHistoryData = [
        {
          id: '1',
          connectorId: 'connector-1',
          config: '{"test": "config"}',
          changedBy: 'user-1',
          createdAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockHistoryData.map(h => ({ h }))
      );

      const result = await repository.findByUser('user-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (h:ConnectorConfigHistory) WHERE h.changedBy = $userId RETURN h ORDER BY h.createdAt DESC',
        { userId: 'user-1' }
      );
      expect(result).toHaveLength(1);
    });

    it('should return history entries for user with limit', async () => {
      const mockHistoryData = [
        {
          id: '1',
          connectorId: 'connector-1',
          config: '{"test": "config"}',
          changedBy: 'user-1',
          createdAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockHistoryData.map(h => ({ h }))
      );

      const result = await repository.findByUser('user-1', 5);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $limit'),
        { userId: 'user-1', limit: 5 }
      );
      expect(result).toHaveLength(1);
    });

    it('should throw error when userId is missing', async () => {
      await expect(repository.findByUser(''))
        .rejects.toThrow('User ID parameter is required');
    });
  });

  describe('update', () => {
    it('should update history entry', async () => {
      const mockUpdatedHistory = {
        id: '1',
        connectorId: 'connector-1',
        config: '{"updated": "config"}',
        changedBy: 'user-1',
        changeSummary: 'Updated summary',
        createdAt: '2023-01-01'
      };
      mockConnection.executeWrite.mockResolvedValue([{ h: mockUpdatedHistory }]);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const updates = {
        changeSummary: 'Updated summary',
        config: { customName: 'updated-server', customDescription: 'Updated config' } as ConnectorInstanceConfig
      };

      const result = await repository.update('1', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (h:ConnectorConfigHistory) WHERE h.id = $id SET h += $updates RETURN h',
        expect.objectContaining({
          id: '1',
          updates: expect.objectContaining({
            changeSummary: 'Updated summary',
            config: JSON.stringify({ customName: 'updated-server', customDescription: 'Updated config' })
          })
        })
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: '1',
          changeSummary: 'Updated summary'
        })
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Updated configuration history entry: 1')
      );

      consoleSpy.mockRestore();
    });

    it('should return null when history entry not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('nonexistent', { changeSummary: 'Updated' });

      expect(result).toBeNull();
    });

    it('should throw error when id is missing', async () => {
      await expect(repository.update('', {}))
        .rejects.toThrow('ID parameter is required');
    });
  });

  describe('delete', () => {
    it('should delete history entry and return true', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await repository.delete('1');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (h:ConnectorConfigHistory) WHERE h.id = $id DETACH DELETE h RETURN count(h) as deletedCount',
        { id: '1' }
      );
      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deleted configuration history entry with id: 1')
      );

      consoleSpy.mockRestore();
    });

    it('should return false when entry not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });

    it('should throw error when id is missing', async () => {
      await expect(repository.delete(''))
        .rejects.toThrow('ID parameter is required');
    });
  });

  describe('getLatestConfig', () => {
    it('should return latest configuration for connector', async () => {
      const mockHistoryData = {
        id: '1',
        connectorId: 'connector-1',
        config: '{"latest": "config"}',
        changedBy: 'user-1',
        createdAt: '2023-01-01'
      };
      mockConnection.executeQuery.mockResolvedValue([{ h: mockHistoryData }]);

      const result = await repository.getLatestConfig('connector-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (h:ConnectorConfigHistory) WHERE h.connectorId = $connectorId RETURN h ORDER BY h.createdAt DESC LIMIT 1',
        { connectorId: 'connector-1' }
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: '1',
          connectorId: 'connector-1',
          config: { latest: 'config' }
        })
      );
    });

    it('should return null when no configuration found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getLatestConfig('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error when connectorId is missing', async () => {
      await expect(repository.getLatestConfig(''))
        .rejects.toThrow('Connector ID parameter is required');
    });
  });

  describe('cleanupOldEntries', () => {
    it('should cleanup old entries and return count', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 5 }]);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await repository.cleanupOldEntries('connector-1', 10);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SKIP $keepCount'),
        { connectorId: 'connector-1', keepCount: 10 }
      );
      expect(result).toBe(5);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 5 old history entries for connector: connector-1')
      );

      consoleSpy.mockRestore();
    });

    it('should return 0 when no entries to cleanup', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.cleanupOldEntries('connector-1');

      expect(result).toBe(0);
    });

    it('should throw error when connectorId is missing', async () => {
      await expect(repository.cleanupOldEntries(''))
        .rejects.toThrow('Connector ID parameter is required');
    });

    it('should throw error when keepCount is less than 1', async () => {
      await expect(repository.cleanupOldEntries('connector-1', 0))
        .rejects.toThrow('Keep count must be at least 1');
    });
  });
});