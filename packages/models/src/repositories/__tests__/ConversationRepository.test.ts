/**
 * ConversationRepository Unit Tests
 */

import { ConversationRepository } from '@/repositories/ConversationRepository';
import { DatabaseError, NotFoundError } from '@starships/errors';
import { Conversation, ConversationModel } from '@starships/protocol';

// Define type aliases for test data
type CreateConversationData = Conversation & { starshipId: string; agentId?: string };

// Mock the database connection only
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(() => ({
    query: jest.fn(),
    queryOne: jest.fn(),
  })),
}));

// Mock nanoid for predictable ID generation
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-nanoid-123'),
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
    query: jest.Mock;
    queryOne: jest.Mock;
  };

  beforeEach(() => {
    mockConnection = {
      query: jest.fn(),
      queryOne: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    repository = new ConversationRepository();
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

      mockConnection.query.mockResolvedValue(mockConversations);

      const result = await repository.findAll();

      expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM conversations ORDER BY created_at DESC');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({ id: 'conv-1', status: 'active' }));
      expect(result[1]).toEqual(expect.objectContaining({ id: 'conv-2', status: 'completed' }));
    });

    it('should return empty array when no conversations found', async () => {
      mockConnection.query.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.findAll()).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should return conversation by ID', async () => {
      const mockConversation = createMockConversation();
      mockConnection.query.mockResolvedValue([mockConversation]);

      const result = await repository.findById('conv-123');

      expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM conversations WHERE id = $1', ['conv-123']);
      expect(result).toEqual(expect.objectContaining({ id: 'conversation-123', status: 'active' }));
    });

    it('should return null when conversation not found', async () => {
      mockConnection.query.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new conversation with starship link', async () => {
      const conversationData = {
        title: 'Test Conversation',
        status: 'active' as const,
        starshipId: 'starship-123',
      };

      const createdConversation: ConversationModel = {
        ...conversationData,
        id: 'test-nanoid-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockConnection.query.mockResolvedValue([createdConversation]);

      const result = await repository.create(conversationData);

      expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO conversations'), expect.any(Array));
      // The result will be a ConversationEntity with proper date transformations
      expect(result).toMatchObject({
        id: 'test-nanoid-123',
        title: 'Test Conversation',
        status: 'active',
      });
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        starshipId: 'starship-123',
        status: 'active' as const,
        // Missing title field
      };

      await expect(repository.create(incompleteData as CreateConversationData)).rejects.toThrow(DatabaseError);
    });

    it('should validate enum values for status', async () => {
      const invalidData = {
        starshipId: 'starship-123',
        title: 'Test Conversation',
        status: 'invalid_status',
      };

      await expect(repository.create(invalidData as CreateConversationData)).rejects.toThrow(DatabaseError);
    });

    it('should validate field types', async () => {
      const invalidData = {
        starshipId: 'starship-123',
        title: 123, // Should be string
        status: 'active',
      };

      await expect(repository.create(invalidData as unknown as CreateConversationData)).rejects.toThrow();
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

      mockConnection.query.mockResolvedValue([updatedConversation]);

      const result = await repository.update('conv-123', updates);

      expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE conversations'), expect.any(Array));
      expect(result).toEqual(expect.objectContaining({ id: 'conv-123', status: 'completed' }));
    });

    it('should return existing conversation when no updates provided', async () => {
      const existingConversation = createMockConversation({ id: 'conv-123' });
      mockConnection.query.mockResolvedValue([existingConversation]);

      const result = await repository.update('conv-123', {});

      expect(result).toEqual(expect.objectContaining({ id: 'conv-123' }));
    });

    it('should throw NotFoundError when conversation does not exist', async () => {
      mockConnection.query.mockResolvedValue([]);

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
      mockConnection.query.mockResolvedValue({ rowCount: 1 } as unknown as unknown[]);

      const result = await repository.delete('conv-123');

      expect(mockConnection.query).toHaveBeenCalledWith('DELETE FROM conversations WHERE id = $1', ['conv-123']);
      expect(result).toBe(true);
    });

    it('should return false when conversation does not exist', async () => {
      mockConnection.query.mockResolvedValue({ rowCount: 0 } as unknown as unknown[]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('findByStarship', () => {
    it('should return conversations for a specific starship', async () => {
      const mockConversations: ConversationModel[] = [createMockConversation({ id: 'conv-1' }), createMockConversation({ id: 'conv-2' })];

      mockConnection.query.mockResolvedValue(mockConversations);

      const result = await repository.findByStarship('starship-123');

      expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM conversations WHERE starship_id = $1 ORDER BY created_at DESC', [
        'starship-123',
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({ id: 'conv-1', status: 'active' }));
      expect(result[1]).toEqual(expect.objectContaining({ id: 'conv-2', status: 'active' }));
    });

    it('should return empty array when no conversations found for starship', async () => {
      mockConnection.query.mockResolvedValue([]);

      const result = await repository.findByStarship('starship-123');

      expect(result).toEqual([]);
    });
  });

  describe('getConversationStarship', () => {
    it('should return starship associated with conversation', async () => {
      const mockStarship = { id: 'starship-123', name: 'Test Starship', slug: 'test-starship' };
      mockConnection.queryOne.mockResolvedValue(mockStarship);

      const result = await repository.getConversationStarship('conv-123');

      expect(mockConnection.queryOne).toHaveBeenCalledWith(expect.stringContaining('SELECT s.* FROM starships s'), ['conv-123']);
      expect(result).toMatchObject(mockStarship);
    });

    it('should return null when conversation has no associated starship', async () => {
      mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.getConversationStarship('conv-123');

      expect(result).toBeNull();
    });
  });

  describe('linkToStarship', () => {
    it('should create relationship between conversation and starship', async () => {
      mockConnection.query.mockResolvedValue([]);

      await repository.linkToStarship('conv-123', 'starship-456');

      expect(mockConnection.query).toHaveBeenCalledWith('UPDATE conversations SET starship_id = $1, updated_at = NOW() WHERE id = $2', [
        'starship-456',
        'conv-123',
      ]);
    });
  });

  describe('unlinkFromStarship', () => {
    it('should remove relationship between conversation and starship', async () => {
      mockConnection.query.mockResolvedValue([]);

      await repository.unlinkFromStarship('conv-123');

      expect(mockConnection.query).toHaveBeenCalledWith('UPDATE conversations SET starship_id = NULL, updated_at = NOW() WHERE id = $1', [
        'conv-123',
      ]);
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Connection failed'));

      await expect(repository.findById('conv-123')).rejects.toThrow();
    });

    it('should handle constraint violations during create', async () => {
      const error = Object.assign(new Error('unique constraint violation'), { code: '23505' });
      mockConnection.query.mockRejectedValue(error);

      const conversationData = {
        starshipId: 'starship-123',
        title: 'Test Conversation',
        status: 'active' as const,
      };

      await expect(repository.create(conversationData)).rejects.toThrow();
    });

    it('should handle query timeout errors', async () => {
      const timeoutError = new Error('Query timeout');
      mockConnection.query.mockRejectedValue(timeoutError);

      await expect(repository.findAll()).rejects.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle conversation lifecycle', async () => {
      const conversationData = {
        starshipId: 'starship-123',
        title: 'Test Conversation',
        status: 'active' as const,
      };

      // Create conversation
      const createdConversation = createMockConversation(conversationData);
      mockConnection.query.mockResolvedValue([createdConversation]);

      const newConversation = await repository.create(conversationData);
      expect(newConversation.status).toBe('active');

      expect(mockConnection.query).toHaveBeenCalled();
    });

    it('should handle starship relationship operations', async () => {
      const conversationId = 'conv-123';
      const starshipId = 'starship-456';

      mockConnection.query.mockResolvedValue([]);
      mockConnection.queryOne.mockResolvedValue({ id: starshipId, name: 'Test', slug: 'test' });

      // Link to starship
      await repository.linkToStarship(conversationId, starshipId);

      // Verify relationship
      const starship = await repository.getConversationStarship(conversationId);
      expect(starship?.id).toBe(starshipId);

      // Unlink from starship
      await repository.unlinkFromStarship(conversationId);

      expect(mockConnection.query).toHaveBeenCalledTimes(2);
    });

    it('should handle conversation deletion with cascade', async () => {
      const conversationId = 'conv-to-delete';

      // Mock successful deletion
      mockConnection.query.mockResolvedValue({ rowCount: 1 } as unknown as unknown[]);

      const success = await repository.delete(conversationId);

      expect(success).toBe(true);
      expect(mockConnection.query).toHaveBeenCalledWith('DELETE FROM conversations WHERE id = $1', [conversationId]);
    });
  });
});
