/**
 * MemoryRepository Unit Tests
 */

import { MemoryRepository } from '../MemoryRepository';
import { Neo4jConnection } from '../../helpers/database';
import { DatabaseError } from '../../helpers/errors';
import type { MemoryModel } from '@starships/protocol';

// Mock dependencies
jest.mock('../../helpers/database/connection');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-memory-id')
}));

describe('MemoryRepository', () => {
  let repository: MemoryRepository;
  let mockGetConnection: jest.MockedFunction<any>;
  let mockConnection: jest.Mocked<Neo4jConnection>;

  beforeEach(() => {
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    } as any;

    // Mock getConnection to return our mock connection
    mockGetConnection = require('../../helpers/database/connection').getConnection;
    mockGetConnection.mockReturnValue(mockConnection);

    repository = new MemoryRepository();
    jest.clearAllMocks();
  });

  const createMockMemory = (overrides: Partial<MemoryModel> = {}): MemoryModel => ({
    id: 'memory-123',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: '1.0.0',
    messageCount: 5,
    state: {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ],
      context: { currentTopic: 'greeting' }
    },
    ...overrides
  });

  const createMockCreateInput = (overrides: any = {}) => ({
    starshipId: 'starship-123',
    version: '1.0.0',
    state: {
      messages: [],
      context: {}
    },
    ...overrides
  });

  describe('constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository).toBeInstanceOf(MemoryRepository);
    });
  });

  describe('findAll', () => {
    it('should return all memories ordered by creation date', async () => {
      const mockMemories = [
        createMockMemory({ id: 'memory-1' }),
        createMockMemory({ id: 'memory-2' })
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockMemories.map(m => ({ m }))
      );

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY m.createdAt DESC')
      );
    });

    it('should return empty array when no memories found', async () => {
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
    it('should return memory when found', async () => {
      const mockMemory = createMockMemory();
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMemory }]);

      const result = await repository.findById('memory-123');

      expect(result).toMatchObject({
        id: 'memory-123',
        version: '1.0.0'
      });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.id = $id'),
        { id: 'memory-123' }
      );
    });

    it('should return null when memory not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findById('memory-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findByStarshipId', () => {
    it('should return memories for starship', async () => {
      const mockMemories = [createMockMemory()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMemories.map(m => ({ m }))
      );

      const result = await repository.findByStarshipId('starship-123');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory)'),
        { starshipId: 'starship-123' }
      );
    });

    it('should return empty array when starship has no memories', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByStarshipId('empty-starship');

      expect(result).toEqual([]);
    });
  });

  describe('findByAgentId', () => {
    it('should return memories for agent', async () => {
      const mockMemories = [createMockMemory()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMemories.map(m => ({ m }))
      );

      const result = await repository.findByAgentId('agent-123');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (a:Agent {id: $agentId})-[:HAS_MEMORY]->(m:Memory)'),
        { agentId: 'agent-123' }
      );
    });
  });

  describe('findByTags', () => {
    it('should return memories matching tags', async () => {
      const mockMemories = [createMockMemory()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMemories.map(m => ({ m }))
      );

      const result = await repository.findByTags(['ai', 'conversation']);

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE any(tag IN $tags WHERE tag IN m.tags)'),
        { tags: ['ai', 'conversation'] }
      );
    });

    it('should handle empty tag array', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByTags([]);

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create memory successfully', async () => {
      const createInput = createMockCreateInput();
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(createInput);

      expect(result).toMatchObject({
        version: '1.0.0',
        messageCount: 0,
        state: { messages: [], context: {} }
      });
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (m:Memory $props)'),
        expect.objectContaining({
          props: expect.objectContaining({
            state: JSON.stringify({ messages: [], context: {} })
          }),
          starshipId: 'starship-123'
        })
      );
    });

    it('should use default values for optional fields', async () => {
      const minimalInput = {
        starshipId: 'starship-123',
        version: '1.0.0',
        state: {}
      };
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(minimalInput);

      expect(result.version).toBe('1.0.0');
      expect(result.messageCount).toBe(0);
      expect(result.state).toEqual({});
    });

    it('should serialize complex state objects', async () => {
      const complexInput = createMockCreateInput({
        state: {
          messages: [{ role: 'user', content: 'test' }],
          metadata: { complex: { nested: 'data' } }
        }
      });
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.create(complexInput);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          props: expect.objectContaining({
            state: JSON.stringify({
              messages: [{ role: 'user', content: 'test' }],
              metadata: { complex: { nested: 'data' } }
            })
          })
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.create(createMockCreateInput())).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should update memory successfully', async () => {
      const updates = {
        state: { messages: [{ role: 'user', content: 'updated' }] },
        messageCount: 10
      };
      const mockUpdated = createMockMemory(updates);
      
      mockConnection.executeWrite.mockResolvedValue([{ m: mockUpdated }]);

      const result = await repository.update('memory-123', updates);

      expect(result).toMatchObject(updates);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET m += $updates'),
        expect.objectContaining({
          id: 'memory-123',
          updates: expect.objectContaining({
            state: JSON.stringify({ messages: [{ role: 'user', content: 'updated' }] })
          })
        })
      );
    });

    it('should return null when memory not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('non-existent', { messageCount: 5 });

      expect(result).toBeNull();
    });

    it('should serialize complex fields in updates', async () => {
      const complexUpdates = {
        state: { complex: { nested: { deep: 'value' } } }
      };
      mockConnection.executeWrite.mockResolvedValue([{ m: createMockMemory(complexUpdates) }]);

      await repository.update('memory-123', complexUpdates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          updates: expect.objectContaining({
            state: JSON.stringify({ complex: { nested: { deep: 'value' } } })
          })
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.update('memory-123', { messageCount: 5 })).rejects.toThrow(DatabaseError);
    });
  });

  describe('delete', () => {
    it('should delete memory successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('memory-123');

      expect(result).toBe(true);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE m'),
        { id: 'memory-123' }
      );
    });

    it('should return false when memory not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.delete('memory-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('searchMemories', () => {
    it('should search memories without filters', async () => {
      const mockMemories = [createMockMemory()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMemories.map(m => ({ m }))
      );

      const result = await repository.searchMemories('search term');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:Memory) WHERE m.id IS NOT NULL'),
        {}
      );
    });

    it('should search memories with starship filter', async () => {
      const mockMemories = [createMockMemory()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMemories.map(m => ({ m }))
      );

      const result = await repository.searchMemories('search', { starshipId: 'starship-123' });

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory)'),
        { starshipId: 'starship-123' }
      );
    });

    it('should limit results to 50', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      await repository.searchMemories('search');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 50'),
        {}
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.searchMemories('search')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getMemoryStats', () => {
    it('should return memory statistics', async () => {
      const mockMemory = createMockMemory({
        state: {
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            { role: 'system', content: 'System message' }
          ]
        },
        updatedAt: '2024-01-01T12:00:00.000Z'
      });
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMemory }]);

      const result = await repository.getMemoryStats('memory-123');

      expect(result).toEqual({
        totalMessages: 3,
        messagesByRole: { system: 1, user: 1, assistant: 1 },
        sizeInBytes: expect.any(Number),
        lastUpdated: '2024-01-01T12:00:00.000Z'
      });
      expect(result!.sizeInBytes).toBeGreaterThan(0);
    });

    it('should return null when memory not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getMemoryStats('non-existent');

      expect(result).toBeNull();
    });

    it('should handle memory with no messages', async () => {
      const mockMemory = createMockMemory({
        state: { messages: [] }
      });
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMemory }]);

      const result = await repository.getMemoryStats('memory-123');

      expect(result).toEqual({
        totalMessages: 0,
        messagesByRole: { system: 0, user: 0, assistant: 0 },
        sizeInBytes: 2, // Empty array JSON: "[]"
        lastUpdated: expect.any(String)
      });
    });

    it('should handle memory with no state.messages', async () => {
      const mockMemory = createMockMemory({
        state: { context: {} } // No messages array
      });
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMemory }]);

      const result = await repository.getMemoryStats('memory-123');

      expect(result).toEqual({
        totalMessages: 0,
        messagesByRole: { system: 0, user: 0, assistant: 0 },
        sizeInBytes: 2, // Empty array JSON: "[]"
        lastUpdated: expect.any(String)
      });
    });

    it('should handle messages with invalid roles', async () => {
      const mockMemory = createMockMemory({
        state: {
          messages: [
            { role: 'user', content: 'Valid' },
            { role: 'invalid_role', content: 'Invalid' },
            { content: 'No role' } // Missing role
          ]
        }
      });
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMemory }]);

      const result = await repository.getMemoryStats('memory-123');

      expect(result!.totalMessages).toBe(3);
      expect(result!.messagesByRole).toEqual({ system: 0, user: 1, assistant: 0 });
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getMemoryStats('memory-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findWithFilters', () => {
    it('should find memories with starship filter', async () => {
      const mockMemories = [createMockMemory()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMemories.map(m => ({ m }))
      );

      const result = await repository.findWithFilters({ starshipId: 'starship-123' });

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory)'),
        { starshipId: 'starship-123' }
      );
    });

    it('should filter by hasMessages', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      // Filter for memories with messages
      await repository.findWithFilters({ hasMessages: true });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND m.messageCount > 0'),
        {}
      );

      // Filter for memories without messages
      await repository.findWithFilters({ hasMessages: false });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND (m.messageCount = 0 OR m.messageCount IS NULL)'),
        {}
      );
    });

    it('should apply pagination when provided', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      await repository.findWithFilters({ limit: 25, offset: 10 });

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SKIP $offset LIMIT $limit'),
        expect.objectContaining({
          limit: expect.any(Object), // Neo4j int
          offset: expect.any(Object)  // Neo4j int
        })
      );
    });

    it('should combine multiple filters', async () => {
      const filters = {
        starshipId: 'starship-123',
        hasMessages: true,
        limit: 20,
        offset: 5
      };
      mockConnection.executeQuery.mockResolvedValue([]);

      await repository.findWithFilters(filters);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory)'),
        expect.objectContaining({
          starshipId: 'starship-123',
          limit: expect.any(Object),
          offset: expect.any(Object)
        })
      );
    });

    it('should handle empty filters', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findWithFilters({});

      expect(result).toEqual([]);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:Memory) WHERE 1=1'),
        {}
      );
    });
  });

  describe('serialization/deserialization', () => {
    it('should serialize complex state correctly', () => {
      const repo = repository as any;
      const memory = createMockMemory({
        state: {
          messages: [{ role: 'user', content: 'test' }],
          context: { topic: 'greeting' }
        }
      });

      const serialized = repo.serializeComplexFields(memory);

      expect(serialized.state).toBe(JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
        context: { topic: 'greeting' }
      }));
    });

    it('should handle null/undefined state', () => {
      const repo = repository as any;
      const memory = createMockMemory({ state: null as any });

      const serialized = repo.serializeComplexFields(memory);

      expect(serialized.state).toBe('{}');
    });

    it('should deserialize complex state correctly', () => {
      const repo = repository as any;
      const rawMemory = {
        id: 'memory-123',
        state: JSON.stringify({
          messages: [{ role: 'user', content: 'test' }],
          context: { topic: 'greeting' }
        })
      };

      const deserialized = repo.deserializeComplexFields(rawMemory);

      expect(deserialized.state).toEqual({
        messages: [{ role: 'user', content: 'test' }],
        context: { topic: 'greeting' }
      });
    });

    it('should handle invalid JSON gracefully', () => {
      const repo = repository as any;
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const rawMemory = {
        id: 'memory-123',
        state: 'invalid-json{'
      };

      const deserialized = repo.deserializeComplexFields(rawMemory);

      expect(deserialized.state).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to deserialize memory'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle null state field', () => {
      const repo = repository as any;
      const rawMemory = {
        id: 'memory-123',
        state: null
      };

      const deserialized = repo.deserializeComplexFields(rawMemory);

      expect(deserialized.state).toEqual({});
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete memory lifecycle', async () => {
      const starshipId = 'starship-123';
      const createInput = createMockCreateInput({ starshipId });

      // Create
      mockConnection.executeWrite.mockResolvedValue([]);
      const created = await repository.create(createInput);
      expect(created.id).toBe('test-memory-id');

      // Find by starship
      const mockMemories = [createMockMemory()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMemories.map(m => ({ m }))
      );
      const found = await repository.findByStarshipId(starshipId);
      expect(found).toHaveLength(1);

      // Update
      const updates = { messageCount: 10 };
      mockConnection.executeWrite.mockResolvedValue([{ m: createMockMemory(updates) }]);
      const updated = await repository.update('memory-123', updates);
      expect(updated!.messageCount).toBe(10);

      // Get stats
      mockConnection.executeQuery.mockResolvedValue([{ m: createMockMemory() }]);
      const stats = await repository.getMemoryStats('memory-123');
      expect(stats).toBeDefined();

      // Delete
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);
      const deleted = await repository.delete('memory-123');
      expect(deleted).toBe(true);
    });

    it('should handle search and filter operations', async () => {
      const mockMemories = [createMockMemory()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMemories.map(m => ({ m }))
      );

      // Search all
      const searchResults = await repository.searchMemories('test');
      expect(searchResults).toHaveLength(1);

      // Search with starship filter
      const filteredResults = await repository.searchMemories('test', { starshipId: 'starship-123' });
      expect(filteredResults).toHaveLength(1);

      // Find by tags
      const tagResults = await repository.findByTags(['conversation', 'ai']);
      expect(tagResults).toHaveLength(1);

      // Find with filters
      const filterResults = await repository.findWithFilters({
        starshipId: 'starship-123',
        hasMessages: true,
        limit: 10
      });
      expect(filterResults).toHaveLength(1);

      expect(mockConnection.executeQuery).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling scenarios', () => {
    it('should handle constraint violations', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('constraint violation'));

      await expect(repository.create(createMockCreateInput())).rejects.toThrow(DatabaseError);
    });

    it('should handle connection timeouts', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('connection timeout'));

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });

    it('should handle query syntax errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('syntax error in query'));

      await expect(repository.findById('memory-123')).rejects.toThrow(DatabaseError);
    });

    it('should handle network errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('network error'));

      await expect(repository.delete('memory-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('edge cases', () => {
    it('should handle very large memory states', async () => {
      const largeState = {
        messages: Array.from({ length: 1000 }, (_, i) => ({
          role: 'user',
          content: `Message ${i}`
        })),
        metadata: { size: 'large' }
      };
      const createInput = createMockCreateInput({ state: largeState });
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(createInput);

      expect(result.state).toEqual(largeState);
    });

    it('should handle memories with complex nested state', async () => {
      const complexState = {
        messages: [{ role: 'user', content: 'test' }],
        context: {
          conversation: {
            history: [
              { topic: 'greeting', sentiment: 'positive' },
              { topic: 'question', sentiment: 'neutral' }
            ],
            preferences: { language: 'en', theme: 'dark' }
          },
          agent: {
            personality: { traits: ['helpful', 'concise'] },
            capabilities: ['text', 'analysis']
          }
        }
      };
      const createInput = createMockCreateInput({ state: complexState });
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(createInput);

      expect(result.state).toEqual(complexState);
    });

    it('should handle memories without starshipId relationship', async () => {
      // Create memory for agent instead of starship
      const agentMemories = [createMockMemory()];
      mockConnection.executeQuery.mockResolvedValue(
        agentMemories.map(m => ({ m }))
      );

      const result = await repository.findByAgentId('agent-123');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (a:Agent {id: $agentId})-[:HAS_MEMORY]->(m:Memory)'),
        { agentId: 'agent-123' }
      );
    });

    it('should handle filters with undefined agentId', async () => {
      // agentId filter is mentioned in searchMemories but not implemented
      const filters = {
        starshipId: 'starship-123',
        agentId: 'agent-123', // This should be ignored since not implemented
        tags: ['test']         // This should be ignored since not implemented
      };
      mockConnection.executeQuery.mockResolvedValue([]);

      await repository.searchMemories('search', filters);

      // Should only apply starshipId filter
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory)'),
        { starshipId: 'starship-123' }
      );
    });

    it('should handle zero message count in stats', async () => {
      const mockMemory = createMockMemory({
        state: {}
      });
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMemory }]);

      const result = await repository.getMemoryStats('memory-123');

      expect(result!.totalMessages).toBe(0);
      expect(result!.messagesByRole).toEqual({ system: 0, user: 0, assistant: 0 });
    });
  });
});