/**
 * MessageRepository Unit Tests
 */

import { MessageRepository } from '../MessageRepository';
import { Neo4jConnection, getConnection } from '../../helpers/database';
import { ValidationError, DatabaseError } from '@starships/errors';
import type { MessageModel } from '@starships/protocol';

// Mock dependencies
jest.mock('../../helpers/database/connection');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-message-id')
}));

describe('MessageRepository', () => {
  let repository: MessageRepository;
  let mockGetConnection: jest.MockedFunction<any>;
  let mockConnection: jest.Mocked<Neo4jConnection>;

  beforeEach(() => {
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    } as any;

    // Mock getConnection to return our mock connection
    mockGetConnection = getConnection as jest.MockedFunction<typeof getConnection>;
    mockGetConnection.mockReturnValue(mockConnection);

    repository = new MessageRepository();
    jest.clearAllMocks();
  });

  const createMockMessage = (overrides: Partial<MessageModel> = {}): MessageModel => ({
    id: 'message-123',
    timestamp: '2024-01-01T00:00:00.000Z',
    role: 'user',
    content: 'Hello, world!',
    metadata: { source: 'chat' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: '1.0.0',
    starshipId: 'starship-123',
    agentId: 'agent-123',
    memoryId: 'memory-123',
    conversationId: 'conversation-123',
    parentMessageId: undefined,
    threadDepth: 0,
    processingStatus: 'completed' as const,
    processingMetadata: { duration: 1500 },
    messageType: 'user_input' as const,
    importance: 'medium' as const,
    contentHash: 'abc123',
    contentLength: 13,
    hasAttachments: false,
    tokenCount: 10,
    processingTimeMs: 1500,
    ...overrides
  });

  const createMockCreateInput = (overrides: any = {}) => ({
    timestamp: '2024-01-01T00:00:00.000Z',
    role: 'user' as const,
    content: 'Hello, world!',
    starshipId: 'starship-123',
    agentId: 'agent-123',
    memoryId: 'memory-123',
    conversationId: 'conversation-123',
    version: '1.0.0',
    threadDepth: 0,
    processingStatus: 'pending' as const,
    messageType: 'user_input' as const,
    importance: 'medium' as const,
    contentLength: 13,
    hasAttachments: false,
    ...overrides
  });

  describe('constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository).toBeInstanceOf(MessageRepository);
    });
  });

  describe('findAll', () => {
    it('should return all messages ordered by timestamp', async () => {
      const mockMessages = [
        createMockMessage({ id: 'message-1' }),
        createMockMessage({ id: 'message-2' })
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(m => ({ m }))
      );

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY m.timestamp DESC')
      );
    });

    it('should return empty array when no messages found', async () => {
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
    it('should return message when found', async () => {
      const mockMessage = createMockMessage();
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMessage }]);

      const result = await repository.findById('message-123');

      expect(result).toMatchObject({
        id: 'message-123',
        content: 'Hello, world!'
      });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.id = $id'),
        { id: 'message-123' }
      );
    });

    it('should return null when message not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findById('message-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findByStarshipId', () => {
    it('should return messages for starship', async () => {
      const mockMessages = [createMockMessage()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(m => ({ m }))
      );

      const result = await repository.findByStarshipId('starship-123');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.starshipId = $starshipId'),
        { starshipId: 'starship-123' }
      );
    });
  });

  describe('findByAgentId', () => {
    it('should return messages for agent', async () => {
      const mockMessages = [createMockMessage()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(m => ({ m }))
      );

      const result = await repository.findByAgentId('agent-123');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.agentId = $agentId'),
        { agentId: 'agent-123' }
      );
    });
  });

  describe('findByMemoryId', () => {
    it('should return messages for memory ordered chronologically', async () => {
      const mockMessages = [createMockMessage()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(m => ({ m }))
      );

      const result = await repository.findByMemoryId('memory-123');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY m.timestamp ASC'),
        { memoryId: 'memory-123' }
      );
    });
  });

  describe('findByConversationId', () => {
    it('should return conversation messages without pagination', async () => {
      const mockMessages = [createMockMessage()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(m => ({ m }))
      );

      const result = await repository.findByConversationId('conversation-123');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.conversationId = $conversationId'),
        { conversationId: 'conversation-123' }
      );
    });

    it('should return conversation messages with pagination', async () => {
      const mockMessages = [createMockMessage()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(m => ({ m }))
      );

      const result = await repository.findByConversationId('conversation-123', 10, 5);

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SKIP $offset LIMIT $limit'),
        expect.objectContaining({
          conversationId: 'conversation-123',
          limit: expect.any(Object), // Neo4j int
          offset: expect.any(Object)  // Neo4j int
        })
      );
    });
  });

  describe('findByRole', () => {
    it('should return messages by role', async () => {
      const mockMessages = [createMockMessage({ role: 'assistant' })];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(m => ({ m }))
      );

      const result = await repository.findByRole('assistant');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.role = $role'),
        { role: 'assistant' }
      );
    });

    it('should filter by role and starship', async () => {
      const mockMessages = [createMockMessage({ role: 'user' })];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(m => ({ m }))
      );

      const result = await repository.findByRole('user', 'starship-123');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND m.starshipId = $starshipId'),
        { role: 'user', starshipId: 'starship-123' }
      );
    });
  });

  describe('create', () => {
    it('should create message successfully', async () => {
      const createInput = createMockCreateInput();
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(createInput);

      expect(result).toMatchObject({
        role: 'user',
        content: 'Hello, world!',
        contentLength: 13
      });
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (m:Message $props)'),
        expect.objectContaining({
          props: expect.objectContaining({
            role: 'user',
            content: 'Hello, world!',
            contentLength: 13
          })
        })
      );
    });

    it('should validate required fields', async () => {
      const invalidInput = { content: 'Hello' }; // Missing role and starshipId

      await expect(repository.create(invalidInput as any)).rejects.toThrow(ValidationError);
    });

    it('should validate role enum', async () => {
      const invalidRole = createMockCreateInput({ role: 'invalid' });

      await expect(repository.create(invalidRole)).rejects.toThrow(ValidationError);
    });

    it('should use default values for optional fields', async () => {
      const minimalInput = {
        timestamp: '2024-01-01T00:00:00.000Z',
        role: 'user' as const,
        content: 'Test message',
        starshipId: 'starship-123',
        version: '1.0.0',
        threadDepth: 0,
        processingStatus: 'pending' as const,
        messageType: 'user_input' as const,
        importance: 'medium' as const,
        contentLength: 12,
        hasAttachments: false
      };
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(minimalInput);

      expect(result.threadDepth).toBe(0);
      expect(result.processingStatus).toBe('pending');
      expect(result.messageType).toBe('user_input');
      expect(result.importance).toBe('medium');
      expect(result.hasAttachments).toBe(false);
    });

    it('should serialize complex metadata', async () => {
      const inputWithMetadata = createMockCreateInput({
        metadata: { complex: { nested: 'data' } },
        processingMetadata: { tokens: 150 }
      });
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.create(inputWithMetadata);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          props: expect.objectContaining({
            metadata: JSON.stringify({ complex: { nested: 'data' } }),
            processingMetadata: JSON.stringify({ tokens: 150 })
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
    it('should update message successfully', async () => {
      const updates = { content: 'Updated content', processingStatus: 'completed' as const };
      const mockUpdated = createMockMessage(updates);
      
      mockConnection.executeWrite.mockResolvedValue([{ m: mockUpdated }]);

      const result = await repository.update('message-123', updates);

      expect(result).toMatchObject(updates);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET m += $updates'),
        expect.objectContaining({
          id: 'message-123',
          updates: expect.objectContaining({
            content: 'Updated content',
            contentLength: 15 // Should be calculated
          })
        })
      );
    });

    it('should return null when message not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('non-existent', { content: 'New content' });

      expect(result).toBeNull();
    });

    it('should update contentLength when content is updated', async () => {
      const updates = { content: 'New longer content message' };
      mockConnection.executeWrite.mockResolvedValue([{ m: createMockMessage(updates) }]);

      await repository.update('message-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          updates: expect.objectContaining({
            contentLength: 26 // Length of new content
          })
        })
      );
    });

    it('should serialize complex fields in updates', async () => {
      const complexUpdates = {
        metadata: { updated: true },
        processingMetadata: { newField: 'value' }
      };
      mockConnection.executeWrite.mockResolvedValue([{ m: createMockMessage(complexUpdates) }]);

      await repository.update('message-123', complexUpdates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          updates: expect.objectContaining({
            metadata: JSON.stringify({ updated: true }),
            processingMetadata: JSON.stringify({ newField: 'value' })
          })
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.update('message-123', { content: 'New' })).rejects.toThrow(DatabaseError);
    });
  });

  describe('delete', () => {
    it('should delete message successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('message-123');

      expect(result).toBe(true);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE m'),
        { id: 'message-123' }
      );
    });

    it('should return false when message not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.delete('message-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getMessageThread', () => {
    it('should return thread with root message only when no parents/children', async () => {
      const rootMessage = createMockMessage({ parentMessageId: undefined });
      jest.spyOn(repository, 'findById').mockResolvedValue(rootMessage);
      mockConnection.executeQuery.mockResolvedValue([]); // No children

      const result = await repository.getMessageThread('message-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(rootMessage);
    });

    it('should return empty array when root message not found', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(null);

      const result = await repository.getMessageThread('non-existent');

      expect(result).toEqual([]);
    });

    it('should include parent messages when requested', async () => {
      const rootMessage = createMockMessage({ parentMessageId: 'parent-123' });
      const parentMessage = createMockMessage({ id: 'parent-123', parentMessageId: undefined });
      
      jest.spyOn(repository, 'findById')
        .mockResolvedValueOnce(rootMessage) // Root message
        .mockResolvedValueOnce(parentMessage); // Parent message
      
      mockConnection.executeQuery.mockResolvedValue([]); // No children

      const result = await repository.getMessageThread('message-123', true, false);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('parent-123'); // Parent should be first
      expect(result[1].id).toBe('message-123'); // Root should be second
    });

    it('should include child messages when requested', async () => {
      const rootMessage = createMockMessage({ parentMessageId: undefined });
      const childMessage = createMockMessage({ id: 'child-123', parentMessageId: 'message-123' });
      
      jest.spyOn(repository, 'findById').mockResolvedValue(rootMessage);
      mockConnection.executeQuery.mockResolvedValue([{ m: childMessage }]);

      const result = await repository.getMessageThread('message-123', false, true);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('message-123'); // Root first
      expect(result[1].id).toBe('child-123');   // Child second
    });

    it('should respect maxDepth parameter', async () => {
      const rootMessage = createMockMessage({ parentMessageId: 'parent-123' });
      
      jest.spyOn(repository, 'findById').mockResolvedValue(rootMessage);
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getMessageThread('message-123', true, true, 0);

      expect(result).toHaveLength(1); // Only root, no traversal due to maxDepth=0
    });
  });

  describe('searchMessages', () => {
    it('should search messages by content', async () => {
      const mockMessages = [createMockMessage({ content: 'search term found' })];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(m => ({ m }))
      );

      const result = await repository.searchMessages('search term');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.content CONTAINS $query'),
        { query: 'search term' }
      );
    });

    it('should apply all filters', async () => {
      const filters = {
        starshipId: 'starship-123',
        agentId: 'agent-123',
        memoryId: 'memory-123',
        conversationId: 'conversation-123',
        role: 'user' as const,
        messageType: 'user_input',
        importance: 'high',
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-02T00:00:00.000Z',
        limit: 20,
        offset: 10
      };
      mockConnection.executeQuery.mockResolvedValue([]);

      await repository.searchMessages('test', filters);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SKIP $offset LIMIT $limit'),
        expect.objectContaining({
          query: 'test',
          starshipId: 'starship-123',
          agentId: 'agent-123',
          role: 'user',
          limit: expect.any(Object),
          offset: expect.any(Object)
        })
      );
    });

    it('should use default limit when not specified', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      await repository.searchMessages('test');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 100'),
        { query: 'test' }
      );
    });
  });

  describe('getConversationMessages', () => {
    it('should return conversation messages with default ordering', async () => {
      const mockMessages = [createMockMessage()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(m => ({ m }))
      );

      const result = await repository.getConversationMessages('conversation-123');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY m.timestamp ASC'),
        { conversationId: 'conversation-123' }
      );
    });

    it('should respect custom ordering parameters', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      await repository.getConversationMessages('conversation-123', 'created_at', 'desc');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY m.createdAt DESC'),
        { conversationId: 'conversation-123' }
      );
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple messages and return stats', async () => {
      const messageIds = ['msg-1', 'msg-2', 'msg-3'];
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 3 }]);

      const result = await repository.bulkDelete(messageIds);

      expect(result).toEqual({
        processed: 3,
        failed: 0,
        errors: []
      });
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.id IN $messageIds'),
        { messageIds }
      );
    });

    it('should handle partial deletion', async () => {
      const messageIds = ['msg-1', 'msg-2', 'msg-3'];
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 2 }]);

      const result = await repository.bulkDelete(messageIds);

      expect(result).toEqual({
        processed: 2,
        failed: 1,
        errors: []
      });
    });

    it('should handle empty message list', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.bulkDelete([]);

      expect(result).toEqual({
        processed: 0,
        failed: 0,
        errors: []
      });
    });
  });

  describe('getMessageStats', () => {
    it('should return message statistics', async () => {
      const mockStatsResult = {
        total: 100,
        roles: ['user', 'user', 'assistant', 'system'],
        messageTypes: ['user_input', 'user_input', 'assistant_response', 'system'],
        importances: ['medium', 'high', 'medium', 'low'],
        avgContentLength: 150.5,
        avgProcessingTime: 1200.75
      };
      mockConnection.executeQuery.mockResolvedValue([mockStatsResult]);

      const result = await repository.getMessageStats();

      expect(result).toEqual({
        total: 100,
        byRole: { system: 1, user: 2, assistant: 1 },
        byType: { user_input: 2, assistant_response: 1, system: 1 },
        byImportance: { medium: 2, high: 1, low: 1 },
        averageContentLength: 150.5,
        averageProcessingTime: 1200.75
      });
    });

    it('should apply filters to stats query', async () => {
      const filters = {
        starshipId: 'starship-123',
        agentId: 'agent-123',
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-02T00:00:00.000Z'
      };
      mockConnection.executeQuery.mockResolvedValue([{
        total: 5,
        roles: ['user'],
        messageTypes: ['user_input'],
        importances: ['medium'],
        avgContentLength: 100,
        avgProcessingTime: null
      }]);

      const result = await repository.getMessageStats(filters);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND m.starshipId = $starshipId'),
        expect.objectContaining(filters)
      );
      expect(result.averageProcessingTime).toBeUndefined();
    });

    it('should return default stats when no messages found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getMessageStats();

      expect(result).toEqual({
        total: 0,
        byRole: { system: 0, user: 0, assistant: 0 },
        byType: {},
        byImportance: {},
        averageContentLength: 0
      });
    });
  });

  describe('serialization/deserialization', () => {
    it('should serialize complex fields correctly', () => {
      const repo = repository as any;
      const message = createMockMessage({
        metadata: { complex: 'data' },
        processingMetadata: { tokens: 100 }
      });

      const serialized = repo.serializeComplexFields(message);

      expect(serialized.metadata).toBe(JSON.stringify({ complex: 'data' }));
      expect(serialized.processingMetadata).toBe(JSON.stringify({ tokens: 100 }));
    });

    it('should deserialize complex fields correctly', () => {
      const repo = repository as any;
      const rawMessage = {
        id: 'message-123',
        content: 'Test',
        metadata: JSON.stringify({ complex: 'data' }),
        processingMetadata: JSON.stringify({ tokens: 100 })
      };

      const deserialized = repo.deserializeComplexFields(rawMessage);

      expect(deserialized.metadata).toEqual({ complex: 'data' });
      expect(deserialized.processingMetadata).toEqual({ tokens: 100 });
    });

    it('should handle null/undefined complex fields', () => {
      const repo = repository as any;
      const rawMessage = {
        id: 'message-123',
        content: 'Test',
        metadata: null,
        processingMetadata: undefined
      };

      const deserialized = repo.deserializeComplexFields(rawMessage);

      expect(deserialized.metadata).toBeUndefined();
      expect(deserialized.processingMetadata).toBeUndefined();
    });

    it('should handle invalid JSON gracefully', () => {
      const repo = repository as any;
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const rawMessage = {
        id: 'message-123',
        content: 'Test',
        metadata: 'invalid-json{',
        processingMetadata: '{"incomplete": }'
      };

      const deserialized = repo.deserializeComplexFields(rawMessage);

      expect(deserialized.metadata).toBeUndefined();
      expect(deserialized.processingMetadata).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to deserialize message'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle very long messages', async () => {
      const longContent = 'x'.repeat(10000);
      const createInput = createMockCreateInput({ content: longContent });
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(createInput);

      expect(result.contentLength).toBe(10000);
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'Message with émojis 🚀 and "quotes" & symbols: <>&';
      const createInput = createMockCreateInput({ content: specialContent });
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(createInput);

      expect(result.content).toBe(specialContent);
    });

    it('should handle messages with all optional fields', async () => {
      const fullMessage = createMockCreateInput({
        parentMessageId: 'parent-123',
        threadDepth: 3,
        processingStatus: 'processing',
        messageType: 'system_notification',
        importance: 'critical',
        contentHash: 'hash123',
        hasAttachments: true,
        tokenCount: 500,
        processingTimeMs: 2500
      });
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.create(fullMessage);

      expect(result).toMatchObject({
        threadDepth: 3,
        processingStatus: 'processing',
        messageType: 'system_notification',
        importance: 'critical',
        hasAttachments: true
      });
    });

    it('should handle deep message threads', async () => {
      const deepParentChain = Array.from({ length: 15 }, (_, i) => 
        createMockMessage({ id: `msg-${i}`, parentMessageId: i > 0 ? `msg-${i-1}` : undefined })
      );
      
      jest.spyOn(repository, 'findById')
        .mockImplementation(async (id) => deepParentChain.find(m => m.id === id) || null);
      
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getMessageThread('msg-14', true, false, 10);

      // Should limit to maxDepth
      expect(result.length).toBeLessThanOrEqual(11); // root + 10 parents max
    });
  });
});