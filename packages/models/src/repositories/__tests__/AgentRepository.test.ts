/**
 * AgentRepository Unit Tests
 */

import { AgentRepository } from '../AgentRepository';
import { getConnection } from '../../helpers/database';
import { ValidationError, NotFoundError, DatabaseError, ConflictError } from '@starships/errors';
import type { AgentModel } from '@starships/protocol';

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(),
  convertNeo4jIntsInObject: jest.fn((obj) => obj),
  convertNeo4jIntsInArray: jest.fn((arr) => arr),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

describe('AgentRepository', () => {
  let repository: AgentRepository;
  let mockConnection: any;

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

  describe('Private Helper Methods', () => {
    describe('serializeComplexFields', () => {
      it('should serialize blueprint and memory fields', () => {
        const agent = {
          id: 'test-id',
          name: 'Test Agent',
          model: 'gpt-4',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          version: '1.0.0',
          category: 'general',
          usageCount: 0,
          starshipId: 'starship-123',
          blueprint: { type: 'test', nodes: [], edges: [] },
          memory: { data: 'test' },
        } as AgentModel;

        const result = repository['serializeComplexFields'](agent);

        expect(result.blueprint).toBe('{"type":"test","nodes":[],"edges":[]}');
        expect(result.memory).toBe('{"data":"test"}');
        expect(result.name).toBe('Test Agent');
      });

      it('should handle null blueprint and memory', () => {
        const agent = {
          id: 'test-id',
          name: 'Test Agent',
          model: 'gpt-4',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          version: '1.0.0',
          category: 'general',
          usageCount: 0,
          starshipId: 'starship-123',
          blueprint: null,
          memory: null,
        } as any;

        const result = repository['serializeComplexFields'](agent);

        expect(result.blueprint).toBeNull();
        expect(result.memory).toBeNull();
      });
    });

    describe('deserializeComplexFields', () => {
      it('should deserialize blueprint and memory fields', () => {
        const agent = {
          id: 'test-id',
          name: 'Test Agent',
          model: 'gpt-4',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          version: '1.0.0',
          category: 'general',
          usageCount: 0,
          starshipId: 'starship-123',
          blueprint: '{"type":"test","nodes":[],"edges":[]}',
          memory: '{"data":"test"}',
        };

        const result = repository['deserializeComplexFields'](agent);

        expect(result.blueprint).toEqual({ type: 'test', nodes: [], edges: [] });
        expect(result.memory).toEqual({ data: 'test' });
      });

      it('should handle invalid JSON gracefully', () => {
        const agent = {
          id: 'test-id',
          name: 'Test Agent',
          model: 'gpt-4',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          version: '1.0.0',
          category: 'general',
          usageCount: 0,
          starshipId: 'starship-123',
          blueprint: '{invalid json}',
          memory: '{invalid json}',
        };

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        const result = repository['deserializeComplexFields'](agent);

        expect(result.blueprint).toBeUndefined();
        expect(result.memory).toBeUndefined();
        expect(consoleSpy).toHaveBeenCalled();
      });

      it('should handle null values', () => {
        const agent = {
          id: 'test-id',
          name: 'Test Agent',
          model: 'gpt-4',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          version: '1.0.0',
          category: 'general',
          usageCount: 0,
          starshipId: 'starship-123',
          blueprint: null,
          memory: undefined,
        };

        const result = repository['deserializeComplexFields'](agent);

        expect(result.blueprint).toBeUndefined();
        expect(result.memory).toBeUndefined();
      });
    });

    describe('getSafeValue', () => {
      it('should return value when valid', () => {
        const result = repository['getSafeValue']('test-value', 'default');
        expect(result).toBe('test-value');
      });

      it('should return default for null', () => {
        const result = repository['getSafeValue'](null, 'default');
        expect(result).toBe('default');
      });

      it('should return default for undefined', () => {
        const result = repository['getSafeValue'](undefined, 'default');
        expect(result).toBe('default');
      });

      it('should return default for empty object', () => {
        const result = repository['getSafeValue']({}, 'default');
        expect(result).toBe('default');
      });
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

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) RETURN a ORDER BY a.createdAt DESC'
        );
        expect(result).toEqual(mockAgents);
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

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.id = $id RETURN a',
          { id: 'agent-1' }
        );
        expect(result).toEqual(mockAgent);
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
        version: '1.0.0',
        category: 'general' as AgentModel['category'],
        starshipId: 'starship-123',
        memory: { data: 'test' },
        blueprint: { type: 'test', nodes: [], edges: [] },
      };

      it('should create agent successfully', async () => {
        const mockCreatedAgent = {
          id: 'test-uuid-1234',
          name: 'Test Agent',
          description: 'Test Description',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1000,
          timeout: 30000,
          version: '1.0.0',
          category: 'general',
          starshipId: 'starship-123',
          memory: '{"data":"test"}',
          blueprint: '{"type":"test","nodes":[],"edges":[]}',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          usageCount: 0,
        };

        // Mock createEntityWithAutoId call
        mockConnection.executeWrite
          .mockResolvedValueOnce([{ n: mockCreatedAgent }]) // createEntityWithAutoId
          .mockResolvedValueOnce([]); // relationship creation

        const result = await repository.create(mockAgentData);

        expect(mockConnection.executeWrite).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('CREATE (n:Agent)'),
          expect.objectContaining({
            props: expect.objectContaining({
              name: 'Test Agent',
              starshipId: 'starship-123',
              memory: '{"data":"test"}',
              blueprint: '{"type":"test","nodes":[],"edges":[]}',
            }),
          })
        );
        expect(result.id).toBe('test-uuid-1234');
        expect(result.name).toBe('Test Agent');
      });

      it('should require starshipId', async () => {
        const invalidData = { ...mockAgentData, starshipId: undefined };

        await expect(repository.create(invalidData as any)).rejects.toThrow(ValidationError);
      });

      it('should handle database errors', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

        await expect(repository.create(mockAgentData)).rejects.toThrow(DatabaseError);
      });

      it('should create Neo4j relationship', async () => {
        const mockCreatedAgent = {
          id: 'test-uuid-1234',
          name: 'Test Agent',
          description: 'Test Description',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1000,
          timeout: 30000,
          version: '1.0.0',
          category: 'general',
          starshipId: 'starship-123',
          memory: '{"data":"test"}',
          blueprint: '{"type":"test","nodes":[],"edges":[]}',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          usageCount: 0,
        };

        // Mock createEntityWithAutoId call first, then relationship creation
        mockConnection.executeWrite
          .mockResolvedValueOnce([{ n: mockCreatedAgent }]) // createEntityWithAutoId
          .mockResolvedValueOnce([]); // relationship creation

        await repository.create(mockAgentData);

        expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2); // Once for agent, once for relationship
        expect(mockConnection.executeWrite).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('CREATE (a)-[:DEPLOYED_ON'),
          expect.objectContaining({
            starshipId: 'starship-123',
            agentId: 'test-uuid-1234',
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

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.id = $id SET a += $updates RETURN a',
          {
            id: 'agent-1',
            updates: expect.objectContaining({
              ...updates,
              updatedAt: expect.any(String),
            }),
          }
        );
        expect(result).toEqual(mockAgent);
      });

      it('should return null when agent not found', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        const result = await repository.update('non-existent', { name: 'Updated' });

        expect(result).toBeNull();
      });

      it('should handle database errors', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

        await expect(repository.update('agent-1', { name: 'Updated' })).rejects.toThrow(
          DatabaseError
        );
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
    describe('findByUser', () => {
      it('should return user agents', async () => {
        const mockAgents = [{ id: 'agent-1', name: 'Agent 1' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findByUser('user-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent)<-[:INTERACTS_WITH]-(u:User) WHERE u.id = $userId RETURN a',
          { userId: 'user-123' }
        );
        expect(result).toEqual(mockAgents);
      });
    });

    describe('findByStarship', () => {
      it('should return starship agents', async () => {
        const mockAgents = [{ id: 'agent-1', name: 'Agent 1' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findByStarship('starship-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a ORDER BY a.name',
          { starshipId: 'starship-123' }
        );
        expect(result).toEqual(mockAgents);
      });
    });

    describe('findByStarshipId', () => {
      it('should return agents by starshipId property', async () => {
        const mockAgents = [{ id: 'agent-1', name: 'Agent 1', starshipId: 'starship-123' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findByStarshipId('starship-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.starshipId = $starshipId RETURN a ORDER BY a.name',
          { starshipId: 'starship-123' }
        );
        expect(result).toEqual(mockAgents);
      });
    });

    describe('updateStarshipId', () => {
      it('should update agent starshipId successfully', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]); // Starship exists
        mockConnection.executeWrite
          .mockResolvedValueOnce([{ count: 1 }]) // Agent update
          .mockResolvedValueOnce([]) // Remove relationship
          .mockResolvedValueOnce([]); // Create relationship

        await repository.updateStarshipId('agent-123', 'starship-456');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (s:Starship) WHERE s.id = $starshipId RETURN count(s) as count',
          { starshipId: 'starship-456' }
        );
        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('SET a.starshipId = $starshipId'),
          expect.objectContaining({
            agentId: 'agent-123',
            starshipId: 'starship-456',
          })
        );
      });

      it('should throw error when starship not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 0 }]); // Starship doesn't exist

        await expect(repository.updateStarshipId('agent-123', 'non-existent')).rejects.toThrow(
          NotFoundError
        );
      });

      it('should throw error when agent not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]); // Starship exists
        mockConnection.executeWrite.mockResolvedValue([{ count: 0 }]); // Agent doesn't exist

        await expect(repository.updateStarshipId('non-existent', 'starship-456')).rejects.toThrow(
          NotFoundError
        );
      });
    });

    describe('findUndeployedAgents', () => {
      it('should return agents without starshipId', async () => {
        const mockAgents = [{ id: 'agent-1', name: 'Agent 1', starshipId: null }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findUndeployedAgents();

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.starshipId IS NULL OR a.starshipId = "" RETURN a ORDER BY a.createdAt DESC',
          {}
        );
        expect(result).toEqual(mockAgents);
      });
    });
  });

  describe('Query Methods', () => {
    describe('findByAuthor', () => {
      it('should return agents by author', async () => {
        const mockAgents = [{ id: 'agent-1', authorId: 'author-123' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findByAuthor('author-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.authorId = $authorId RETURN a ORDER BY a.updatedAt DESC',
          { authorId: 'author-123' }
        );
        expect(result).toEqual(mockAgents);
      });
    });

    describe('findByCategory', () => {
      it('should return agents by category', async () => {
        const mockAgents = [{ id: 'agent-1', category: 'general' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findByCategory('general');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.category = $category RETURN a ORDER BY a.name',
          { category: 'general' }
        );
        expect(result).toEqual(mockAgents);
      });
    });

    describe('findByTags', () => {
      it('should return agents by tags', async () => {
        const mockAgents = [{ id: 'agent-1', tags: ['ai', 'helper'] }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findByTags(['ai', 'helper']);

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE ANY(tag IN $tags WHERE tag IN a.tags) RETURN a ORDER BY a.name',
          { tags: ['ai', 'helper'] }
        );
        expect(result).toEqual(mockAgents);
      });
    });

    describe('findPublic', () => {
      it('should return public agents with pagination', async () => {
        const mockAgents = [{ id: 'agent-1', isPublic: true }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findPublic(10, 5);

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.isPublic = true RETURN a ORDER BY a.usageCount DESC, a.rating DESC SKIP $offset LIMIT $limit',
          expect.objectContaining({
            limit: expect.any(Object), // Neo4j int
            offset: expect.any(Object), // Neo4j int
          })
        );
        expect(result).toEqual(mockAgents);
      });

      it('should use default pagination values', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        await repository.findPublic();

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            limit: expect.any(Object), // Should be 50
            offset: expect.any(Object), // Should be 0
          })
        );
      });
    });

    describe('searchAgents', () => {
      it('should search agents with fulltext search', async () => {
        const mockAgents = [{ id: 'agent-1', name: 'Matching Agent' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a, score: 0.95 })));

        const result = await repository.searchAgents('test query');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'CALL db.index.fulltext.queryNodes("agentSearch", $query) YIELD node as a, score RETURN a, score ORDER BY score DESC LIMIT 20',
          { query: 'test query' }
        );
        expect(result).toEqual(mockAgents);
      });
    });

    describe('findWithFilters', () => {
      it('should filter agents by multiple criteria', async () => {
        const mockAgents = [{ id: 'agent-1', category: 'general' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const filters = {
          category: 'general',
          tags: ['ai'],
          isPublic: true,
          authorId: 'author-123',
          starshipClass: 'scout' as const,
        };

        const result = await repository.findWithFilters(filters);

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE 1=1'),
          expect.objectContaining({
            category: 'general',
            tags: ['ai'],
            isPublic: true,
            authorId: 'author-123',
            starshipClass: 'scout',
          })
        );
        expect(result).toEqual(mockAgents);
      });

      it('should handle empty filters', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findWithFilters({});

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE 1=1 RETURN a ORDER BY a.updatedAt DESC',
          {}
        );
        expect(result).toEqual([]);
      });
    });
  });

  describe('Action Methods', () => {
    describe('incrementUsageCount', () => {
      it('should increment usage count', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        await repository.incrementUsageCount('agent-123');

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.id = $id SET a.usageCount = a.usageCount + 1, a.updatedAt = $timestamp',
          {
            id: 'agent-123',
            timestamp: expect.any(String),
          }
        );
      });
    });

    describe('updateRating', () => {
      it('should update agent rating', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        await repository.updateRating('agent-123', 4.5);

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.id = $id SET a.rating = $rating, a.updatedAt = $timestamp',
          {
            id: 'agent-123',
            rating: 4.5,
            timestamp: expect.any(String),
          }
        );
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
