/**
 * MessageEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the MessageEntity class.
 */

import { MessageEntity } from '@/entities/MessageEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('MessageEntity', () => {
  let testHelper: EntityTestHelper<MessageEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(MessageEntity, 'MessageEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const message = new MessageEntity();
      message.id = 'message-123';
      message.starshipId = 'starship-456';
      message.conversationId = 'conversation-789';
      message.role = 'user';
      message.content = 'Hello, how are you?';
      message.messageType = 'user_input';
      message.createdAt = '2024-01-01T00:00:00.000Z';
      message.updatedAt = '2024-01-02T12:00:00.000Z';

      const serialized = toDatabase(message);

      expect(serialized).toEqual({
        id: 'message-123',
        starship_id: 'starship-456',
        conversation_id: 'conversation-789',
        role: 'user',
        content: 'Hello, how are you?',
        message_type: 'user_input',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should handle optional fields for assistant messages', async () => {
      const message = new MessageEntity();
      message.id = 'message-123';
      message.starshipId = 'starship-456';
      message.conversationId = 'conversation-789';
      message.role = 'assistant';
      message.content = 'I can help you with that.';
      message.messageType = 'agent_response';
      message.reasoning = 'User asked a question, providing helpful response';
      message.toolCalls = [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"query": "test"}',
          },
        },
      ];
      message.createdAt = '2024-01-01T00:00:00.000Z';
      message.updatedAt = '2024-01-02T12:00:00.000Z';

      const serialized = toDatabase(message);

      expect(serialized.reasoning).toBe('User asked a question, providing helpful response');
      expect(serialized.tool_calls).toEqual([
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"query": "test"}',
          },
        },
      ]);
    });

    it('should handle tool result messages with toolCallId', async () => {
      const message = new MessageEntity();
      message.id = 'message-123';
      message.starshipId = 'starship-456';
      message.conversationId = 'conversation-789';
      message.role = 'tool';
      message.content = '{"result": "success"}';
      message.messageType = 'tool_result';
      message.toolCallId = 'call-1';
      message.createdAt = '2024-01-01T00:00:00.000Z';
      message.updatedAt = '2024-01-02T12:00:00.000Z';

      const serialized = toDatabase(message);

      expect(serialized.tool_call_id).toBe('call-1');
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'message-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        role: 'user',
        content: 'Hello, how are you?',
        messageType: 'user_input',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(MessageEntity, databaseRecord);

      expect(entity).toBeInstanceOf(MessageEntity);
      expect(entity.id).toBe('message-123');
      expect(entity.role).toBe('user');
      expect(entity.content).toBe('Hello, how are you?');
      expect(entity.messageType).toBe('user_input');
    });

    it('should handle optional reasoning and toolCalls', async () => {
      const databaseRecord = {
        id: 'message-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        role: 'assistant',
        content: 'Here is the result',
        messageType: 'agent_response',
        reasoning: 'Processing user request',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query": "test"}',
            },
          },
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(MessageEntity, databaseRecord);

      expect(entity.reasoning).toBe('Processing user request');
      expect(entity.toolCalls).toHaveLength(1);
      expect(entity.toolCalls?.[0].id).toBe('call-1');
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'message-1',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'user',
          content: 'First message',
          messageType: 'user_input',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          id: 'message-2',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'assistant',
          content: 'Second message',
          messageType: 'agent_response',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(MessageEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(MessageEntity);
      expect(entities[1]).toBeInstanceOf(MessageEntity);
      expect(entities[0].role).toBe('user');
      expect(entities[1].role).toBe('assistant');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid user message', async () => {
      const validData = {
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        role: 'user',
        content: 'Hello!',
        messageType: 'user_input',
      };

      await expect(MessageEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should pass validation for assistant message with toolCalls and no content', async () => {
      const validData = {
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        role: 'assistant',
        content: '',
        messageType: 'agent_response',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query": "test"}',
            },
          },
        ],
      };

      await expect(MessageEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should pass validation for assistant message with reasoning and no content', async () => {
      const validData = {
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        role: 'assistant',
        content: '',
        messageType: 'agent_response',
        reasoning: 'Thinking about the problem...',
      };

      await expect(MessageEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        // role is missing
        content: 'Hello!',
        messageType: 'user_input',
      };

      await expect(MessageEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate role enum constraints', async () => {
      await expect(
        MessageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'invalid-role',
          content: 'Hello!',
          messageType: 'user_input',
        })
      ).rejects.toThrow();

      const validRoles = ['system', 'user', 'assistant', 'tool'];
      for (const role of validRoles) {
        await expect(
          MessageEntity.validate({
            starshipId: 'starship-456',
            conversationId: 'conversation-789',
            role,
            content: 'Test message',
            messageType: 'user_input',
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate messageType enum constraints', async () => {
      await expect(
        MessageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'user',
          content: 'Hello!',
          messageType: 'invalid-type',
        })
      ).rejects.toThrow();

      const validMessageTypes = [
        'user_input',
        'agent_response',
        'system_notification',
        'system_instruction',
        'workflow_output',
        'error',
        'tool_result',
      ];
      for (const messageType of validMessageTypes) {
        await expect(
          MessageEntity.validate({
            starshipId: 'starship-456',
            conversationId: 'conversation-789',
            role: 'user',
            content: 'Test message',
            messageType,
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate content is not empty for non-assistant messages', async () => {
      await expect(
        MessageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'user',
          content: '',
          messageType: 'user_input',
        })
      ).rejects.toThrow();

      await expect(
        MessageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'user',
          content: 'Valid content',
          messageType: 'user_input',
        })
      ).resolves.not.toThrow();
    });

    it('should validate reasoning length constraints', async () => {
      await expect(
        MessageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'assistant',
          content: 'Response',
          messageType: 'agent_response',
          reasoning: '',
        })
      ).rejects.toThrow();

      await expect(
        MessageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'assistant',
          content: 'Response',
          messageType: 'agent_response',
          reasoning: 'a'.repeat(200001),
        })
      ).rejects.toThrow();

      await expect(
        MessageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'assistant',
          content: 'Response',
          messageType: 'agent_response',
          reasoning: 'Valid reasoning text',
        })
      ).resolves.not.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        content: 'Updated content',
      };

      await expect(MessageEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(MessageEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(MessageEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(MessageEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'message-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        role: 'assistant',
        content: 'Here is my response',
        messageType: 'agent_response',
        reasoning: 'Analyzing the user query',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query": "test"}',
            },
          },
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete message data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as MessageEntity;
      expect(entity.role).toBe('assistant');
      expect(entity.content).toBe('Here is my response');
      expect(entity.reasoning).toBe('Analyzing the user query');
      expect(entity.toolCalls).toHaveLength(1);
    });

    it('should handle round-trip with minimal data', async () => {
      const minimalData = {
        id: 'message-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        role: 'user',
        content: 'Simple message',
        messageType: 'user_input',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: minimalData, description: 'minimal message data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as MessageEntity;
      expect(entity.reasoning).toBeUndefined();
      expect(entity.toolCalls).toBeUndefined();
      expect(entity.toolCallId).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(MessageEntity, null)).toThrow();
      expect(() => fromDatabase(MessageEntity, undefined)).toThrow();
      expect(() => fromDatabase(MessageEntity, 'not an object')).toThrow();
    });

    it('should handle empty array deserialization', async () => {
      const emptyArray: never[] = [];
      const entities = fromDatabaseArray(MessageEntity, emptyArray);

      expect(entities).toHaveLength(0);
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle all valid roles', async () => {
      const roles = ['system', 'user', 'assistant', 'tool'];

      for (const role of roles) {
        const record = {
          id: 'message-123',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role,
          content: 'Test content',
          messageType: 'user_input',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(MessageEntity, record);
        expect(entity.role).toBe(role);
      }
    });

    it('should handle all valid messageTypes', async () => {
      const messageTypes = [
        'user_input',
        'agent_response',
        'system_notification',
        'system_instruction',
        'workflow_output',
        'error',
        'tool_result',
      ];

      for (const messageType of messageTypes) {
        const record = {
          id: 'message-123',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'user',
          content: 'Test content',
          messageType,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(MessageEntity, record);
        expect(entity.messageType).toBe(messageType);
      }
    });

    it('should handle very long content', async () => {
      const longContent = 'a'.repeat(10000);
      const record = {
        id: 'message-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        role: 'user',
        content: longContent,
        messageType: 'user_input',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(MessageEntity, record);
      expect(entity.content).toBe(longContent);
      expect(entity.content.length).toBe(10000);
    });

    it('should handle special characters in content', async () => {
      const specialContents = [
        'Content with "quotes"',
        "Content with 'apostrophes'",
        'Content with émojis 💬',
        'Unicode test: αβγδε',
        'Mixed: English 中文 العربية',
        'Code: const x = { y: "z" };',
      ];

      for (const content of specialContents) {
        const record = {
          id: 'message-123',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          role: 'user',
          content,
          messageType: 'user_input',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(MessageEntity, record);
        expect(entity.content).toBe(content);

        const serialized = toDatabase(entity);
        const deserialized = fromDatabase(MessageEntity, serialized);
        expect(deserialized.content).toBe(content);
      }
    });

    it('should handle multiple toolCalls', async () => {
      const record = {
        id: 'message-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        role: 'assistant',
        content: 'Processing your request',
        messageType: 'agent_response',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query": "test1"}',
            },
          },
          {
            id: 'call-2',
            type: 'function',
            function: {
              name: 'calculate',
              arguments: '{"expression": "2+2"}',
            },
          },
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(MessageEntity, record);
      expect(entity.toolCalls).toHaveLength(2);
      expect(entity.toolCalls?.[0].id).toBe('call-1');
      expect(entity.toolCalls?.[1].id).toBe('call-2');
    });
  });
});
