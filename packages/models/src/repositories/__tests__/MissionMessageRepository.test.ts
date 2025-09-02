/**
 * MissionMessageRepository Unit Tests
 */

import { MissionMessageRepository } from '../MissionMessageRepository';
import { Neo4jConnection } from '../../helpers/database';
import { ValidationError, DatabaseError, NotFoundError } from '../../helpers/errors';
import type { MissionMessageModel, MissionMessageRole } from '@starships/protocol';

// Mock dependencies
jest.mock('../../helpers/database/connection');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-message-id')
}));

describe('MissionMessageRepository', () => {
  let repository: MissionMessageRepository;
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

    repository = new MissionMessageRepository();
    jest.clearAllMocks();
  });

  const createMockMessage = (overrides: Partial<MissionMessageModel> = {}): MissionMessageModel => ({
    id: 'message-123',
    missionId: 'mission-123',
    role: 'user',
    content: 'Test message content',
    timestamp: '2024-01-01T00:00:00.000Z',
    userId: 'user-123',
    senderName: 'Test User',
    ...overrides
  });

  const createMockMessageInput = (overrides: any = {}) => ({
    missionId: 'mission-123',
    role: 'user' as MissionMessageRole,
    content: 'Test message content',
    timestamp: '2024-01-01T00:00:00.000Z',
    userId: 'user-123',
    senderName: 'Test User',
    ...overrides
  });

  describe('constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository).toBeInstanceOf(MissionMessageRepository);
    });
  });

  describe('saveMessage', () => {
    it('should save user message with user relationship', async () => {
      const messageInput = createMockMessageInput();
      const mockCreated = createMockMessage();
      
      // Mock mission exists check
      mockConnection.executeQuery.mockResolvedValue([{ id: 'mission-123' }]);
      // Mock message creation
      mockConnection.executeWrite.mockResolvedValue([{ msg: mockCreated }]);

      const result = await repository.saveMessage(messageInput);

      expect(result).toMatchObject({
        role: 'user',
        content: 'Test message content'
      });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:Mission {id: $missionId})'),
        { missionId: 'mission-123' }
      );
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (u:User {id: $userId})'),
        expect.objectContaining({
          missionId: 'mission-123',
          userId: 'user-123'
        })
      );
    });

    it('should save system/orchestrator message without user relationship', async () => {
      const systemMessage = createMockMessageInput({
        role: 'system',
        userId: undefined
      });
      const mockCreated = createMockMessage({ role: 'system' });
      
      mockConnection.executeQuery.mockResolvedValue([{ id: 'mission-123' }]);
      mockConnection.executeWrite.mockResolvedValue([{ msg: mockCreated }]);

      const result = await repository.saveMessage(systemMessage);

      expect(result.role).toBe('system');
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.not.stringContaining('MATCH (u:User'),
        expect.objectContaining({
          missionId: 'mission-123',
          messageProps: expect.objectContaining({
            role: 'system'
          })
        })
      );
    });

    it('should validate required fields', async () => {
      const invalidInputs = [
        { role: 'user', content: 'test' }, // Missing missionId
        { missionId: 'mission-123', content: 'test' }, // Missing role
        { missionId: 'mission-123', role: 'user' }, // Missing content
        { missionId: 'mission-123', role: 'user', content: 'test' }, // Missing timestamp
      ];

      for (const invalidInput of invalidInputs) {
        await expect(repository.saveMessage(invalidInput as any)).rejects.toThrow(ValidationError);
      }
    });

    it('should validate field types', async () => {
      const invalidTypes = [
        { ...createMockMessageInput(), missionId: 123 },
        { ...createMockMessageInput(), role: 123 },
        { ...createMockMessageInput(), content: 123 },
        { ...createMockMessageInput(), timestamp: 123 }
      ];

      for (const invalidType of invalidTypes) {
        await expect(repository.saveMessage(invalidType as any)).rejects.toThrow(ValidationError);
      }
    });

    it('should validate role enum', async () => {
      const invalidRole = createMockMessageInput({ role: 'invalid_role' });

      await expect(repository.saveMessage(invalidRole as any)).rejects.toThrow(ValidationError);
    });

    it('should validate string lengths', async () => {
      // Content too short
      await expect(repository.saveMessage(createMockMessageInput({ content: '' })))
        .rejects.toThrow(ValidationError);

      // Content too long
      const longContent = 'x'.repeat(10001);
      await expect(repository.saveMessage(createMockMessageInput({ content: longContent })))
        .rejects.toThrow(ValidationError);

      // SenderName too long
      const longSenderName = 'x'.repeat(201);
      await expect(repository.saveMessage(createMockMessageInput({ senderName: longSenderName })))
        .rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when mission does not exist', async () => {
      const messageInput = createMockMessageInput();
      mockConnection.executeQuery.mockResolvedValue([]); // Mission not found

      await expect(repository.saveMessage(messageInput)).rejects.toThrow(NotFoundError);
    });

    it('should handle database errors during creation', async () => {
      const messageInput = createMockMessageInput();
      mockConnection.executeQuery.mockResolvedValue([{ id: 'mission-123' }]);
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.saveMessage(messageInput)).rejects.toThrow(DatabaseError);
    });

    it('should throw error when message creation fails', async () => {
      const messageInput = createMockMessageInput();
      mockConnection.executeQuery.mockResolvedValue([{ id: 'mission-123' }]);
      mockConnection.executeWrite.mockResolvedValue([]); // No results

      await expect(repository.saveMessage(messageInput)).rejects.toThrow('Failed to save message');
    });
  });

  describe('getMessagesByMission', () => {
    it('should return messages for mission without pagination', async () => {
      const mockMessages = [
        createMockMessage({ id: 'msg-1' }),
        createMockMessage({ id: 'msg-2' })
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(msg => ({ msg }))
      );

      const result = await repository.getMessagesByMission('mission-123');

      expect(result).toHaveLength(2);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY msg.timestamp ASC'),
        { missionId: 'mission-123' }
      );
    });

    it('should return messages with pagination', async () => {
      const mockMessages = [createMockMessage()];
      mockConnection.executeQuery.mockResolvedValue(
        mockMessages.map(msg => ({ msg }))
      );

      const result = await repository.getMessagesByMission('mission-123', 10, 5);

      expect(result).toHaveLength(1);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SKIP $offset LIMIT $limit'),
        expect.objectContaining({
          missionId: 'mission-123',
          limit: expect.any(Object), // Neo4j int
          offset: expect.any(Object)  // Neo4j int
        })
      );
    });

    it('should validate missionId parameter', async () => {
      await expect(repository.getMessagesByMission('')).rejects.toThrow(ValidationError);
    });

    it('should handle invalid pagination parameters', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      // Should handle negative/zero limit gracefully
      await repository.getMessagesByMission('mission-123', 0);
      await repository.getMessagesByMission('mission-123', -1);

      expect(mockConnection.executeQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getMessagesByMission('mission-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getMessageCount', () => {
    it('should return message count for mission', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ count: 15 }]);

      const result = await repository.getMessageCount('mission-123');

      expect(result).toBe(15);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('count(msg) as count'),
        { missionId: 'mission-123' }
      );
    });

    it('should return 0 when no messages found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getMessageCount('mission-123');

      expect(result).toBe(0);
    });

    it('should validate missionId parameter', async () => {
      await expect(repository.getMessageCount('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getMessageCount('mission-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getMessagesByMissionWithPagination', () => {
    it('should return paginated messages with metadata', async () => {
      const mockMessages = [createMockMessage()];
      
      jest.spyOn(repository, 'getMessageCount').mockResolvedValue(25);
      jest.spyOn(repository, 'getMessagesByMission').mockResolvedValue(mockMessages);

      const result = await repository.getMessagesByMissionWithPagination('mission-123', 2, 10);

      expect(result).toEqual({
        messages: mockMessages,
        total: 25,
        page: 2,
        pageSize: 10,
        totalPages: 3
      });
      expect(repository.getMessagesByMission).toHaveBeenCalledWith('mission-123', 10, 10); // offset = (2-1) * 10
    });

    it('should use default pagination values', async () => {
      jest.spyOn(repository, 'getMessageCount').mockResolvedValue(100);
      jest.spyOn(repository, 'getMessagesByMission').mockResolvedValue([]);

      const result = await repository.getMessagesByMissionWithPagination('mission-123');

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(repository.getMessagesByMission).toHaveBeenCalledWith('mission-123', 50, 0);
    });

    it('should validate pagination parameters', async () => {
      await expect(repository.getMessagesByMissionWithPagination('mission-123', 0))
        .rejects.toThrow(ValidationError);
      
      await expect(repository.getMessagesByMissionWithPagination('mission-123', 1, 0))
        .rejects.toThrow(ValidationError);
      
      await expect(repository.getMessagesByMissionWithPagination('mission-123', 1, 201))
        .rejects.toThrow(ValidationError);
    });

    it('should validate missionId parameter', async () => {
      await expect(repository.getMessagesByMissionWithPagination(''))
        .rejects.toThrow(ValidationError);
    });

    it('should calculate total pages correctly', async () => {
      jest.spyOn(repository, 'getMessageCount').mockResolvedValue(23);
      jest.spyOn(repository, 'getMessagesByMission').mockResolvedValue([]);

      const result = await repository.getMessagesByMissionWithPagination('mission-123', 1, 10);

      expect(result.totalPages).toBe(3); // Math.ceil(23/10)
    });
  });

  describe('deleteMessagesByMission', () => {
    it('should delete all messages for mission', async () => {
      // Mock mission exists check
      mockConnection.executeQuery.mockResolvedValue([{ id: 'mission-123' }]);
      // Mock deletion
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.deleteMessagesByMission('mission-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:Mission {id: $missionId})'),
        { missionId: 'mission-123' }
      );
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE msg'),
        { missionId: 'mission-123' }
      );
    });

    it('should throw NotFoundError when mission does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Mission not found

      await expect(repository.deleteMessagesByMission('non-existent'))
        .rejects.toThrow(NotFoundError);
    });

    it('should validate missionId parameter', async () => {
      await expect(repository.deleteMessagesByMission('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.deleteMessagesByMission('mission-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteMessage', () => {
    it('should delete individual message successfully', async () => {
      const mockMessage = createMockMessage();
      
      // Mock message exists check
      mockConnection.executeQuery.mockResolvedValue([{ msg: mockMessage }]);
      // Mock deletion
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.deleteMessage('message-123');

      expect(result).toBe(true);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (msg:MissionMessageModel {id: $messageId})'),
        { messageId: 'message-123' }
      );
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE msg'),
        { messageId: 'message-123' }
      );
    });

    it('should throw NotFoundError when message does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Message not found

      await expect(repository.deleteMessage('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should validate messageId parameter', async () => {
      await expect(repository.deleteMessage('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.deleteMessage('message-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findMessageById', () => {
    it('should return message when found', async () => {
      const mockMessage = createMockMessage();
      mockConnection.executeQuery.mockResolvedValue([{ msg: mockMessage }]);

      const result = await repository.findMessageById('message-123');

      expect(result).toEqual(mockMessage);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (msg:MissionMessageModel {id: $messageId})'),
        { messageId: 'message-123' }
      );
    });

    it('should return null when message not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findMessageById('non-existent');

      expect(result).toBeNull();
    });

    it('should validate messageId parameter', async () => {
      await expect(repository.findMessageById('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findMessageById('message-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('role validation', () => {
    it('should accept valid roles', async () => {
      const validRoles: MissionMessageRole[] = ['user', 'orchestrator', 'system'];
      
      for (const role of validRoles) {
        const messageInput = createMockMessageInput({ role });
        const mockCreated = createMockMessage({ role });
        
        mockConnection.executeQuery.mockResolvedValue([{ id: 'mission-123' }]);
        mockConnection.executeWrite.mockResolvedValue([{ msg: mockCreated }]);

        const result = await repository.saveMessage(messageInput);
        expect(result.role).toBe(role);
      }
    });

    it('should reject invalid roles', async () => {
      const invalidRoles = ['admin', 'moderator', 'assistant', ''];

      for (const role of invalidRoles) {
        const messageInput = createMockMessageInput({ role });
        await expect(repository.saveMessage(messageInput as any)).rejects.toThrow(ValidationError);
      }
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete message workflow', async () => {
      const missionId = 'mission-123';
      
      // Save multiple messages
      const userMessage = createMockMessageInput({ role: 'user', content: 'User question' });
      const systemMessage = createMockMessageInput({ role: 'system', content: 'System response', userId: undefined });
      const orchestratorMessage = createMockMessageInput({ role: 'orchestrator', content: 'Orchestrator note', userId: undefined });

      mockConnection.executeQuery.mockResolvedValue([{ id: missionId }]);
      mockConnection.executeWrite.mockResolvedValue([{ msg: createMockMessage() }]);

      await repository.saveMessage(userMessage);
      await repository.saveMessage(systemMessage);
      await repository.saveMessage(orchestratorMessage);

      // Get all messages
      const mockAllMessages = [
        createMockMessage({ role: 'user' }),
        createMockMessage({ role: 'system' }),
        createMockMessage({ role: 'orchestrator' })
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockAllMessages.map(msg => ({ msg }))
      );

      const messages = await repository.getMessagesByMission(missionId);
      expect(messages).toHaveLength(3);

      // Get count
      mockConnection.executeQuery.mockResolvedValue([{ count: 3 }]);
      const count = await repository.getMessageCount(missionId);
      expect(count).toBe(3);

      // Delete all messages
      mockConnection.executeQuery.mockResolvedValue([{ id: missionId }]);
      mockConnection.executeWrite.mockResolvedValue([]);
      await repository.deleteMessagesByMission(missionId);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE msg'),
        { missionId }
      );
    });

    it('should handle pagination edge cases', async () => {
      jest.spyOn(repository, 'getMessageCount').mockResolvedValue(7);
      jest.spyOn(repository, 'getMessagesByMission').mockResolvedValue([]);

      // Last page
      const lastPage = await repository.getMessagesByMissionWithPagination('mission-123', 2, 5);
      expect(lastPage.totalPages).toBe(2);
      expect(lastPage.page).toBe(2);

      // Page beyond total
      const beyondPage = await repository.getMessagesByMissionWithPagination('mission-123', 5, 5);
      expect(beyondPage.totalPages).toBe(2);
      expect(beyondPage.page).toBe(5);
    });
  });

  describe('error handling scenarios', () => {
    it('should handle constraint violations', async () => {
      const messageInput = createMockMessageInput();
      mockConnection.executeQuery.mockResolvedValue([{ id: 'mission-123' }]);
      mockConnection.executeWrite.mockRejectedValue(new Error('constraint violation'));

      await expect(repository.saveMessage(messageInput)).rejects.toThrow(DatabaseError);
    });

    it('should handle connection timeouts', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('connection timeout'));

      await expect(repository.getMessagesByMission('mission-123')).rejects.toThrow(DatabaseError);
    });

    it('should handle query syntax errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('syntax error in query'));

      await expect(repository.findMessageById('message-123')).rejects.toThrow(DatabaseError);
    });

    it('should handle network errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('network error'));

      await expect(repository.deleteMessage('message-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('edge cases', () => {
    it('should handle messages with minimal content', async () => {
      const minimalMessage = createMockMessageInput({
        content: 'x', // Minimum valid length
        senderName: 'A' // Minimum valid length
      });
      
      mockConnection.executeQuery.mockResolvedValue([{ id: 'mission-123' }]);
      mockConnection.executeWrite.mockResolvedValue([{ msg: createMockMessage(minimalMessage) }]);

      const result = await repository.saveMessage(minimalMessage);
      expect(result.content).toBe('x');
    });

    it('should handle messages with maximum allowed content', async () => {
      const maxContent = 'x'.repeat(10000);
      const maxMessage = createMockMessageInput({ content: maxContent });
      
      mockConnection.executeQuery.mockResolvedValue([{ id: 'mission-123' }]);
      mockConnection.executeWrite.mockResolvedValue([{ msg: createMockMessage({ content: maxContent }) }]);

      const result = await repository.saveMessage(maxMessage);
      expect(result.content).toBe(maxContent);
    });

    it('should handle messages with special characters', async () => {
      const specialContent = 'Message with émojis 🚀 and "quotes" & symbols: <>&\n\t';
      const specialMessage = createMockMessageInput({ content: specialContent });
      
      mockConnection.executeQuery.mockResolvedValue([{ id: 'mission-123' }]);
      mockConnection.executeWrite.mockResolvedValue([{ msg: createMockMessage({ content: specialContent }) }]);

      const result = await repository.saveMessage(specialMessage);
      expect(result.content).toBe(specialContent);
    });

    it('should handle orphaned message deletion gracefully', async () => {
      // Message exists but mission doesn't (edge case)
      const mockMessage = createMockMessage();
      mockConnection.executeQuery.mockResolvedValue([{ msg: mockMessage }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.deleteMessage('orphaned-message');
      expect(result).toBe(true);
    });

    it('should handle concurrent message operations', async () => {
      const missionId = 'mission-123';
      const messageInputs = [
        createMockMessageInput({ content: 'Message 1' }),
        createMockMessageInput({ content: 'Message 2' }),
        createMockMessageInput({ content: 'Message 3' })
      ];

      mockConnection.executeQuery.mockResolvedValue([{ id: missionId }]);
      mockConnection.executeWrite.mockResolvedValue([{ msg: createMockMessage() }]);

      // Simulate concurrent saves
      const promises = messageInputs.map(input => repository.saveMessage(input));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(3);
    });

    it('should handle empty mission check result edge case', async () => {
      const messageInput = createMockMessageInput();
      mockConnection.executeQuery.mockResolvedValue(null as any); // Null result

      await expect(repository.saveMessage(messageInput)).rejects.toThrow(NotFoundError);
    });
  });
});