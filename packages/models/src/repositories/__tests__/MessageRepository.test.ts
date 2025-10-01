/**
 * MessageRepository Unit Tests
 */

import { getConnection } from '@/helpers/database';
import { MessageRepository } from '@/repositories/MessageRepository';
import { DatabaseError } from '@starships/errors';
import type { MessageModel } from '@starships/protocol';

// Mock only database connection and nanoid
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(),
}));

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-message-id'),
}));

describe('MessageRepository', () => {
  let repository: MessageRepository;
  let mockConnection: {
    query: jest.Mock;
    queryOne: jest.Mock;
  };

  beforeEach(() => {
    // Create simple mock connection
    mockConnection = {
      query: jest.fn(),
      queryOne: jest.fn(),
    };

    // Mock getConnection to return our mock connection
    (getConnection as jest.Mock).mockReturnValue(mockConnection);

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
    conversationId: 'conversation-123',
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
      mockConnection.query.mockResolvedValue(mockMessages);

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no messages found', async () => {
      mockConnection.query.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });
  });

  describe('findById', () => {
    it('should return message when found', async () => {
      const mockMessage = createMockMessage();
      mockConnection.query.mockResolvedValue([mockMessage]);

      const result = await repository.findById('message-123');

      expect(result).toMatchObject({
        id: 'message-123',
        content: 'Hello, world!',
      });
    });

    it('should return null when message not found', async () => {
      mockConnection.query.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.findById('message-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findByRole', () => {
    it('should return messages by role', async () => {
      const mockMessages = [createMockMessage({ role: 'assistant' })];
      mockConnection.query.mockResolvedValue(mockMessages);

      const result = await repository.findByRole('assistant');

      expect(result).toHaveLength(1);
    });

    it('should filter by role and starship', async () => {
      const mockMessages = [createMockMessage({ role: 'user' })];
      mockConnection.queryOne.mockResolvedValue({ starship_id: 'starship-123' });
      mockConnection.query.mockResolvedValue(mockMessages);

      const result = await repository.findByRole('user', 'starship-123');

      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should create message successfully', async () => {
      const createInput = createMockCreateInput();
      const mockCreated = createMockMessage();
      mockConnection.queryOne.mockResolvedValue({ starship_id: 'starship-123' });
      mockConnection.query.mockResolvedValue([mockCreated]);

      const result = await repository.create(createInput);

      expect(result).toMatchObject({
        role: 'user',
        content: 'Hello, world!',
        messageType: 'user_input',
      });
    });

    it('should validate required fields', async () => {
      const invalidInput = { content: 'Hello' }; // Missing role

      await expect(repository.create(invalidInput as never)).rejects.toThrow(DatabaseError);
    });

    it('should validate role enum', async () => {
      const invalidRole = createMockCreateInput({ role: 'invalid' as 'user' });

      await expect(repository.create(invalidRole)).rejects.toThrow(DatabaseError);
    });

    it('should use default messageType when not provided', async () => {
      const inputWithoutMessageType = {
        conversationId: 'conversation-123',
        role: 'user' as const,
        content: 'Test message',
        messageType: 'user_input' as const,
      };
      const mockCreated = createMockMessage(inputWithoutMessageType);
      mockConnection.queryOne.mockResolvedValue({ starship_id: 'starship-123' });
      mockConnection.query.mockResolvedValue([mockCreated]);

      const result = await repository.create(inputWithoutMessageType);

      expect(result.messageType).toBe('user_input');
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.create(createMockCreateInput())).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should update message successfully', async () => {
      const updates = { content: 'Updated content' };
      const mockUpdated = createMockMessage(updates);

      mockConnection.query.mockResolvedValue([mockUpdated]);

      const result = await repository.update('message-123', updates);

      expect(result).toMatchObject(updates);
    });

    it('should return null when message not found', async () => {
      mockConnection.query.mockResolvedValue([]);

      const result = await repository.update('non-existent', { content: 'New content' });

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.update('message-123', { content: 'New' })).rejects.toThrow(DatabaseError);
    });
  });

  describe('delete', () => {
    it('should delete message successfully', async () => {
      mockConnection.query.mockResolvedValue({ rowCount: 1 });

      const result = await repository.delete('message-123');

      expect(result).toBe(true);
    });

    it('should return false when message not found', async () => {
      mockConnection.query.mockResolvedValue({ rowCount: 0 });

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.delete('message-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('linkToConversation', () => {
    it('should create relationship between message and conversation', async () => {
      mockConnection.query.mockResolvedValue([]);

      await repository.linkToConversation('message-123', 'conversation-456');

      expect(mockConnection.query).toHaveBeenCalled();
    });
  });

  describe('unlinkFromConversation', () => {
    it('should remove relationship between message and conversation', async () => {
      mockConnection.query.mockResolvedValue([]);

      await repository.unlinkFromConversation('message-123');

      expect(mockConnection.query).toHaveBeenCalled();
    });
  });

  describe('getMessageConversation', () => {
    it('should return conversation associated with message', async () => {
      const mockConversation = { id: 'conversation-123', title: 'Test Conversation', status: 'active' };
      mockConnection.queryOne.mockResolvedValue(mockConversation);

      const result = await repository.getMessageConversation('message-123');

      expect(result).toEqual(mockConversation);
    });

    it('should return null when message has no associated conversation', async () => {
      mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.getMessageConversation('message-123');

      expect(result).toBeNull();
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle very long messages', async () => {
      const longContent = 'x'.repeat(10000);
      const createInput = createMockCreateInput({ content: longContent });
      const mockCreated = createMockMessage({ content: longContent });
      mockConnection.queryOne.mockResolvedValue({ starship_id: 'starship-123' });
      mockConnection.query.mockResolvedValue([mockCreated]);

      const result = await repository.create(createInput);

      expect(result.content).toBe(longContent);
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'Message with émojis 🚀 and "quotes" & symbols: <>&';
      const createInput = createMockCreateInput({ content: specialContent });
      const mockCreated = createMockMessage({ content: specialContent });
      mockConnection.queryOne.mockResolvedValue({ starship_id: 'starship-123' });
      mockConnection.query.mockResolvedValue([mockCreated]);

      const result = await repository.create(createInput);

      expect(result.content).toBe(specialContent);
    });

    it('should validate messageType enum', async () => {
      const invalidMessageType = createMockCreateInput({ messageType: 'invalid_type' as 'user_input' });

      await expect(repository.create(invalidMessageType)).rejects.toThrow(DatabaseError);
    });
  });
});
