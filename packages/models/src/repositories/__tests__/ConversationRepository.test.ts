/**
 * ConversationRepository Unit Tests
 */

import { ConversationRepository } from '@/repositories/ConversationRepository';
import { DatabaseError, NotFoundError } from '@starships/errors';
import { ConversationModel } from '@starships/protocol';
import { Neo4jConnection } from '@/helpers/database';

// Define type aliases for test data
type CreateConversationData = Omit<ConversationModel, 'id' | 'createdAt' | 'updatedAt'>;

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(() => ({
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
  })),
}));

// Mock ConversationEntity with proper static methods
jest.mock('../../entities/ConversationEntity', () => ({
  ConversationEntity: {
    validate: jest.fn().mockResolvedValue(undefined),
    deserialize: jest.fn().mockImplementation((data) => ({
      ...data,
      serialize: jest.fn().mockReturnValue(data),
    })),
  },
}));

import { getConnection } from '@/helpers/database';

describe('ConversationRepository', () => {
  // Helper function to create mock conversations
  const createMockConversation = (overrides: Partial<ConversationModel> = {}): ConversationModel => ({
    id: 'conversation-123',
    title: 'Test Conversation',
    status: 'active',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });
  let repository: ConversationRepository;
  let mockConnection: {
    executeQuery: jest.MockedFunction<(query: string, params?: Record<string, unknown>) => Promise<unknown[]>>;
    executeWrite: jest.MockedFunction<(query: string, params?: Record<string, unknown>) => Promise<unknown[]>>;
  };

  beforeEach(() => {
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    repository = new ConversationRepository(mockConnection as unknown as Neo4jConnection);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as unknown as { serviceName: string }).serviceName).toBe('ConversationRepository');
    });
  });

  describe('findAll', () => {
    it('should return all conversations ordered by last activity', async () => {
      const mockConversations: ConversationModel[] = [
        createMockConversation({ id: 'conv-1', status: 'active' }),
        createMockConversation({ id: 'conv-2', status: 'completed' }),
      ];

      mockConnection.executeQuery.mockResolvedValue([{ c: mockConversations[0] }, { c: mockConversations[1] }]);

      const result = await repository.findAll();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (c:Conversation) RETURN c ORDER BY c.createdAt DESC');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({ id: 'conv-1', status: 'active' }));
      expect(result[1]).toEqual(expect.objectContaining({ id: 'conv-2', status: 'completed' }));
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
      const mockConversation = createMockConversation();
      mockConnection.executeQuery.mockResolvedValue([{ c: mockConversation }]);

      const result = await repository.findById('conv-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (c:Conversation) WHERE c.id = $id RETURN c', { id: 'conv-123' });
      expect(result).toEqual(expect.objectContaining({ id: 'conversation-123', status: 'active' }));
    });

    it('should return null when conversation not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new conversation with starship link', async () => {
      const conversationData = {
        title: 'Test Conversation',
        status: 'active' as const,
      };

      const createdConversation: ConversationModel = {
        ...conversationData,
        id: 'test-uuid-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      // Mock the createEntityWithAutoId method from BaseRepository
      jest
        .spyOn(
          repository as unknown as {
            createEntityWithAutoId: (nodeLabel: string, props: Record<string, unknown>) => Promise<ConversationModel>;
          },
          'createEntityWithAutoId'
        )
        .mockResolvedValue(createdConversation);
      jest.spyOn(repository, 'linkToStarship').mockResolvedValue(undefined);

      const result = await repository.create(conversationData, 'starship-123');

      expect(repository.linkToStarship).toHaveBeenCalledWith(createdConversation.id, 'starship-123');
      expect(result).toEqual(expect.objectContaining(createdConversation));
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        status: 'active' as const,
        // Missing title field
      };

      await expect(repository.create(incompleteData as CreateConversationData, 'starship-123')).rejects.toThrow(DatabaseError);
    });

    it('should validate enum values for status', async () => {
      const invalidData = {
        title: 'Test Conversation',
        status: 'invalid_status',
      };

      await expect(repository.create(invalidData as CreateConversationData, 'starship-123')).rejects.toThrow(DatabaseError);
    });

    it('should validate field types', async () => {
      const invalidData = {
        title: 123, // Should be string
        status: 'active',
      };

      await expect(repository.create(invalidData as unknown as CreateConversationData, 'starship-123')).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update conversation with valid data', async () => {
      const updates = {
        status: 'completed' as const,
      };

      const updatedConversation = createMockConversation({
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
        })
      );
      expect(result).toEqual(expect.objectContaining({ id: 'conv-123', status: 'completed' }));
    });

    it('should return existing conversation when no updates provided', async () => {
      const existingConversation = createMockConversation({ id: 'conv-123' });
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
      await expect(repository.update('conv-123', { status: 'invalid_status' as ConversationModel['status'] })).rejects.toThrow(
        DatabaseError
      );
    });

    it('should validate field types during update', async () => {
      await expect(repository.update('conv-123', { title: 123 as unknown as string })).rejects.toThrow();
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

  describe('findByStarship', () => {
    it('should return conversations for a specific starship', async () => {
      const mockConversations: ConversationModel[] = [createMockConversation({ id: 'conv-1' }), createMockConversation({ id: 'conv-2' })];

      mockConnection.executeQuery.mockResolvedValue([{ c: mockConversations[0] }, { c: mockConversations[1] }]);

      const result = await repository.findByStarship('starship-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (starship:Starship {id: $starshipId})-[:HAS_CONVERSATION]->(c:Conversation)'),
        { starshipId: 'starship-123' }
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({ id: 'conv-1', status: 'active' }));
      expect(result[1]).toEqual(expect.objectContaining({ id: 'conv-2', status: 'active' }));
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
      jest
        .spyOn(
          repository as unknown as {
            createEntityWithAutoId: (nodeLabel: string, props: Record<string, unknown>) => Promise<ConversationModel>;
          },
          'createEntityWithAutoId'
        )
        .mockRejectedValue(error);

      const conversationData = {
        title: 'Test Conversation',
        status: 'active' as const,
      };

      await expect(repository.create(conversationData, 'starship-123')).rejects.toThrow();
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
        title: 'Test Conversation',
        status: 'active' as const,
      };

      // Create conversation
      const createdConversation = createMockConversation(conversationData);
      jest
        .spyOn(
          repository as unknown as {
            createEntityWithAutoId: (nodeLabel: string, props: Record<string, unknown>) => Promise<ConversationModel>;
          },
          'createEntityWithAutoId'
        )
        .mockResolvedValue(createdConversation);

      const newConversation = await repository.create(conversationData, 'starship-123');
      expect(newConversation.status).toBe('active');

      // The business logic methods (updateActivity, incrementMessageCount, etc.)
      // have been moved to ConversationService and are no longer part of the repository
      // But create() still calls linkToStarship which uses executeWrite once
      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(1);
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
