import { AgentRepository } from '../../src/repositories/AgentRepository';
import { Agent } from '../../src/types';
import { getConnection } from '../../src/connection';
import { convertNeo4jIntsInObject, convertNeo4jIntsInArray } from '../../src/utils/neo4j-helpers';

// Mock dependencies
jest.mock('../../src/connection');
jest.mock('../../src/utils/neo4j-helpers');
// Use the global UUID mock

const mockConnection = {
  executeQuery: jest.fn(),
  executeWrite: jest.fn(),
};

const mockGetConnection = getConnection as jest.MockedFunction<typeof getConnection>;
const mockConvertNeo4jIntsInObject = convertNeo4jIntsInObject as jest.MockedFunction<typeof convertNeo4jIntsInObject>;
const mockConvertNeo4jIntsInArray = convertNeo4jIntsInArray as jest.MockedFunction<typeof convertNeo4jIntsInArray>;

describe('AgentRepository', () => {
  let repository: AgentRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnection.mockReturnValue(mockConnection as any);
    mockConvertNeo4jIntsInObject.mockImplementation((obj) => obj);
    mockConvertNeo4jIntsInArray.mockImplementation((arr) => arr);
    repository = new AgentRepository();
  });

  describe('findAll', () => {
    it('should return all agents ordered by creation date', async () => {
      const mockAgents = [
        { id: '1', name: 'Agent 1', createdAt: '2023-01-01' },
        { id: '2', name: 'Agent 2', createdAt: '2023-01-02' }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findAll();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent) RETURN a ORDER BY a.createdAt DESC'
      );
      expect(mockConvertNeo4jIntsInArray).toHaveBeenCalledWith(mockAgents);
      expect(result).toEqual(mockAgents);
    });
  });

  describe('findById', () => {
    it('should return agent by id', async () => {
      const mockAgent = { id: '1', name: 'Test Agent' };
      mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

      const result = await repository.findById('1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.id = $id RETURN a',
        { id: '1' }
      );
      expect(mockConvertNeo4jIntsInObject).toHaveBeenCalledWith(mockAgent);
      expect(result).toEqual(mockAgent);
    });

    it('should return null when agent not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should return agents that user interacts with', async () => {
      const mockAgents = [{ id: '1', name: 'Agent 1' }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findByUser('user-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent)<-[:INTERACTS_WITH]-(u:User) WHERE u.id = $userId RETURN a',
        { userId: 'user-1' }
      );
      expect(result).toEqual(mockAgents);
    });
  });

  describe('findByStarship', () => {
    it('should return agents deployed on starship', async () => {
      const mockAgents = [{ id: '1', name: 'Agent 1' }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findByStarship('starship-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a ORDER BY a.name',
        { starshipId: 'starship-1' }
      );
      expect(result).toEqual(mockAgents);
    });
  });

  describe('findByStarshipId', () => {
    it('should return agents by starshipId field', async () => {
      const mockAgents = [{ id: '1', name: 'Agent 1', starshipId: 'starship-1' }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findByStarshipId('starship-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.starshipId = $starshipId RETURN a ORDER BY a.name',
        { starshipId: 'starship-1' }
      );
      expect(result).toEqual(mockAgents);
    });
  });

  describe('updateStarshipId', () => {
    it('should update agent starshipId and create relationship', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]);
      mockConnection.executeWrite
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await repository.updateStarshipId('agent-1', 'starship-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (s:Starship) WHERE s.id = $starshipId RETURN count(s) as count',
        { starshipId: 'starship-1' }
      );
      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(3);
    });

    it('should throw error when starship not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ count: 0 }]);

      await expect(repository.updateStarshipId('agent-1', 'nonexistent'))
        .rejects.toThrow('Starship with id nonexistent not found');
    });

    it('should throw error when agent not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]);
      mockConnection.executeWrite.mockResolvedValue([{ count: 0 }]);

      await expect(repository.updateStarshipId('nonexistent', 'starship-1'))
        .rejects.toThrow('Agent with id nonexistent not found');
    });
  });

  describe('findUndeployedAgents', () => {
    it('should return agents without starshipId', async () => {
      const mockAgents = [{ id: '1', name: 'Agent 1', starshipId: null }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findUndeployedAgents();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.starshipId IS NULL OR a.starshipId = "" RETURN a ORDER BY a.createdAt DESC',
        {}
      );
      expect(result).toEqual(mockAgents);
    });
  });

  describe('create', () => {
    it('should create new agent with required fields', async () => {
      const agentData = {
        name: 'Test Agent',
        model: 'gpt-4',
        systemPrompt: 'Test prompt',
        starshipId: 'starship-1',
        authorId: 'user-1',
        category: 'general' as const,
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      };

      mockConnection.executeWrite
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const result = await repository.create(agentData);

      expect(result).toMatchObject({
        ...agentData,
        id: expect.any(String),
        usageCount: 0,
        tags: ['test'],
        category: 'general',
        isPublic: false,
        version: '1.0.0'
      });
      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2);
    });

    it('should throw error when starshipId is missing', async () => {
      const agentData = {
        name: 'Test Agent',
        model: 'gpt-4',
        systemPrompt: 'Test prompt',
        authorId: 'user-1'
      };

      await expect(repository.create(agentData as any))
        .rejects.toThrow('starshipId is required when creating an agent');
    });
  });

  describe('update', () => {
    it('should update agent with new data', async () => {
      const mockAgent = { id: '1', name: 'Updated Agent' };
      mockConnection.executeWrite.mockResolvedValue([{ a: mockAgent }]);

      const result = await repository.update('1', { name: 'Updated Agent' });

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.id = $id SET a += $updates RETURN a',
        expect.objectContaining({
          id: '1',
          updates: expect.objectContaining({
            name: 'Updated Agent',
            updatedAt: expect.any(String)
          })
        })
      );
      expect(result).toEqual(mockAgent);
    });

    it('should return null when agent not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('nonexistent', { name: 'Updated' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete agent and return true', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('1');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.id = $id DETACH DELETE a RETURN count(a) as deletedCount',
        { id: '1' }
      );
      expect(result).toBe(true);
    });

    it('should return false when agent not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('findByAuthor', () => {
    it('should return agents by author', async () => {
      const mockAgents = [{ id: '1', name: 'Agent 1', authorId: 'user-1' }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findByAuthor('user-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.authorId = $authorId RETURN a ORDER BY a.updatedAt DESC',
        { authorId: 'user-1' }
      );
      expect(result).toEqual(mockAgents);
    });
  });

  describe('findByCategory', () => {
    it('should return agents by category', async () => {
      const mockAgents = [{ id: '1', name: 'Agent 1', category: 'assistant' }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findByCategory('assistant');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.category = $category RETURN a ORDER BY a.name',
        { category: 'assistant' }
      );
      expect(result).toEqual(mockAgents);
    });
  });

  describe('findByTags', () => {
    it('should return agents matching any of the tags', async () => {
      const mockAgents = [{ id: '1', name: 'Agent 1', tags: ['tag1', 'tag2'] }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findByTags(['tag1', 'tag3']);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE ANY(tag IN $tags WHERE tag IN a.tags) RETURN a ORDER BY a.name',
        { tags: ['tag1', 'tag3'] }
      );
      expect(result).toEqual(mockAgents);
    });
  });

  describe('findPublic', () => {
    it('should return public agents with default pagination', async () => {
      const mockAgents = [{ id: '1', name: 'Public Agent', isPublic: true }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findPublic();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.isPublic = true RETURN a ORDER BY a.usageCount DESC, a.rating DESC SKIP $offset LIMIT $limit',
        expect.objectContaining({
          limit: expect.any(Object), // neo4j int
          offset: expect.any(Object) // neo4j int
        })
      );
      expect(result).toEqual(mockAgents);
    });

    it('should return public agents with custom pagination', async () => {
      const mockAgents = [{ id: '1', name: 'Public Agent', isPublic: true }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findPublic(10, 20);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.isPublic = true RETURN a ORDER BY a.usageCount DESC, a.rating DESC SKIP $offset LIMIT $limit',
        expect.objectContaining({
          limit: expect.any(Object), // neo4j int(10)
          offset: expect.any(Object) // neo4j int(20)
        })
      );
      expect(result).toEqual(mockAgents);
    });
  });

  describe('searchAgents', () => {
    it('should search agents using fulltext search', async () => {
      const mockAgents = [{ id: '1', name: 'Matching Agent' }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a, score: 1.0 }))
      );

      const result = await repository.searchAgents('test query');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'CALL db.index.fulltext.queryNodes("agentSearch", $query) YIELD node as a, score RETURN a, score ORDER BY score DESC LIMIT 20',
        { query: 'test query' }
      );
      expect(result).toEqual(mockAgents);
    });
  });

  describe('incrementUsageCount', () => {
    it('should increment agent usage count', async () => {
      mockConnection.executeWrite.mockResolvedValue(undefined);

      await repository.incrementUsageCount('agent-1');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.id = $id SET a.usageCount = a.usageCount + 1, a.updatedAt = $timestamp',
        { id: 'agent-1', timestamp: expect.any(String) }
      );
    });
  });

  describe('updateRating', () => {
    it('should update agent rating', async () => {
      mockConnection.executeWrite.mockResolvedValue(undefined);

      await repository.updateRating('agent-1', 4.5);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE a.id = $id SET a.rating = $rating, a.updatedAt = $timestamp',
        { id: 'agent-1', rating: 4.5, timestamp: expect.any(String) }
      );
    });
  });

  describe('findWithFilters', () => {
    it('should build dynamic query with filters', async () => {
      const mockAgents = [{ id: '1', name: 'Filtered Agent' }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const filters = {
        category: 'assistant',
        tags: ['tag1'],
        isPublic: true,
        authorId: 'user-1',
        starshipClass: 'scout' as const
      };

      const result = await repository.findWithFilters(filters);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND a.category = $category'),
        expect.objectContaining(filters)
      );
      expect(result).toEqual(mockAgents);
    });

    it('should handle empty filters', async () => {
      const mockAgents = [{ id: '1', name: 'All Agent' }];
      mockConnection.executeQuery.mockResolvedValue(
        mockAgents.map(a => ({ a }))
      );

      const result = await repository.findWithFilters({});

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (a:Agent) WHERE 1=1 RETURN a ORDER BY a.updatedAt DESC',
        {}
      );
      expect(result).toEqual(mockAgents);
    });
  });
});