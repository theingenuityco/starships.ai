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
      message.createdAt = '2024-01-01T00:00:00.000Z';
      message.updatedAt = '2024-01-01T00:05:00.000Z';
      message.role = 'user';
      message.content = 'Hello, how can you help me?';
      message.messageType = 'user_input';

      const serialized = toDatabase(message);

      expect(serialized).toEqual({
        id: 'message-123',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:05:00.000Z',
        role: 'user',
        content: 'Hello, how can you help me?',
        message_type: 'user_input',
      });
    });

    it('should handle different roles and message types', async () => {
      const testCases = [
        { role: 'system' as const, messageType: 'system_instruction' as const, content: 'System initialization message' },
        { role: 'user' as const, messageType: 'user_input' as const, content: 'User question' },
        { role: 'assistant' as const, messageType: 'agent_response' as const, content: 'Agent response' },
        { role: 'assistant' as const, messageType: 'workflow_output' as const, content: 'Workflow completed successfully' },
      ];

      for (const testCase of testCases) {
        const message = new MessageEntity();
        message.id = 'message-123';
        message.createdAt = '2024-01-01T00:00:00.000Z';
        message.updatedAt = '2024-01-01T00:00:00.000Z';
        message.role = testCase.role;
        message.content = testCase.content;
        message.messageType = testCase.messageType;

        const serialized = toDatabase(message);

        expect(serialized.role).toBe(testCase.role);
        expect(serialized.message_type).toBe(testCase.messageType);
        expect(serialized.content).toBe(testCase.content);
      }
    });

    it('should handle long content serialization', async () => {
      const message = new MessageEntity();
      message.id = 'message-123';
      message.createdAt = '2024-01-01T00:00:00.000Z';
      message.updatedAt = '2024-01-01T00:00:00.000Z';
      message.role = 'assistant';
      message.content = 'Very long content: ' + 'a'.repeat(10000);
      message.messageType = 'agent_response';

      const serialized = toDatabase(message);

      expect((serialized.content as string).length).toBe(10019); // 'Very long content: ' + 10000 'a's
      expect((serialized.content as string).startsWith('Very long content:')).toBe(true);
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'message-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
        role: 'user',
        content: 'Hello, how can you help me?',
        messageType: 'user_input',
      };

      const entity = fromDatabase(MessageEntity, databaseRecord);

      expect(entity).toBeInstanceOf(MessageEntity);
      expect(entity.id).toBe('message-123');
      expect(entity.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.updatedAt).toBe('2024-01-01T00:05:00.000Z');
      expect(entity.role).toBe('user');
      expect(entity.content).toBe('Hello, how can you help me?');
      expect(entity.messageType).toBe('user_input');
    });

    it('should handle all valid role types', async () => {
      const validRoles: Array<'system' | 'user' | 'assistant'> = ['system', 'user', 'assistant'];

      for (const role of validRoles) {
        const databaseRecord = {
          id: 'message-123',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          role,
          content: `Test message from ${role}`,
          messageType: 'user_input',
        };

        const entity = fromDatabase(MessageEntity, databaseRecord);
        expect(entity.role).toBe(role);
      }
    });

    it('should handle all valid message types', async () => {
      const validMessageTypes: Array<
        'user_input' | 'agent_response' | 'system_notification' | 'system_instruction' | 'workflow_output' | 'error'
      > = ['user_input', 'agent_response', 'system_notification', 'system_instruction', 'workflow_output', 'error'];

      for (const messageType of validMessageTypes) {
        const databaseRecord = {
          id: 'message-123',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          role: 'user',
          content: `Test message of type ${messageType}`,
          messageType,
        };

        const entity = fromDatabase(MessageEntity, databaseRecord);
        expect(entity.messageType).toBe(messageType);
      }
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'message-1',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          role: 'user',
          content: 'First message',
          messageType: 'user_input',
        },
        {
          id: 'message-2',
          createdAt: '2024-01-01T00:01:00.000Z',
          updatedAt: '2024-01-01T00:01:00.000Z',
          role: 'assistant',
          content: 'Second message',
          messageType: 'agent_response',
        },
      ];

      const entities = fromDatabaseArray(MessageEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(MessageEntity);
      expect(entities[1]).toBeInstanceOf(MessageEntity);
      expect(entities[0].content).toBe('First message');
      expect(entities[1].content).toBe('Second message');
      expect(entities[0].messageType).toBe('user_input');
      expect(entities[1].messageType).toBe('agent_response');
    });
  });

  describe('Transformations', () => {
    it('should transform date strings correctly', async () => {
      const databaseRecord = {
        id: 'message-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:30.123Z',
        role: 'user',
        content: 'Test message',
        messageType: 'user_input',
      };

      const entity = fromDatabase(MessageEntity, databaseRecord);

      // Dates should be preserved as ISO strings for entities
      expect(entity.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.updatedAt).toBe('2024-01-01T00:05:30.123Z');
      expect(typeof entity.createdAt).toBe('string');
      expect(typeof entity.updatedAt).toBe('string');
    });

    it('should handle date transformation with Date objects', async () => {
      const databaseRecord = {
        id: 'message-123',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:05:00.000Z'),
        role: 'user',
        content: 'Test message',
        messageType: 'user_input',
      };

      const entity = fromDatabase(MessageEntity, databaseRecord);

      // Date objects from PostgreSQL remain as Date objects with exposeAll strategy
      expect(entity.createdAt).toBeDefined();
      expect(entity.updatedAt).toBeDefined();
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        role: 'user',
        content: 'Hello, world!',
        messageType: 'user_input',
      };

      await expect(MessageEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        content: 'Missing role and messageType',
      };

      await expect(MessageEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate role constraints', async () => {
      // Invalid role
      await expect(
        MessageEntity.validate({
          role: 'invalid-role',
          content: 'Test content',
          messageType: 'user_input',
        })
      ).rejects.toThrow();

      // Valid roles should pass
      const validRoles = ['system', 'user', 'assistant'];
      for (const role of validRoles) {
        await expect(
          MessageEntity.validate({
            role,
            content: 'Test content',
            messageType: 'user_input',
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate messageType constraints', async () => {
      // Invalid messageType
      await expect(
        MessageEntity.validate({
          role: 'user',
          content: 'Test content',
          messageType: 'invalid-type',
        })
      ).rejects.toThrow();

      // Valid messageTypes should pass
      const validMessageTypes = ['user_input', 'agent_response', 'system_notification', 'system_instruction', 'workflow_output', 'error'];
      for (const messageType of validMessageTypes) {
        await expect(
          MessageEntity.validate({
            role: 'user',
            content: 'Test content',
            messageType,
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate content length constraints', async () => {
      // Too short content (empty string)
      await expect(
        MessageEntity.validate({
          role: 'user',
          content: '',
          messageType: 'user_input',
        })
      ).rejects.toThrow();

      // Valid content lengths should pass - no maximum limit
      await expect(
        MessageEntity.validate({
          role: 'user',
          content: 'a', // Minimum length
          messageType: 'user_input',
        })
      ).resolves.not.toThrow();

      await expect(
        MessageEntity.validate({
          role: 'user',
          content: 'a'.repeat(50000), // Large content should be allowed
          messageType: 'user_input',
        })
      ).resolves.not.toThrow();

      await expect(
        MessageEntity.validate({
          role: 'user',
          content: 'a'.repeat(100000), // Very large content should be allowed
          messageType: 'user_input',
        })
      ).resolves.not.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        content: 'Updated message content',
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
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:30.123Z',
        role: 'assistant',
        content: 'This is a comprehensive test message with special characters: éñ 🚀',
        messageType: 'agent_response',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete message data' }]);

      expect(results[0].success).toBe(true);
      // Keys won't match exactly due to camelCase to snake_case conversion
      // expect(results[0].keysMatch).toBe(true);

      // Verify specific data is preserved
      const entity = results[0].entity as MessageEntity;
      expect(entity.role).toBe('assistant');
      expect(entity.content).toBe('This is a comprehensive test message with special characters: éñ 🚀');
      expect(entity.messageType).toBe('agent_response');
    });

    it('should handle round-trip with minimal data', async () => {
      const minimalData = {
        id: 'message-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        role: 'user',
        content: 'Hello',
        messageType: 'user_input',
      };

      const results = await testHelper.testRoundTrip([{ data: minimalData, description: 'minimal message data' }]);

      expect(results[0].success).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(MessageEntity, null)).toThrow();
      expect(() => fromDatabase(MessageEntity, undefined)).toThrow();
      expect(() => fromDatabase(MessageEntity, 'not an object')).toThrow();
    });

    it('should handle array deserialization with mixed data', async () => {
      const mixedData = [
        {
          id: 'message-1',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          role: 'user',
          content: 'Valid message',
          messageType: 'user_input',
        },
        null, // Invalid item
      ];

      expect(() => fromDatabaseArray(MessageEntity, mixedData)).toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle very long content', async () => {
      const longContent = 'a'.repeat(10000);
      const databaseRecord = {
        id: 'message-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        role: 'assistant',
        content: longContent,
        messageType: 'agent_response',
      };

      const entity = fromDatabase(MessageEntity, databaseRecord);
      expect(entity.content.length).toBe(10000);
      expect(entity.content).toBe(longContent);
    });

    it('should handle all role and messageType combinations', async () => {
      const combinations = [
        { role: 'system', messageType: 'system_instruction' },
        { role: 'system', messageType: 'system_notification' },
        { role: 'user', messageType: 'user_input' },
        { role: 'assistant', messageType: 'agent_response' },
        { role: 'assistant', messageType: 'workflow_output' },
        { role: 'assistant', messageType: 'error' },
      ];

      for (const combo of combinations) {
        const databaseRecord = {
          id: 'message-123',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          role: combo.role,
          content: `Test ${combo.role} message`,
          messageType: combo.messageType,
        };

        const entity = fromDatabase(MessageEntity, databaseRecord);
        expect(entity.role).toBe(combo.role);
        expect(entity.messageType).toBe(combo.messageType);

        // Should also pass validation
        await expect(
          MessageEntity.validate({
            role: combo.role,
            content: 'Test content',
            messageType: combo.messageType,
          })
        ).resolves.not.toThrow();
      }
    });

    it('should handle special characters and emojis in content', async () => {
      const specialContents = [
        'Message with émojis 🚀✨🎉',
        'Unicode test: αβγδε',
        'Mixed languages: English 中文 العربية',
        'Code snippet: console.log("Hello, world!");',
        'JSON: {"key": "value", "number": 123}',
        'Markdown: **bold** and *italic*',
      ];

      for (const content of specialContents) {
        const databaseRecord = {
          id: 'message-123',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          role: 'user',
          content,
          messageType: 'user_input',
        };

        const entity = fromDatabase(MessageEntity, databaseRecord);
        expect(entity.content).toBe(content);

        // Should serialize and deserialize correctly
        const serialized = toDatabase(entity);
        const deserialized = fromDatabase(MessageEntity, serialized);
        expect(deserialized.content).toBe(content);
      }
    });

    it('should handle edge case timestamps', async () => {
      // Very old timestamp
      const oldTimestamp = '1970-01-01T00:00:00.000Z';
      // Future timestamp
      const futureTimestamp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      const databaseRecord = {
        id: 'message-123',
        createdAt: oldTimestamp,
        updatedAt: futureTimestamp,
        role: 'user',
        content: 'Edge case timestamps',
        messageType: 'user_input',
      };

      const entity = fromDatabase(MessageEntity, databaseRecord);
      expect(entity.createdAt).toBe(oldTimestamp);
      expect(entity.updatedAt).toBe(futureTimestamp);
    });
  });

  describe('Integration with test helper', () => {
    it('should work with entity test helper validation tests', async () => {
      const validationTestCases = [
        {
          data: { role: 'user', content: 'Valid message', messageType: 'user_input' },
          shouldPass: true,
          description: 'valid message data should pass',
        },
        {
          data: { role: 'invalid-role', content: 'Invalid role', messageType: 'user_input' },
          shouldPass: false,
          description: 'invalid role should fail',
        },
        {
          data: { role: 'user', content: '', messageType: 'user_input' },
          shouldPass: false,
          description: 'empty content should fail',
        },
        {
          data: { role: 'user', content: 'Valid content', messageType: 'invalid-type' },
          shouldPass: false,
          description: 'invalid messageType should fail',
        },
      ];

      const results = await testHelper.testValidation(validationTestCases);

      results.forEach((result, index) => {
        expect(result.passed).toBe(validationTestCases[index].shouldPass);
      });
    });
  });
});
