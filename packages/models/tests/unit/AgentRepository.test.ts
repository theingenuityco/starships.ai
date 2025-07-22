import { AgentRepository } from '../../src/repositories/AgentRepository';
import { getConnection } from '../../src/connection';
import { Agent } from '../../src/types';

// Mock dependencies
jest.mock('../../src/connection');

describe('AgentRepository', () => {
  let repository: AgentRepository;
  let mockConnection: any;

  const mockAgent: Agent = {
    id: 'agent-123',
    name: 'Test Agent',
    model: 'gpt-4',
    systemPrompt: 'You are a test agent',
    description: 'A test agent',
    tags: ['test'],
    category: 'general',
    authorId: 'user-123',
    isPublic: true,
    version: '1.0.0',
    usageCount: 0,
    starshipId: 'starship-123',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database connection
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };

    (getConnection as jest.Mock).mockReturnValue(mockConnection);

    // Mock Date.prototype.toISOString for consistent timestamps
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

    repository = new AgentRepository();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic CRUD Operations', () => {
    describe('findAll()', () => {
      it('should return all agents ordered by creation date', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findAll();

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) RETURN a ORDER BY a.createdAt DESC'
        );
        expect(result).toEqual([mockAgent]);
      });

      it('should return empty array when no agents exist', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findAll();

        expect(result).toEqual([]);
      });

      it('should handle database errors gracefully', async () => {
        mockConnection.executeQuery.mockRejectedValue(new Error('Database connection failed'));

        await expect(repository.findAll()).rejects.toThrow('Database connection failed');
      });
    });

    describe('findById()', () => {
      it('should return agent when found', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findById('agent-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.id = $id RETURN a',
          { id: 'agent-123' }
        );
        expect(result).toEqual(mockAgent);
      });

      it('should return null when agent not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findById('nonexistent-id');

        expect(result).toBeNull();
      });

      it('should handle database errors gracefully', async () => {
        mockConnection.executeQuery.mockRejectedValue(new Error('Query failed'));

        await expect(repository.findById('agent-123')).rejects.toThrow('Query failed');
      });
    });

    describe('create()', () => {
      const validAgentData = {
        name: 'New Agent',
        model: 'gpt-4',
        systemPrompt: 'You are a new agent',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general' as const,
        tags: ['new'],
        isPublic: false,
        version: '1.0.0',
      };

      it('should create agent successfully', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        const result = await repository.create(validAgentData);

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'CREATE (a:Agent $props) RETURN a',
          { props: expect.objectContaining({
            name: 'New Agent',
            model: 'gpt-4',
            starshipId: 'starship-123',
            usageCount: 0,
            id: expect.any(String),
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          })}
        );
        expect(result).toMatchObject({
          name: 'New Agent',
          model: 'gpt-4',
          starshipId: 'starship-123',
          usageCount: 0,
        });
      });

      it('should throw error when starshipId is missing', async () => {
        const invalidData = { ...validAgentData, starshipId: '' };

        await expect(repository.create(invalidData)).rejects.toThrow(
          'starshipId is required when creating an agent'
        );
      });

      it('should set default values for optional fields', async () => {
        const minimalData = {
          name: 'Minimal Agent',
          model: 'gpt-4',
          systemPrompt: 'Minimal',
          starshipId: 'starship-123',
          authorId: 'user-123',
          tags: [] as string[],
          category: 'general' as const,
          isPublic: false,
          version: '1.0.0',
        };
        mockConnection.executeWrite.mockResolvedValue([]);

        const result = await repository.create(minimalData);

        expect(result.tags).toEqual([]);
        expect(result.category).toBe('general');
        expect(result.isPublic).toBe(false);
        expect(result.version).toBe('1.0.0');
        expect(result.usageCount).toBe(0);
      });

      it('should handle database errors during creation', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Creation failed'));

        await expect(repository.create(validAgentData)).rejects.toThrow('Creation failed');
      });

      it('should handle Neo4j relationship creation failure gracefully', async () => {
        mockConnection.executeWrite
          .mockResolvedValueOnce([]) // Main creation succeeds
          .mockRejectedValueOnce(new Error('Relationship failed')); // Relationship fails

        // Should still succeed and log warning
        const result = await repository.create(validAgentData);
        expect(result).toMatchObject({ name: 'New Agent' });
      });
    });

    describe('update()', () => {
      it('should update agent successfully', async () => {
        const updatedAgent = { ...mockAgent, name: 'Updated Name' };
        mockConnection.executeWrite.mockResolvedValue([{ a: updatedAgent }]);

        const result = await repository.update('agent-123', { name: 'Updated Name' });

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.id = $id SET a += $updates RETURN a',
          {
            id: 'agent-123',
            updates: expect.objectContaining({
              name: 'Updated Name',
              updatedAt: '2024-01-01T00:00:00.000Z',
            }),
          }
        );
        expect(result).toEqual(updatedAgent);
      });

      it('should return null when agent not found', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        const result = await repository.update('nonexistent-id', { name: 'Test' });

        expect(result).toBeNull();
      });

      it('should handle database errors gracefully', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Update failed'));

        await expect(repository.update('agent-123', { name: 'Test' })).rejects.toThrow('Update failed');
      });
    });

    describe('delete()', () => {
      it('should delete agent successfully', async () => {
        mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

        const result = await repository.delete('agent-123');

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.id = $id DETACH DELETE a RETURN count(a) as deletedCount',
          { id: 'agent-123' }
        );
        expect(result).toBe(true);
      });

      it('should return false when agent not found', async () => {
        mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

        const result = await repository.delete('nonexistent-id');

        expect(result).toBe(false);
      });

      it('should handle database errors gracefully', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Delete failed'));

        await expect(repository.delete('agent-123')).rejects.toThrow('Delete failed');
      });
    });
  });

  describe('Specialized Query Methods', () => {
    describe('findByChannel()', () => {
      it('should return agents active in channel', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findByChannel('channel-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent)-[:ACTIVE_IN]->(c:Channel) WHERE c.id = $channelId RETURN a',
          { channelId: 'channel-123' }
        );
        expect(result).toEqual([mockAgent]);
      });

      it('should return empty array when no agents in channel', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findByChannel('empty-channel');

        expect(result).toEqual([]);
      });
    });

    describe('findByStarship()', () => {
      it('should return agents deployed on starship', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findByStarship('starship-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a ORDER BY a.name',
          { starshipId: 'starship-123' }
        );
        expect(result).toEqual([mockAgent]);
      });
    });

    describe('findByStarshipId()', () => {
      it('should return agents by starshipId property', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findByStarshipId('starship-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.starshipId = $starshipId RETURN a ORDER BY a.name',
          { starshipId: 'starship-123' }
        );
        expect(result).toEqual([mockAgent]);
      });
    });

    describe('findByAuthor()', () => {
      it('should return agents by author', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findByAuthor('user-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.authorId = $authorId RETURN a ORDER BY a.updatedAt DESC',
          { authorId: 'user-123' }
        );
        expect(result).toEqual([mockAgent]);
      });
    });

    describe('findByCategory()', () => {
      it('should return agents by category', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findByCategory('general');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.category = $category RETURN a ORDER BY a.name',
          { category: 'general' }
        );
        expect(result).toEqual([mockAgent]);
      });
    });

    describe('findByTags()', () => {
      it('should return agents matching any of the tags', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findByTags(['test', 'demo']);

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE ANY(tag IN $tags WHERE tag IN a.tags) RETURN a ORDER BY a.name',
          { tags: ['test', 'demo'] }
        );
        expect(result).toEqual([mockAgent]);
      });
    });

    describe('findPublic()', () => {
      it('should return public agents with pagination', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findPublic(10, 5);

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.isPublic = true RETURN a ORDER BY a.usageCount DESC, a.rating DESC SKIP $offset LIMIT $limit',
          { limit: expect.any(Object), offset: expect.any(Object) }
        );
        expect(result).toEqual([mockAgent]);
      });

      it('should use default pagination values', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        await repository.findPublic();

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.any(String),
          { limit: expect.any(Object), offset: expect.any(Object) }
        );
      });
    });
  });

  describe('Advanced Operations', () => {
    describe('updateStarshipId()', () => {
      it('should update starshipId successfully', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]); // Starship exists
        mockConnection.executeWrite
          .mockResolvedValueOnce([{ count: 1 }]) // Agent update succeeds
          .mockResolvedValueOnce([]) // Remove existing relationship
          .mockResolvedValueOnce([]); // Create new relationship

        await repository.updateStarshipId('agent-123', 'starship-456');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (s:Starship) WHERE s.id = $starshipId RETURN count(s) as count',
          { starshipId: 'starship-456' }
        );
        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('SET a.starshipId = $starshipId'),
          expect.objectContaining({ agentId: 'agent-123', starshipId: 'starship-456' })
        );
      });

      it('should throw error when starship not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 0 }]);

        await expect(repository.updateStarshipId('agent-123', 'nonexistent-starship'))
          .rejects.toThrow('Starship with id nonexistent-starship not found');
      });

      it('should throw error when agent not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]); // Starship exists
        mockConnection.executeWrite.mockResolvedValue([{ count: 0 }]); // Agent not found

        await expect(repository.updateStarshipId('nonexistent-agent', 'starship-456'))
          .rejects.toThrow('Agent with id nonexistent-agent not found');
      });

      it('should handle relationship update failure gracefully', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]);
        mockConnection.executeWrite
          .mockResolvedValueOnce([{ count: 1 }]) // Agent update succeeds
          .mockRejectedValueOnce(new Error('Relationship failed')); // Relationship fails

        // Should not throw error, just log warning
        await expect(repository.updateStarshipId('agent-123', 'starship-456')).resolves.not.toThrow();
      });
    });

    describe('findUndeployedAgents()', () => {
      it('should return agents without starshipId', async () => {
        const undeployedAgent = { ...mockAgent, starshipId: null };
        mockConnection.executeQuery.mockResolvedValue([{ a: undeployedAgent }]);

        const result = await repository.findUndeployedAgents();

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.starshipId IS NULL OR a.starshipId = "" RETURN a ORDER BY a.createdAt DESC',
          {}
        );
        expect(result).toEqual([undeployedAgent]);
      });
    });

    describe('incrementUsageCount()', () => {
      it('should increment usage count', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        await repository.incrementUsageCount('agent-123');

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.id = $id SET a.usageCount = a.usageCount + 1, a.updatedAt = $timestamp',
          { id: 'agent-123', timestamp: '2024-01-01T00:00:00.000Z' }
        );
      });
    });

    describe('updateRating()', () => {
      it('should update agent rating', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        await repository.updateRating('agent-123', 4.5);

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE a.id = $id SET a.rating = $rating, a.updatedAt = $timestamp',
          { id: 'agent-123', rating: 4.5, timestamp: '2024-01-01T00:00:00.000Z' }
        );
      });
    });

    describe('searchAgents()', () => {
      it('should perform full-text search', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent, score: 0.8 }]);

        const result = await repository.searchAgents('test query');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'CALL db.index.fulltext.queryNodes("agentSearch", $query) YIELD node as a, score RETURN a, score ORDER BY score DESC LIMIT 20',
          { query: 'test query' }
        );
        expect(result).toEqual([mockAgent]);
      });

      it('should handle search errors gracefully', async () => {
        mockConnection.executeQuery.mockRejectedValue(new Error('Search failed'));

        await expect(repository.searchAgents('test')).rejects.toThrow('Search failed');
      });
    });

    describe('findWithFilters()', () => {
      it('should build complex filter queries', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const filters = {
          category: 'general',
          tags: ['test', 'demo'],
          isPublic: true,
          authorId: 'user-123',
          starshipClass: 'scout' as const,
        };

        const result = await repository.findWithFilters(filters);

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE 1=1 AND a.category = $category'),
          expect.objectContaining({
            category: 'general',
            tags: ['test', 'demo'],
            isPublic: true,
            authorId: 'user-123',
            starshipClass: 'scout',
          })
        );
        expect(result).toEqual([mockAgent]);
      });

      it('should handle empty filters', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.findWithFilters({});

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (a:Agent) WHERE 1=1 RETURN a ORDER BY a.updatedAt DESC',
          {}
        );
        expect(result).toEqual([mockAgent]);
      });

      it('should handle boolean false filter correctly', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        await repository.findWithFilters({ isPublic: false });

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('AND a.isPublic = $isPublic'),
          expect.objectContaining({ isPublic: false })
        );
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should handle connection timeout errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Connection timeout'));

      await expect(repository.findAll()).rejects.toThrow('Connection timeout');
    });

    it('should handle malformed query responses', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ invalidStructure: 'test' }]);

      const result = await repository.findAll();

      expect(result).toEqual([undefined]);
    });

    it('should handle concurrent operation conflicts', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Concurrent modification'));

      await expect(repository.update('agent-123', { name: 'Test' }))
        .rejects.toThrow('Concurrent modification');
    });
  });
});