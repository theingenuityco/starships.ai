import { StarshipRepository } from '../../src/repositories/StarshipRepository';
import { getConnection } from '../../src/connection';
import { Starship, MCPServerOption } from '../../src/types';

// Mock the connection module
jest.mock('../../src/connection');

describe('StarshipRepository - Connector Methods', () => {
  let repository: StarshipRepository;
  let mockConnection: any;

  const mockStarship: Starship = {
    id: 'starship-123',
    slug: 'test-starship',
    ownerId: 'user-123',
    class: 'scout',
    name: 'Test Starship',
    powerLevel: 100,
    activeExpeditions: 0,
    sibilInsights: 0,
    maxAgents: 3,
    status: 'active',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockMCPServerOption: MCPServerOption = {
    id: 'mcp-server-123',
    name: 'Test MCP Server',
    command: 'npx',
    args: ['@modelcontextprotocol/server-test'],
    env: '{"TEST_VAR": "test_value"}',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new StarshipRepository();

    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };

    (getConnection as jest.Mock).mockReturnValue(mockConnection);
  });

  describe('getConnectedMCPServers()', () => {
    it('should return connected MCP servers with relationship metadata', async () => {
      const mockResult = [
        {
          m: mockMCPServerOption,
          r: {
            connectedAt: '2024-01-01T00:00:00.000Z',
            isActive: true,
          },
        },
      ];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.getConnectedMCPServers('starship-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        `MATCH (s:Starship {id: $starshipId})-[r:HAS_CONNECTOR]->(m:MCPServerOption)
         WHERE r.isActive = true
         RETURN m, r
         ORDER BY r.connectedAt DESC`,
        { starshipId: 'starship-123' }
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(mockMCPServerOption);
      expect((result[0] as any)._connectionMetadata).toEqual({
        connectedAt: '2024-01-01T00:00:00.000Z',
        isActive: true,
      });
    });

    it('should return empty array when no connected servers exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getConnectedMCPServers('starship-123');

      expect(result).toEqual([]);
    });

    it('should throw error when starshipId is empty', async () => {
      await expect(repository.getConnectedMCPServers('')).rejects.toThrow(
        'Starship ID parameter is required'
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Database connection failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.getConnectedMCPServers('starship-123')).rejects.toThrow(
        'Failed to retrieve connected MCP servers: Database connection failed'
      );
    });
  });

  describe('connectMCPServer()', () => {
    const mockConnectionResult = {
      starshipExists: 1,
      mcpServerExists: 1,
      existingConnection: 0,
      connectionCreated: 1,
    };

    it('should successfully connect MCP server to starship', async () => {
      mockConnection.executeWrite.mockResolvedValue([mockConnectionResult]);

      const result = await repository.connectMCPServer('starship-123', 'mcp-server-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (s)-[:HAS_CONNECTOR'),
        expect.objectContaining({
          starshipId: 'starship-123',
          mcpServerId: 'mcp-server-123',
          timestamp: expect.any(String),
        })
      );
      expect(result).toBe(true);
    });

    it('should return false for duplicate connections (idempotent)', async () => {
      const duplicateResult = {
        ...mockConnectionResult,
        existingConnection: 1,
        connectionCreated: 0,
      };
      mockConnection.executeWrite.mockResolvedValue([duplicateResult]);

      const result = await repository.connectMCPServer('starship-123', 'mcp-server-123');

      expect(result).toBe(false);
    });

    it('should throw error when starship does not exist', async () => {
      const invalidResult = {
        ...mockConnectionResult,
        starshipExists: 0,
      };
      mockConnection.executeWrite.mockResolvedValue([invalidResult]);

      await expect(
        repository.connectMCPServer('invalid-starship', 'mcp-server-123')
      ).rejects.toThrow('Starship with ID invalid-starship not found');
    });

    it('should throw error when MCP server does not exist', async () => {
      const invalidResult = {
        ...mockConnectionResult,
        mcpServerExists: 0,
      };
      mockConnection.executeWrite.mockResolvedValue([invalidResult]);

      await expect(
        repository.connectMCPServer('starship-123', 'invalid-mcp-server')
      ).rejects.toThrow('MCP Server with ID invalid-mcp-server not found');
    });

    it('should throw error when starshipId is empty', async () => {
      await expect(repository.connectMCPServer('', 'mcp-server-123')).rejects.toThrow(
        'Starship ID parameter is required'
      );
    });

    it('should throw error when mcpServerId is empty', async () => {
      await expect(repository.connectMCPServer('starship-123', '')).rejects.toThrow(
        'MCP Server ID parameter is required'
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Transaction failed');
      mockConnection.executeWrite.mockRejectedValue(mockError);

      await expect(repository.connectMCPServer('starship-123', 'mcp-server-123')).rejects.toThrow(
        'Failed to connect MCP server: Transaction failed'
      );
    });

    it('should throw error when connection creation fails unexpectedly', async () => {
      const failedResult = {
        ...mockConnectionResult,
        connectionCreated: 0,
      };
      mockConnection.executeWrite.mockResolvedValue([failedResult]);

      await expect(repository.connectMCPServer('starship-123', 'mcp-server-123')).rejects.toThrow(
        'Failed to create connection due to unknown error'
      );
    });
  });

  describe('disconnectMCPServer()', () => {
    it('should successfully disconnect MCP server from starship', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.disconnectMCPServer('starship-123', 'mcp-server-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        `MATCH (s:Starship {id: $starshipId})-[r:HAS_CONNECTOR]->(m:MCPServerOption {id: $mcpServerId})
         WHERE r.isActive = true
         DELETE r
         RETURN count(r) as deletedCount`,
        { starshipId: 'starship-123', mcpServerId: 'mcp-server-123' }
      );
      expect(result).toBe(true);
    });

    it('should return false when no active connection exists', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.disconnectMCPServer('starship-123', 'mcp-server-123');

      expect(result).toBe(false);
    });

    it('should handle missing deletedCount in result', async () => {
      mockConnection.executeWrite.mockResolvedValue([{}]);

      const result = await repository.disconnectMCPServer('starship-123', 'mcp-server-123');

      expect(result).toBe(false);
    });

    it('should throw error when starshipId is empty', async () => {
      await expect(repository.disconnectMCPServer('', 'mcp-server-123')).rejects.toThrow(
        'Starship ID parameter is required'
      );
    });

    it('should throw error when mcpServerId is empty', async () => {
      await expect(repository.disconnectMCPServer('starship-123', '')).rejects.toThrow(
        'MCP Server ID parameter is required'
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Delete operation failed');
      mockConnection.executeWrite.mockRejectedValue(mockError);

      await expect(
        repository.disconnectMCPServer('starship-123', 'mcp-server-123')
      ).rejects.toThrow('Failed to disconnect MCP server: Delete operation failed');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle connecting and then disconnecting the same server', async () => {
      // First connect
      mockConnection.executeWrite.mockResolvedValueOnce([
        {
          starshipExists: 1,
          mcpServerExists: 1,
          existingConnection: 0,
          connectionCreated: 1,
        },
      ]);

      const connectResult = await repository.connectMCPServer('starship-123', 'mcp-server-123');
      expect(connectResult).toBe(true);

      // Then disconnect
      mockConnection.executeWrite.mockResolvedValueOnce([{ deletedCount: 1 }]);

      const disconnectResult = await repository.disconnectMCPServer(
        'starship-123',
        'mcp-server-123'
      );
      expect(disconnectResult).toBe(true);

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple connections to the same starship', async () => {
      const servers = ['mcp-server-1', 'mcp-server-2', 'mcp-server-3'];

      // Mock successful connections for all servers
      mockConnection.executeWrite.mockResolvedValue([
        {
          starshipExists: 1,
          mcpServerExists: 1,
          existingConnection: 0,
          connectionCreated: 1,
        },
      ]);

      const results = await Promise.all(
        servers.map((serverId) => repository.connectMCPServer('starship-123', serverId))
      );

      expect(results).toEqual([true, true, true]);
      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(3);
    });
  });
});
