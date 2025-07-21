import { MCPServerOptionRepository } from '../../src/repositories/MCPServerOptionRepository';
import { getConnection } from '../../src/connection';
import { MCPServerOption } from '../../src/types';

// Mock the connection module
jest.mock('../../src/connection');

describe('MCPServerOptionRepository', () => {
  let repository: MCPServerOptionRepository;
  let mockConnection: any;

  const mockMCPServerOption: MCPServerOption = {
    id: 'test-id-123',
    name: 'Test MCP Server',
    command: 'npx',
    args: ['@modelcontextprotocol/server-test'],
    env: '{"TEST_VAR": "test_value"}',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new MCPServerOptionRepository();

    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };

    (getConnection as jest.Mock).mockReturnValue(mockConnection);
  });

  describe('findAll()', () => {
    it('should return all MCP server options ordered by name', async () => {
      const mockResult = [
        { m: { ...mockMCPServerOption, name: 'A Server' } },
        { m: { ...mockMCPServerOption, name: 'B Server' } },
      ];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.findAll();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (m:MCPServerOption) RETURN m ORDER BY m.name ASC'
      );
      expect(result).toEqual([
        { ...mockMCPServerOption, name: 'A Server' },
        { ...mockMCPServerOption, name: 'B Server' },
      ]);
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Database connection failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.findAll()).rejects.toThrow(
        'Failed to retrieve MCP server options: Database connection failed'
      );
    });

    it('should return empty array when no options exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById()', () => {
    it('should return MCP server option when found', async () => {
      const mockResult = [{ m: mockMCPServerOption }];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.findById('test-id-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (m:MCPServerOption) WHERE m.id = $id RETURN m',
        { id: 'test-id-123' }
      );
      expect(result).toEqual(mockMCPServerOption);
    });

    it('should return null when not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should throw error when id is empty', async () => {
      await expect(repository.findById('')).rejects.toThrow('ID parameter is required');
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Query failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.findById('test-id')).rejects.toThrow(
        'Failed to retrieve MCP server option: Query failed'
      );
    });
  });

  describe('create()', () => {
    const createEntity = {
      name: 'New MCP Server',
      command: 'docker',
      args: ['run', 'mcp-server'],
      env: '{"PORT": "3000"}',
    };

    it('should create MCP server option successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(createEntity);

      expect(result).toMatchObject(createEntity);
      expect(result.id).toBeDefined();
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'CREATE (m:MCPServerOption $props) RETURN m',
        { props: expect.objectContaining(createEntity) }
      );
    });

    it('should default env to empty JSON object when not provided', async () => {
      const entityWithoutEnv = {
        name: 'Test Server',
        command: 'npx',
        args: ['test-server'],
      };
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(entityWithoutEnv);

      expect(result.env).toBe('{}');
    });

    it('should throw error when name is missing', async () => {
      const invalidEntity = {
        command: 'docker',
        args: ['run'],
      } as any;

      await expect(repository.create(invalidEntity)).rejects.toThrow(
        'Name and command are required fields'
      );
    });

    it('should throw error when command is missing', async () => {
      const invalidEntity = {
        name: 'Test Server',
        args: ['run'],
      } as any;

      await expect(repository.create(invalidEntity)).rejects.toThrow(
        'Name and command are required fields'
      );
    });

    it('should throw error when args is not an array', async () => {
      const invalidEntity = {
        name: 'Test Server',
        command: 'docker',
        args: 'not-an-array',
      } as any;

      await expect(repository.create(invalidEntity)).rejects.toThrow('Args must be an array');
    });

    it('should throw error when env is invalid JSON', async () => {
      const invalidEntity = {
        name: 'Test Server',
        command: 'docker',
        args: ['run'],
        env: 'invalid-json',
      };

      await expect(repository.create(invalidEntity)).rejects.toThrow(
        'Environment variables must be a valid JSON string'
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Create failed');
      mockConnection.executeWrite.mockRejectedValue(mockError);

      await expect(repository.create(createEntity)).rejects.toThrow(
        'Failed to create MCP server option: Create failed'
      );
    });
  });

  describe('update()', () => {
    const updates = {
      name: 'Updated Server',
      args: ['updated', 'args'],
    };

    it('should update MCP server option successfully', async () => {
      const updatedOption = { ...mockMCPServerOption, ...updates };
      mockConnection.executeWrite.mockResolvedValue([{ m: updatedOption }]);

      const result = await repository.update('test-id-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (m:MCPServerOption) WHERE m.id = $id SET m += $updates RETURN m',
        { id: 'test-id-123', updates }
      );
      expect(result).toEqual(updatedOption);
    });

    it('should return null when option not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('non-existent-id', updates);

      expect(result).toBeNull();
    });

    it('should throw error when id is empty', async () => {
      await expect(repository.update('', updates)).rejects.toThrow('ID parameter is required');
    });

    it('should throw error when args update is not an array', async () => {
      const invalidUpdates = { args: 'not-an-array' } as any;

      await expect(repository.update('test-id', invalidUpdates)).rejects.toThrow(
        'Args must be an array'
      );
    });

    it('should throw error when env update is invalid JSON', async () => {
      const invalidUpdates = { env: 'invalid-json' };

      await expect(repository.update('test-id', invalidUpdates)).rejects.toThrow(
        'Environment variables must be a valid JSON string'
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Update failed');
      mockConnection.executeWrite.mockRejectedValue(mockError);

      await expect(repository.update('test-id', updates)).rejects.toThrow(
        'Failed to update MCP server option: Update failed'
      );
    });
  });

  describe('delete()', () => {
    it('should delete MCP server option successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('test-id-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (m:MCPServerOption) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
        { id: 'test-id-123' }
      );
      expect(result).toBe(true);
    });

    it('should return false when option not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('non-existent-id');

      expect(result).toBe(false);
    });

    it('should throw error when id is empty', async () => {
      await expect(repository.delete('')).rejects.toThrow('ID parameter is required');
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Delete failed');
      mockConnection.executeWrite.mockRejectedValue(mockError);

      await expect(repository.delete('test-id')).rejects.toThrow(
        'Failed to delete MCP server option: Delete failed'
      );
    });
  });

  describe('findByCommand()', () => {
    it('should return MCP server options with matching command', async () => {
      const mockResult = [
        { m: { ...mockMCPServerOption, command: 'npx' } },
        { m: { ...mockMCPServerOption, id: 'test-2', command: 'npx' } },
      ];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.findByCommand('npx');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (m:MCPServerOption) WHERE m.command = $command RETURN m ORDER BY m.name ASC',
        { command: 'npx' }
      );
      expect(result).toHaveLength(2);
      expect(result[0].command).toBe('npx');
      expect(result[1].command).toBe('npx');
    });

    it('should return empty array when no matches found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByCommand('non-existent-command');

      expect(result).toEqual([]);
    });

    it('should throw error when command is empty', async () => {
      await expect(repository.findByCommand('')).rejects.toThrow('Command parameter is required');
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Query failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.findByCommand('docker')).rejects.toThrow(
        'Failed to find MCP server options by command: Query failed'
      );
    });
  });

  describe('findActive()', () => {
    it('should return all MCP server options (all considered active)', async () => {
      const mockResult = [
        { m: mockMCPServerOption },
        { m: { ...mockMCPServerOption, id: 'test-2' } },
      ];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.findActive();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (m:MCPServerOption) RETURN m ORDER BY m.name ASC'
      );
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no options exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findActive();

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Query failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.findActive()).rejects.toThrow(
        'Failed to find active MCP server options: Query failed'
      );
    });
  });

  describe('searchByName()', () => {
    it('should return MCP server options with matching names (case-insensitive)', async () => {
      const mockResult = [
        { m: { ...mockMCPServerOption, name: 'GitHub Server' } },
        { m: { ...mockMCPServerOption, id: 'test-2', name: 'github-tools' } },
      ];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.searchByName('github');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (m:MCPServerOption) WHERE toLower(m.name) CONTAINS toLower($nameQuery) RETURN m ORDER BY m.name ASC',
        { nameQuery: 'github' }
      );
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no matches found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.searchByName('non-existent');

      expect(result).toEqual([]);
    });

    it('should throw error when nameQuery is empty', async () => {
      await expect(repository.searchByName('')).rejects.toThrow('Name query parameter is required');
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Search failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.searchByName('test')).rejects.toThrow(
        'Failed to search MCP server options by name: Search failed'
      );
    });
  });
});
