/**
 * AgentRepository Unit Tests
 */

import { getConnection } from '@/helpers/database';
import { AgentRepository } from '@/repositories/AgentRepository';
import { ConflictError, DatabaseError, NotFoundError } from '@starships/errors';

// Mock the database connection only
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(),
}));

// Mock nanoid for predictable ID generation
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-nanoid-1234'),
}));

describe('AgentRepository', () => {
  let repository: AgentRepository;
  let mockConnection: {
    executeQuery: jest.Mock;
    executeWrite: jest.Mock;
  };

  beforeEach(() => {
    // Create fresh mock connection for each test
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    repository = new AgentRepository();
    // Clear all mocks to ensure clean state
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository['serviceName']).toBe('AgentRepository');
    });
  });

  describe('entity migration note', () => {
    it('should note that serialization has moved to entity layer', () => {
      // Serialization methods like serializeComplexFields, deserializeComplexFields, and getSafeValue
      // have been removed from repositories and are now handled by AgentEntity
      expect(true).toBe(true);
    });
  });

  describe('CRUD Operations', () => {
    describe('findAll', () => {
      it('should return all agents', async () => {
        const mockAgents = [
          { id: 'agent-1', name: 'Agent 1' },
          { id: 'agent-2', name: 'Agent 2' },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findAll();

        expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (a:Agent) RETURN a ORDER BY a.createdAt DESC');
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Agent 1' }));
        expect(result[1]).toEqual(expect.objectContaining({ id: 'agent-2', name: 'Agent 2' }));
      });

      it('should handle empty result', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findAll();

        expect(result).toEqual([]);
      });

      it('should handle database errors', async () => {
        mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

        await expect(repository.findAll()).rejects.toThrow(DatabaseError);
      });
    });

    describe('findById', () => {
      it('should return agent by id', async () => {
        const mockAgent = { id: 'agent-1', name: 'Agent 1' };
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findById('agent-1');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (a:Agent) WHERE a.id = $id RETURN a', { id: 'agent-1' });
        expect(result).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Agent 1' }));
      });

      it('should return null when agent not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findById('non-existent');

        expect(result).toBeNull();
      });

      it('should handle database errors', async () => {
        mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

        await expect(repository.findById('agent-1')).rejects.toThrow(DatabaseError);
      });
    });

    describe('create', () => {
      const mockAgentData = {
        name: 'Test Agent',
        description: 'Test Description',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 30000,
        memoryState: {},
        blueprint: { type: 'test', nodes: [], edges: [] },
      };

      it('should create agent successfully', async () => {
        const mockCreatedAgent = {
          id: 'test-nanoid-1234',
          name: 'Test Agent',
          description: 'Test Description',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1000,
          timeout: 30000,
          memoryState: {},
          blueprint: { type: 'test', nodes: [], edges: [] },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        // Mock createEntityWithAutoId call
        mockConnection.executeWrite
          .mockResolvedValueOnce([{ n: mockCreatedAgent }]) // createEntityWithAutoId
          .mockResolvedValueOnce([]); // relationship creation

        const result = await repository.create(mockAgentData, 'starship-123');

        expect(mockConnection.executeWrite).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('CREATE (n:Agent)'),
          expect.objectContaining({
            props: expect.objectContaining({
              name: 'Test Agent',
              memoryState: '{}',
              blueprint: '{"type":"test","nodes":[],"edges":[]}',
            }),
          })
        );
        expect(result.id).toBe('test-nanoid-1234');
        expect(result.name).toBe('Test Agent');
      });

      it('should validate required fields', async () => {
        const invalidData = { ...mockAgentData, name: '' }; // Empty name should fail validation

        await expect(repository.create(invalidData, 'starship-123')).rejects.toThrow(DatabaseError);
      });

      it('should handle database errors', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

        await expect(repository.create(mockAgentData, 'starship-123')).rejects.toThrow(DatabaseError);
      });

      it('should create Neo4j relationship', async () => {
        const mockCreatedAgent = {
          id: 'test-nanoid-1234',
          name: 'Test Agent',
          description: 'Test Description',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1000,
          timeout: 30000,
          memoryState: {},
          blueprint: { type: 'test', nodes: [], edges: [] },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        // Mock createEntityWithAutoId call first, then relationship creation
        mockConnection.executeWrite
          .mockResolvedValueOnce([{ n: mockCreatedAgent }]) // createEntityWithAutoId
          .mockResolvedValueOnce([]); // relationship creation

        await repository.create(mockAgentData, 'starship-123');

        expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2); // Once for agent, once for relationship
        expect(mockConnection.executeWrite).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('CREATE (a)-[:DEPLOYED_ON'),
          expect.objectContaining({
            starshipId: 'starship-123',
            agentId: 'test-nanoid-1234',
          })
        );
      });
    });

    describe('update', () => {
      it('should update agent successfully', async () => {
        const mockAgent = { id: 'agent-1', name: 'Updated Agent' };
        const updates = { name: 'Updated Agent' };
        mockConnection.executeWrite.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.update('agent-1', updates);

        expect(mockConnection.executeWrite).toHaveBeenCalledWith('MATCH (a:Agent) WHERE a.id = $id SET a += $updates RETURN a', {
          id: 'agent-1',
          updates: expect.objectContaining({
            ...updates,
            updatedAt: expect.any(String),
          }),
        });
        expect(result).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Updated Agent' }));
      });

      it('should return null when agent not found', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        const result = await repository.update('non-existent', { name: 'Updated' });

        expect(result).toBeNull();
      });

      it('should handle database errors', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

        await expect(repository.update('agent-1', { name: 'Updated' })).rejects.toThrow(DatabaseError);
      });
    });

    describe('delete', () => {
      it('should delete agent successfully', async () => {
        mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

        const result = await repository.delete('agent-1');

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.id = $id DETACH DELETE a RETURN count(a) as deletedCount',
          { id: 'agent-1' }
        );
        expect(result).toBe(true);
      });

      it('should return false when agent not found', async () => {
        mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

        const result = await repository.delete('non-existent');

        expect(result).toBe(false);
      });

      it('should handle database errors', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

        await expect(repository.delete('agent-1')).rejects.toThrow(DatabaseError);
      });
    });
  });

  describe('Relationship Methods', () => {
    describe('findByStarship', () => {
      it('should return starship agents', async () => {
        const mockAgents = [{ id: 'agent-1', name: 'Agent 1' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findByStarship('starship-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a',
          { starshipId: 'starship-123' }
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Agent 1' }));
      });
    });

    describe('updateStarship', () => {
      it('should update agent starshipId successfully', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]); // Starship exists
        mockConnection.executeWrite
          .mockResolvedValueOnce([]) // Remove relationship
          .mockResolvedValueOnce([]) // Create relationship
          .mockResolvedValueOnce([{ a: { id: 'agent-123' } }]); // Update agent

        const result = await repository.updateStarship('agent-123', 'starship-456');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (s:Starship) WHERE s.id = $starshipId RETURN count(s) as count', {
          starshipId: 'starship-456',
        });
        expect(result).toMatchObject({ id: 'agent-123' });
      });

      it('should throw error when starship not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 0 }]); // Starship doesn't exist

        await expect(repository.updateStarship('agent-123', 'non-existent')).rejects.toThrow(NotFoundError);
      });

      it('should throw error when agent not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]); // Starship exists
        mockConnection.executeWrite
          .mockResolvedValueOnce([]) // Remove relationship
          .mockResolvedValueOnce([]) // Create relationship
          .mockResolvedValueOnce([]); // Update agent - empty result

        await expect(repository.updateStarship('non-existent', 'starship-456')).rejects.toThrow(DatabaseError);
      });
    });
  });

  describe('Query Methods', () => {
    describe('searchAgents', () => {
      it('should search agents with fulltext search', async () => {
        const mockAgents = [{ id: 'agent-1', name: 'Matching Agent' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a, score: 0.95 })));

        const result = await repository.searchAgents('test query');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'CALL db.index.fulltext.queryNodes("agentSearch", $query) YIELD node as a, score RETURN a, score ORDER BY score DESC LIMIT 20',
          { query: 'test query' }
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Matching Agent' }));
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should handle constraint violation errors', async () => {
      const constraintError = new Error('constraint violation');
      mockConnection.executeQuery.mockRejectedValue(constraintError);

      await expect(repository.findAll()).rejects.toThrow(ConflictError);
    });

    it('should handle connection errors', async () => {
      const connectionError = new Error('connection failed');
      mockConnection.executeQuery.mockRejectedValue(connectionError);

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('operation timeout');
      mockConnection.executeQuery.mockRejectedValue(timeoutError);

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });
  });
});
