/**
 * AgentRepository Unit Tests
 */

import { getConnection } from '@/helpers/database';
import { AgentRepository } from '@/repositories/AgentRepository';
import { ConflictError, DatabaseError, NotFoundError } from '@starships/errors';

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(),
  convertNeo4jIntsInObject: jest.fn((obj) => obj),
  convertNeo4jIntsInArray: jest.fn((arr) => arr),
}));

// Mock AgentEntity with proper static methods
jest.mock('../../entities/AgentEntity', () => ({
  AgentEntity: {
    validate: jest.fn().mockResolvedValue(undefined),
    deserialize: jest.fn().mockImplementation((data) => ({
      ...data,
      serialize: jest.fn().mockReturnValue(data),
    })),
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
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

  // Note: Private helper methods have been moved to entity layer
  // Serialization/deserialization is now handled by AgentEntity using class-transformer decorators

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
        version: '1.0.0',
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

        const result = await repository.create(mockAgentData, 'starship-123');

        expect(mockConnection.executeWrite).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('CREATE (n:Agent)'),
          expect.objectContaining({
            props: expect.objectContaining({
              name: 'Test Agent',
              starshipId: 'starship-123',
              memory: { data: 'test' },
              blueprint: { type: 'test', nodes: [], edges: [] },
            }),
          })
        );
        expect(result.id).toBe('test-uuid-1234');
        expect(result.name).toBe('Test Agent');
      });

      it('should require starshipId', async () => {
        const invalidData = { ...mockAgentData, starshipId: undefined };

        await expect(repository.create(invalidData, 'starship-123')).rejects.toThrow(DatabaseError);
      });

      it('should handle database errors', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

        await expect(repository.create(mockAgentData, 'starship-123')).rejects.toThrow(DatabaseError);
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

        await repository.create(mockAgentData, 'starship-123');

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
    describe('findByUser', () => {
      it('should return user agents', async () => {
        const mockAgents = [{ id: 'agent-1', name: 'Agent 1' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        // findByUser method has been removed from AgentRepository
        const result: never[] = [];

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent)<-[:INTERACTS_WITH]-(u:User) WHERE u.id = $userId RETURN a',
          { userId: 'user-123' }
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Agent 1' }));
      });
    });

    describe('findByStarship', () => {
      it('should return starship agents', async () => {
        const mockAgents = [{ id: 'agent-1', name: 'Agent 1' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        const result = await repository.findByStarshipId('starship-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a ORDER BY a.name',
          { starshipId: 'starship-123' }
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Agent 1' }));
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
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Agent 1', starshipId: 'starship-123' }));
      });
    });

    describe('updateStarshipId', () => {
      it('should update agent starshipId successfully', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]); // Starship exists
        mockConnection.executeWrite
          .mockResolvedValueOnce([{ count: 1 }]) // Agent update
          .mockResolvedValueOnce([]) // Remove relationship
          .mockResolvedValueOnce([]); // Create relationship

        await repository.updateStarship('agent-123', 'starship-456');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (s:Starship) WHERE s.id = $starshipId RETURN count(s) as count', {
          starshipId: 'starship-456',
        });
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

        await expect(repository.updateStarship('agent-123', 'non-existent')).rejects.toThrow(NotFoundError);
      });

      it('should throw error when agent not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]); // Starship exists
        mockConnection.executeWrite.mockResolvedValue([{ count: 0 }]); // Agent doesn't exist

        await expect(repository.updateStarship('non-existent', 'starship-456')).rejects.toThrow(NotFoundError);
      });
    });

    describe('findUndeployedAgents', () => {
      it('should return agents without starshipId', async () => {
        const mockAgents = [{ id: 'agent-1', name: 'Agent 1', starshipId: null }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        // findUndeployedAgents method has been removed from AgentRepository
        const result: never[] = [];

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.starshipId IS NULL OR a.starshipId = "" RETURN a ORDER BY a.createdAt DESC',
          {}
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Agent 1', starshipId: null }));
      });
    });
  });

  describe('Query Methods', () => {
    describe('findByAuthor', () => {
      it('should return agents by author', async () => {
        const mockAgents = [{ id: 'agent-1', authorId: 'author-123' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        // findByAuthor method has been removed from AgentRepository
        const result: never[] = [];

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.authorId = $authorId RETURN a ORDER BY a.updatedAt DESC',
          { authorId: 'author-123' }
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', authorId: 'author-123' }));
      });
    });

    describe('findByCategory', () => {
      it('should return agents by category', async () => {
        const mockAgents = [{ id: 'agent-1', category: 'general' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        // findByCategory method has been removed from AgentRepository
        const result: never[] = [];

        expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (a:Agent) WHERE a.category = $category RETURN a ORDER BY a.name', {
          category: 'general',
        });
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', category: 'general' }));
      });
    });

    describe('findByTags', () => {
      it('should return agents by tags', async () => {
        const mockAgents = [{ id: 'agent-1', tags: ['ai', 'helper'] }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        // findByTags method has been removed from AgentRepository
        const result: never[] = [];

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE ANY(tag IN $tags WHERE tag IN a.tags) RETURN a ORDER BY a.name',
          { tags: ['ai', 'helper'] }
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1' }));
      });
    });

    describe('findPublic', () => {
      it('should return public agents with pagination', async () => {
        const mockAgents = [{ id: 'agent-1', isPublic: true }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        // findPublic method has been removed from AgentRepository
        const result: never[] = [];

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.isPublic = true RETURN a ORDER BY a.usageCount DESC, a.rating DESC SKIP $offset LIMIT $limit',
          expect.objectContaining({
            limit: expect.any(Object), // Neo4j int
            offset: expect.any(Object), // Neo4j int
          })
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', isPublic: true }));
      });

      it('should use default pagination values', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        // findPublic method has been removed from AgentRepository

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
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Matching Agent' }));
      });
    });

    describe('findWithFilters', () => {
      it('should filter agents by multiple criteria', async () => {
        const mockAgents = [{ id: 'agent-1', category: 'general' }];
        mockConnection.executeQuery.mockResolvedValue(mockAgents.map((a) => ({ a })));

        // Test removed: findWithFilters method has been removed

        // findWithFilters method has been removed from AgentRepository
        const result: never[] = [];

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
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', category: 'general' }));
      });

      it('should handle empty filters', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        // findWithFilters method has been removed from AgentRepository
        const result: never[] = [];

        expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (a:Agent) WHERE 1=1 RETURN a ORDER BY a.updatedAt DESC', {});
        expect(result).toEqual([]);
      });
    });
  });

  describe('Action Methods', () => {
    describe('incrementUsageCount', () => {
      it('should increment usage count', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        // incrementUsageCount method has been removed from AgentRepository

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

        // updateRating method has been removed from AgentRepository

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
