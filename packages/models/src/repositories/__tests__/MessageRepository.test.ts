/**
 * MessageRepository Unit Tests
 */

import { Neo4jConnection, getConnection } from '@/helpers/database';
import { MessageRepository } from '@/repositories/MessageRepository';
import { DatabaseError } from '@starships/errors';
import type { MessageModel } from '@starships/protocol';

// Mock dependencies
jest.mock('../../helpers/database/connection');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-message-id'),
}));

describe('MessageRepository', () => {
  let repository: MessageRepository;
  let mockGetConnection: jest.MockedFunction<typeof getConnection>;
  let mockConnection: jest.Mocked<Neo4jConnection>;

  beforeEach(() => {
    mockConnection = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      getSession: jest.fn(),
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
      initializeSchema: jest.fn(),
    } as unknown as jest.Mocked<Neo4jConnection>;

    // Mock getConnection to return our mock connection
    mockGetConnection = getConnection as jest.MockedFunction<typeof getConnection>;
    mockGetConnection.mockReturnValue(mockConnection);

    repository = new MessageRepository();
    jest.clearAllMocks();
  });

  const createMockMessage = (overrides: Partial<MessageModel> = {}): MessageModel => ({
    id: 'message-123',
    role: 'user',
    content: 'Hello, world!',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    messageType: 'user_input' as const,
    ...overrides,
  });

  const createMockCreateInput = (overrides: Partial<Omit<MessageModel, 'id' | 'createdAt' | 'updatedAt'>> = {}) => ({
    role: 'user' as const,
    content: 'Hello, world!',
    messageType: 'user_input' as const,
    ...overrides,
  });

  describe('constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository).toBeInstanceOf(MessageRepository);
    });
  });

  describe('findAll', () => {
    it('should return all messages ordered by timestamp', async () => {
      const mockMessages = [createMockMessage({ id: 'message-1' }), createMockMessage({ id: 'message-2' })];
      mockConnection.executeQuery.mockResolvedValue(mockMessages.map((m) => ({ m })));

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY m.timestamp DESC'));
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
        content: 'Hello, world!',
      });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE m.id = $id'), { id: 'message-123' });
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

  describe('findByRole', () => {
    it('should return messages by role', async () => {
      const mockMessages = [createMockMessage({ role: 'assistant' })];
      mockConnection.executeQuery.mockResolvedValue(mockMessages.map((m) => ({ m })));

      const result = await repository.findByRole('assistant');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE m.role = $role'), { role: 'assistant' });
    });

    it('should filter by role and starship', async () => {
      const mockMessages = [createMockMessage({ role: 'user' })];
      mockConnection.executeQuery.mockResolvedValue(mockMessages.map((m) => ({ m })));

      const result = await repository.findByRole('user', 'starship-123');

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('AND m.starshipId = $starshipId'), {
        role: 'user',
        starshipId: 'starship-123',
      });
    });
  });

  describe('create', () => {
    it('should create message successfully', async () => {
      const createInput = createMockCreateInput();
      const mockCreated = createMockMessage();
      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreated }]);

      const result = await repository.create(createInput, 'conversation-123');

      expect(result).toMatchObject({
        role: 'user',
        content: 'Hello, world!',
        messageType: 'user_input',
      });
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (n:Message)'),
        expect.objectContaining({
          props: expect.objectContaining({
            role: 'user',
            content: 'Hello, world!',
            messageType: 'user_input',
          }),
        })
      );
    });

    it('should validate required fields', async () => {
      const invalidInput = { content: 'Hello' }; // Missing role

      await expect(repository.create(invalidInput as never, 'conversation-123')).rejects.toThrow(DatabaseError);
    });

    it('should validate role enum', async () => {
      const invalidRole = createMockCreateInput({ role: 'invalid' as 'user' });

      await expect(repository.create(invalidRole, 'conversation-123')).rejects.toThrow(DatabaseError);
    });

    it('should use default messageType when not provided', async () => {
      const inputWithoutMessageType = {
        role: 'user' as const,
        content: 'Test message',
        messageType: 'user_input' as const,
      };
      const mockCreated = createMockMessage(inputWithoutMessageType);
      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreated }]);

      const result = await repository.create(inputWithoutMessageType, 'conversation-123');

      expect(result.messageType).toBe('user_input');
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.create(createMockCreateInput(), 'conversation-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should update message successfully', async () => {
      const updates = { content: 'Updated content' };
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
          }),
        })
      );
    });

    it('should return null when message not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('non-existent', { content: 'New content' });

      expect(result).toBeNull();
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
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(expect.stringContaining('DETACH DELETE m'), { id: 'message-123' });
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

  describe('linkToConversation', () => {
    it('should create relationship between message and conversation', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.linkToConversation('message-123', 'conversation-456');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (c:Conversation {id: $conversationId}), (m:Message {id: $messageId})'),
        {
          conversationId: 'conversation-456',
          messageId: 'message-123',
          key: 'conversation-456_message-123',
        }
      );
    });
  });

  describe('unlinkFromConversation', () => {
    it('should remove relationship between message and conversation', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.unlinkFromConversation('message-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (c:Conversation)-[r:HAS_MESSAGE]->(m:Message {id: $messageId})'),
        { messageId: 'message-123' }
      );
    });
  });

  describe('getMessageConversation', () => {
    it('should return conversation associated with message', async () => {
      const mockConversation = { id: 'conversation-123', title: 'Test Conversation', status: 'active' };
      mockConnection.executeQuery.mockResolvedValue([{ c: mockConversation }]);

      const result = await repository.getMessageConversation('message-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (c:Conversation)-[:HAS_MESSAGE]->(m:Message {id: $messageId})'),
        { messageId: 'message-123' }
      );
      expect(result).toEqual(mockConversation);
    });

    it('should return null when message has no associated conversation', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getMessageConversation('message-123');

      expect(result).toBeNull();
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle very long messages', async () => {
      const longContent = 'x'.repeat(10000);
      const createInput = createMockCreateInput({ content: longContent });
      const mockCreated = createMockMessage({ content: longContent });
      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreated }]);

      const result = await repository.create(createInput, 'conversation-123');

      expect(result.content).toBe(longContent);
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'Message with émojis 🚀 and "quotes" & symbols: <>&';
      const createInput = createMockCreateInput({ content: specialContent });
      const mockCreated = createMockMessage({ content: specialContent });
      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreated }]);

      const result = await repository.create(createInput, 'conversation-123');

      expect(result.content).toBe(specialContent);
    });

    it('should validate messageType enum', async () => {
      const invalidMessageType = createMockCreateInput({ messageType: 'invalid_type' as 'user_input' });

      await expect(repository.create(invalidMessageType, 'conversation-123')).rejects.toThrow(DatabaseError);
    });
  });
});
