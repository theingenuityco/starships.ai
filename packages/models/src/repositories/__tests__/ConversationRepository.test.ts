/**
 * ConversationRepository Unit Tests
 */

import { ConversationRepository } from '@/repositories/ConversationRepository';
import { NotFoundError, ValidationError } from '@starships/errors';
import { ConversationModel } from '@starships/protocol';

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(() => ({
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
  })),
}));

import { getConnection } from '@/helpers/database';

describe('ConversationRepository', () => {
  let repository: ConversationRepository;
  let mockConnection: any;

  beforeEach(() => {
    repository = new ConversationRepository();
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as any).serviceName).toBe('ConversationRepository');
    });
  });

  describe('findAll', () => {
    it('should return all conversations ordered by last activity', async () => {
      const mockConversations: ConversationModel[] = [
        global.createMockConversation({ id: 'conv-1', status: 'active' }),
        global.createMockConversation({ id: 'conv-2', status: 'completed' }),
      ];

      mockConnection.executeQuery.mockResolvedValue([{ c: mockConversations[0] }, { c: mockConversations[1] }]);

      const result = await repository.findAll();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (c:Conversation) RETURN c ORDER BY c.lastActivityAt DESC');
      expect(result).toEqual(mockConversations);
    });

    it('should return empty array when no conversations found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findAll()).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should return conversation by ID', async () => {
      const mockConversation = global.createMockConversation();
      mockConnection.executeQuery.mockResolvedValue([{ c: mockConversation }]);

      const result = await repository.findById('conv-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (c:Conversation) WHERE c.id = $id RETURN c', { id: 'conv-123' });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new conversation with required fields', async () => {
      const conversationData = {
        lastActivityAt: '2023-01-01T00:00:00.000Z',
        messageCount: 0,
        totalTokens: 0,
        status: 'active' as const,
        metadata: { key: 'value' },
      };

      const createdConversation = {
        ...conversationData,
        id: 'test-uuid-123',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      // Mock the createEntityWithAutoId method from BaseRepository
      jest.spyOn(repository as any, 'createEntityWithAutoId').mockResolvedValue(createdConversation);

      const result = await repository.create(conversationData);

      expect(result).toEqual(createdConversation);
    });

    it('should create conversation with starship link', async () => {
      const conversationData = {
        lastActivityAt: '2023-01-01T00:00:00.000Z',
        messageCount: 0,
        totalTokens: 0,
        status: 'active' as const,
      };

      const createdConversation = {
        ...conversationData,
        id: 'test-uuid-123',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      jest.spyOn(repository as any, 'createEntityWithAutoId').mockResolvedValue(createdConversation);
      jest.spyOn(repository, 'linkToStarship').mockResolvedValue(undefined);

      const result = await repository.create(conversationData, 'starship-123');

      expect(repository.linkToStarship).toHaveBeenCalledWith(createdConversation.id, 'starship-123');
      expect(result).toEqual(createdConversation);
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        messageCount: 0,
        // Missing required fields
      };

      await expect(repository.create(incompleteData as any)).rejects.toThrow(ValidationError);
    });

    it('should validate enum values for status', async () => {
      const invalidData = {
        lastActivityAt: '2023-01-01T00:00:00.000Z',
        messageCount: 0,
        status: 'invalid_status',
      };

      await expect(repository.create(invalidData as any)).rejects.toThrow(ValidationError);
    });

    it('should validate field types', async () => {
      const invalidData = {
        lastActivityAt: '2023-01-01T00:00:00.000Z',
        messageCount: 'not_a_number',
        status: 'active',
      };

      await expect(repository.create(invalidData as any)).rejects.toThrow(ValidationError);
    });
  });

  describe('update', () => {
    it('should update conversation with valid data', async () => {
      const updates = {
        status: 'completed' as const,
        totalTokens: 100,
      };

      const updatedConversation = global.createMockConversation({
        id: 'conv-123',
        ...updates,
      });

      mockConnection.executeWrite.mockResolvedValue([{ c: updatedConversation }]);

      const result = await repository.update('conv-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (c:Conversation) WHERE c.id = $id'),
        expect.objectContaining({
          id: 'conv-123',
          status: 'completed',
          totalTokens: 100,
        })
      );
      expect(result).toEqual(updatedConversation);
    });

    it('should return existing conversation when no updates provided', async () => {
      const existingConversation = global.createMockConversation({ id: 'conv-123' });
      jest.spyOn(repository, 'findById').mockResolvedValue(existingConversation);

      const result = await repository.update('conv-123', {});

      expect(repository.findById).toHaveBeenCalledWith('conv-123');
      expect(result).toEqual(existingConversation);
    });

    it('should throw NotFoundError when conversation does not exist', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await expect(repository.update('non-existent', { status: 'completed' })).rejects.toThrow(NotFoundError);
    });

    it('should validate enum values during update', async () => {
      await expect(repository.update('conv-123', { status: 'invalid_status' as any })).rejects.toThrow(ValidationError);
    });

    it('should validate field types during update', async () => {
      await expect(repository.update('conv-123', { messageCount: 'not_a_number' as any })).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete conversation successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('conv-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:Conversation) WHERE c.id = $id DETACH DELETE c RETURN count(c) as deletedCount',
        { id: 'conv-123' }
      );
      expect(result).toBe(true);
    });

    it('should return false when conversation does not exist', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('updateActivity', () => {
    it('should update conversation activity timestamp', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.updateActivity('conv-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:Conversation) WHERE c.id = $id SET c.lastActivityAt = $timestamp',
        {
          id: 'conv-123',
          timestamp: expect.any(String),
        }
      );
    });
  });

  describe('incrementMessageCount', () => {
    it('should increment message count by default amount', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.incrementMessageCount('conv-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:Conversation) WHERE c.id = $id SET c.messageCount = c.messageCount + $increment, c.lastActivityAt = $timestamp',
        {
          id: 'conv-123',
          increment: 1,
          timestamp: expect.any(String),
        }
      );
    });

    it('should increment message count by specified amount', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.incrementMessageCount('conv-123', 5);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('c.messageCount + $increment'),
        expect.objectContaining({
          increment: 5,
        })
      );
    });
  });

  describe('updateTokenCount', () => {
    it('should update total token count', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.updateTokenCount('conv-123', 150);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:Conversation) WHERE c.id = $id SET c.totalTokens = c.totalTokens + $tokens, c.lastActivityAt = $timestamp',
        {
          id: 'conv-123',
          tokens: 150,
          timestamp: expect.any(String),
        }
      );
    });
  });

  describe('markAsCompleted', () => {
    it('should mark conversation as completed', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.markAsCompleted('conv-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:Conversation) WHERE c.id = $id SET c.status = $status, c.lastActivityAt = $timestamp',
        {
          id: 'conv-123',
          status: 'completed',
          timestamp: expect.any(String),
        }
      );
    });
  });

  describe('archiveConversation', () => {
    it('should archive conversation', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.archiveConversation('conv-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:Conversation) WHERE c.id = $id SET c.status = $status, c.lastActivityAt = $timestamp',
        {
          id: 'conv-123',
          status: 'archived',
          timestamp: expect.any(String),
        }
      );
    });
  });

  describe('findByStarship', () => {
    it('should return conversations for a specific starship', async () => {
      const mockConversations: ConversationModel[] = [
        global.createMockConversation({ id: 'conv-1' }),
        global.createMockConversation({ id: 'conv-2' }),
      ];

      mockConnection.executeQuery.mockResolvedValue([{ c: mockConversations[0] }, { c: mockConversations[1] }]);

      const result = await repository.findByStarship('starship-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (starship:Starship {id: $starshipId})-[:HAS_CONVERSATION]->(c:Conversation)'),
        { starshipId: 'starship-123' }
      );
      expect(result).toEqual(mockConversations);
    });

    it('should return empty array when no conversations found for starship', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByStarship('starship-123');

      expect(result).toEqual([]);
    });
  });

  describe('getConversationStarship', () => {
    it('should return starship associated with conversation', async () => {
      const mockStarship = { id: 'starship-123', name: 'Test Starship', slug: 'test-starship' };
      mockConnection.executeQuery.mockResolvedValue([{ starship: mockStarship }]);

      const result = await repository.getConversationStarship('conv-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (starship:Starship)-[:HAS_CONVERSATION]->(c:Conversation {id: $conversationId})'),
        { conversationId: 'conv-123' }
      );
      expect(result).toEqual(mockStarship);
    });

    it('should return null when conversation has no associated starship', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getConversationStarship('conv-123');

      expect(result).toBeNull();
    });
  });

  describe('linkToStarship', () => {
    it('should create relationship between conversation and starship', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.linkToStarship('conv-123', 'starship-456');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (s:Starship {id: $starshipId}), (conversation:Conversation {id: $conversationId})'),
        {
          starshipId: 'starship-456',
          conversationId: 'conv-123',
          key: 'starship-456_conv-123',
        }
      );
    });
  });

  describe('unlinkFromStarship', () => {
    it('should remove relationship between conversation and starship', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.unlinkFromStarship('conv-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (s:Starship)-[r:HAS_CONVERSATION]->(conversation:Conversation {id: $conversationId})'),
        { conversationId: 'conv-123' }
      );
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Connection failed'));

      await expect(repository.findById('conv-123')).rejects.toThrow();
    });

    it('should handle constraint violations during create', async () => {
      const error = new Error('unique constraint violation');
      jest.spyOn(repository as any, 'createEntityWithAutoId').mockRejectedValue(error);

      const conversationData = {
        lastActivityAt: '2023-01-01T00:00:00.000Z',
        messageCount: 0,
        status: 'active' as const,
      };

      await expect(repository.create(conversationData)).rejects.toThrow();
    });

    it('should handle query timeout errors', async () => {
      const timeoutError = new Error('Query timeout');
      mockConnection.executeQuery.mockRejectedValue(timeoutError);

      await expect(repository.findAll()).rejects.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle conversation lifecycle', async () => {
      const conversationData = {
        lastActivityAt: '2023-01-01T00:00:00.000Z',
        messageCount: 0,
        totalTokens: 0,
        status: 'active' as const,
      };

      // Create conversation
      const createdConversation = global.createMockConversation(conversationData);
      jest.spyOn(repository as any, 'createEntityWithAutoId').mockResolvedValue(createdConversation);

      const newConversation = await repository.create(conversationData);
      expect(newConversation.status).toBe('active');

      // Update activity
      mockConnection.executeWrite.mockResolvedValue([]);
      await repository.updateActivity(newConversation.id);

      // Increment message count
      await repository.incrementMessageCount(newConversation.id, 2);

      // Update token count
      await repository.updateTokenCount(newConversation.id, 100);

      // Mark as completed
      await repository.markAsCompleted(newConversation.id);

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(4);
    });

    it('should handle starship relationship operations', async () => {
      const conversationId = 'conv-123';
      const starshipId = 'starship-456';

      mockConnection.executeWrite.mockResolvedValue([]);
      mockConnection.executeQuery.mockResolvedValue([{ starship: { id: starshipId, name: 'Test', slug: 'test' } }]);

      // Link to starship
      await repository.linkToStarship(conversationId, starshipId);

      // Verify relationship
      const starship = await repository.getConversationStarship(conversationId);
      expect(starship?.id).toBe(starshipId);

      // Unlink from starship
      await repository.unlinkFromStarship(conversationId);

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2);
    });

    it('should handle conversation deletion with cascade', async () => {
      const conversationId = 'conv-to-delete';

      // Mock successful deletion (DETACH DELETE handles cascading)
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const success = await repository.delete(conversationId);

      expect(success).toBe(true);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(expect.stringContaining('DETACH DELETE'), { id: conversationId });
    });
  });
});
