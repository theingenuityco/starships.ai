/**
 * ConversationEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the ConversationEntity class.
 */

import { ConversationEntity } from '@/entities/ConversationEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('ConversationEntity', () => {
  let testHelper: EntityTestHelper<ConversationEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(ConversationEntity, 'ConversationEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const conversation = new ConversationEntity();
      conversation.id = 'conversation-123';
      conversation.title = 'Test Conversation';
      conversation.status = 'active';
      conversation.createdAt = '2024-01-01T00:00:00.000Z';
      conversation.updatedAt = '2024-01-02T12:00:00.000Z';

      const serialized = toDatabase(conversation);

      expect(serialized).toEqual({
        id: 'conversation-123',
        title: 'Test Conversation',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should handle optional updatedAt field', async () => {
      const conversation = new ConversationEntity();
      conversation.id = 'conversation-123';
      conversation.title = 'Test Conversation';
      conversation.status = 'active';
      conversation.createdAt = '2024-01-01T00:00:00.000Z';
      // updatedAt is not set

      const serialized = toDatabase(conversation);

      expect(serialized.updatedAt).toBeUndefined();
      expect(serialized.title).toBe('Test Conversation');
      expect(serialized.status).toBe('active');
    });

    it('should handle default status transformation', async () => {
      const conversation = new ConversationEntity();
      conversation.id = 'conversation-123';
      conversation.title = 'Test Conversation';
      conversation.createdAt = '2024-01-01T00:00:00.000Z';
      // status is not explicitly set, should default to 'active'

      const serialized = toDatabase(conversation);

      expect(serialized.status).toBe('active');
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'conversation-123',
        title: 'Test Conversation',
        status: 'paused',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(ConversationEntity, databaseRecord);

      expect(entity).toBeInstanceOf(ConversationEntity);
      expect(entity.id).toBe('conversation-123');
      expect(entity.title).toBe('Test Conversation');
      expect(entity.status).toBe('paused');
      expect(entity.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.updatedAt).toBe('2024-01-02T12:00:00.000Z');
    });

    it('should handle missing optional updatedAt field', async () => {
      const databaseRecord = {
        id: 'conversation-123',
        title: 'Test Conversation',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(ConversationEntity, databaseRecord);

      expect(entity).toBeInstanceOf(ConversationEntity);
      expect(entity.updatedAt).toBeUndefined();
      expect(entity.id).toBe('conversation-123');
      expect(entity.title).toBe('Test Conversation');
    });

    it('should apply default status transformation', async () => {
      const databaseRecord = {
        id: 'conversation-123',
        title: 'Test Conversation',
        createdAt: '2024-01-01T00:00:00.000Z',
        // status is missing, should default to 'active'
      };

      const entity = fromDatabase(ConversationEntity, databaseRecord);

      expect(entity.status).toBe('active');
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'conversation-1',
          title: 'Conversation 1',
          status: 'active',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          id: 'conversation-2',
          title: 'Conversation 2',
          status: 'completed',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(ConversationEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(ConversationEntity);
      expect(entities[1]).toBeInstanceOf(ConversationEntity);
      expect(entities[0].title).toBe('Conversation 1');
      expect(entities[1].title).toBe('Conversation 2');
      expect(entities[0].status).toBe('active');
      expect(entities[1].status).toBe('completed');
    });
  });

  describe('Transformations', () => {
    it('should transform date strings correctly', async () => {
      const databaseRecord = {
        id: 'conversation-123',
        title: 'Test Conversation',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:30:45.123Z',
      };

      const entity = fromDatabase(ConversationEntity, databaseRecord);

      // Dates should be preserved as ISO strings for entities
      expect(entity.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.updatedAt).toBe('2024-01-02T12:30:45.123Z');
      expect(typeof entity.createdAt).toBe('string');
      expect(typeof entity.updatedAt).toBe('string');
    });

    it('should handle date transformation edge cases', async () => {
      const databaseRecord = {
        id: 'conversation-123',
        title: 'Test Conversation',
        status: 'active',
        createdAt: new Date('2024-01-01T00:00:00.000Z'), // Date object
        updatedAt: null, // null value
      };

      const entity = fromDatabase(ConversationEntity, databaseRecord);

      expect(entity.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.updatedAt).toBeUndefined();
    });

    it('should apply status default transformation', async () => {
      const testCases = [
        {
          input: {
            id: 'conversation-123',
            title: 'Test Conversation',
            createdAt: '2024-01-01T00:00:00.000Z',
            status: undefined,
          },
          expected: { status: 'active' as 'active' | 'paused' | 'completed' | 'archived' },
          description: 'should default undefined status to active',
        },
        {
          input: {
            id: 'conversation-123',
            title: 'Test Conversation',
            createdAt: '2024-01-01T00:00:00.000Z',
            status: null,
          },
          expected: { status: 'active' as 'active' | 'paused' | 'completed' | 'archived' },
          description: 'should default null status to active',
        },
      ];

      const results = await testHelper.testTransformations(testCases);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        title: 'Test Conversation',
        status: 'active',
      };

      await expect(ConversationEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should pass validation with minimal data (title only)', async () => {
      const validData = {
        title: 'Minimal Conversation',
      };

      await expect(ConversationEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing title', async () => {
      const invalidData = {
        status: 'active',
      };

      await expect(ConversationEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate title length constraints', async () => {
      // Too short title (empty string)
      await expect(
        ConversationEntity.validate({
          title: '',
        })
      ).rejects.toThrow();

      // Too long title
      await expect(
        ConversationEntity.validate({
          title: 'a'.repeat(101),
        })
      ).rejects.toThrow();

      // Valid title lengths should pass
      await expect(
        ConversationEntity.validate({
          title: 'a', // Minimum length
        })
      ).resolves.not.toThrow();

      await expect(
        ConversationEntity.validate({
          title: 'a'.repeat(100), // Maximum length
        })
      ).resolves.not.toThrow();
    });

    it('should validate status constraints', async () => {
      // Invalid status
      await expect(
        ConversationEntity.validate({
          title: 'Test Conversation',
          status: 'invalid-status',
        })
      ).rejects.toThrow();

      // Valid statuses should pass
      const validStatuses = ['active', 'paused', 'completed', 'archived'];
      for (const status of validStatuses) {
        await expect(
          ConversationEntity.validate({
            title: 'Test Conversation',
            status,
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate date formats', async () => {
      // Invalid date format
      await expect(
        ConversationEntity.validate({
          title: 'Test Conversation',
          createdAt: 'invalid-date',
        })
      ).rejects.toThrow();

      await expect(
        ConversationEntity.validate({
          title: 'Test Conversation',
          updatedAt: '2024-13-01T00:00:00.000Z', // Invalid month
        })
      ).rejects.toThrow();

      // Valid date formats should pass
      await expect(
        ConversationEntity.validate({
          title: 'Test Conversation',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:30:45.123Z',
        })
      ).resolves.not.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        title: 'Updated Title',
      };

      await expect(ConversationEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should allow status-only updates', async () => {
      const updateData = {
        status: 'completed',
      };

      await expect(ConversationEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(ConversationEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(ConversationEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(ConversationEntity.validate(123)).rejects.toThrow('Data must be an object');
      await expect(ConversationEntity.validate([])).rejects.toThrow('Data must be an object');
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'conversation-123',
        title: 'Test Conversation with Special Characters éñ',
        status: 'paused',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:30:45.123Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete conversation data' }]);

      expect(results[0].success).toBe(true);
      expect(results[0].keysMatch).toBe(true);

      // Verify specific data is preserved
      const entity = results[0].entity as ConversationEntity;
      expect(entity.title).toBe('Test Conversation with Special Characters éñ');
      expect(entity.status).toBe('paused');
      expect(entity.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.updatedAt).toBe('2024-01-02T12:30:45.123Z');
    });

    it('should handle round-trip with minimal data', async () => {
      const minimalData = {
        id: 'conversation-123',
        title: 'Minimal Conversation',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: minimalData, description: 'minimal conversation data' }]);

      expect(results[0].success).toBe(true);

      // Verify transformations worked
      const entity = results[0].entity as ConversationEntity;
      expect(entity.status).toBe('active'); // Should get default value
      expect(entity.updatedAt).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(ConversationEntity, null)).toThrow();
      expect(() => fromDatabase(ConversationEntity, undefined)).toThrow();
      expect(() => fromDatabase(ConversationEntity, 'not an object')).toThrow();
      expect(() => fromDatabase(ConversationEntity, 123)).toThrow();
    });

    it('should handle array deserialization with mixed data', async () => {
      const mixedData = [
        {
          id: 'conversation-1',
          title: 'Valid Conversation',
          status: 'active',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        null, // Invalid item
      ];

      expect(() => fromDatabaseArray(ConversationEntity, mixedData)).toThrow();
    });

    it('should handle empty array deserialization', async () => {
      const emptyArray: never[] = [];
      const entities = fromDatabaseArray(ConversationEntity, emptyArray);

      expect(entities).toHaveLength(0);
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle edge case titles', async () => {
      // Very short title
      const shortTitleRecord = {
        id: 'conversation-123',
        title: 'A',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const shortEntity = fromDatabase(ConversationEntity, shortTitleRecord);
      expect(shortEntity.title).toBe('A');

      // Maximum length title
      const longTitle = 'a'.repeat(100);
      const longTitleRecord = {
        id: 'conversation-123',
        title: longTitle,
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const longEntity = fromDatabase(ConversationEntity, longTitleRecord);
      expect(longEntity.title).toBe(longTitle);
      expect(longEntity.title.length).toBe(100);
    });

    it('should handle all valid status values', async () => {
      const validStatuses = ['active', 'paused', 'completed', 'archived'];

      for (const status of validStatuses) {
        const record = {
          id: 'conversation-123',
          title: `Conversation with ${status} status`,
          status,
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(ConversationEntity, record);
        expect(entity.status).toBe(status);

        // Should also pass validation
        await expect(
          ConversationEntity.validate({
            title: 'Test',
            status,
          })
        ).resolves.not.toThrow();
      }
    });

    it('should handle date edge cases', async () => {
      // Very old date
      const oldDateRecord = {
        id: 'conversation-123',
        title: 'Old Conversation',
        status: 'archived',
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:01.000Z',
      };

      const oldEntity = fromDatabase(ConversationEntity, oldDateRecord);
      expect(oldEntity.createdAt).toBe('1970-01-01T00:00:00.000Z');

      // Future date
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const futureRecord = {
        id: 'conversation-123',
        title: 'Future Conversation',
        status: 'active',
        createdAt: futureDate,
      };

      const futureEntity = fromDatabase(ConversationEntity, futureRecord);
      expect(futureEntity.createdAt).toBe(futureDate);
    });

    it('should handle special characters in titles', async () => {
      const specialTitles = [
        'Conversation with émojis 🚀✨',
        'Test with "quotes" and \'apostrophes\'',
        'Unicode test: αβγδε',
        'Mixed: English 中文 العربية',
        'Numbers and symbols: 123!@#$%^&*()',
      ];

      for (const title of specialTitles) {
        const record = {
          id: 'conversation-123',
          title,
          status: 'active',
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(ConversationEntity, record);
        expect(entity.title).toBe(title);

        // Should serialize and deserialize correctly
        const serialized = toDatabase(entity);
        const deserialized = fromDatabase(ConversationEntity, serialized);
        expect(deserialized.title).toBe(title);
      }
    });
  });

  describe('Integration with test helper', () => {
    it('should work with entity test helper validation tests', async () => {
      const validationTestCases = [
        {
          data: { title: 'Valid Conversation', status: 'active' },
          shouldPass: true,
          description: 'valid conversation data should pass',
        },
        {
          data: { title: '', status: 'active' },
          shouldPass: false,
          description: 'empty title should fail',
        },
        {
          data: { title: 'Valid Title', status: 'invalid-status' },
          shouldPass: false,
          description: 'invalid status should fail',
        },
        {
          data: { status: 'active' }, // Missing title
          shouldPass: false,
          description: 'missing title should fail',
        },
      ];

      const results = await testHelper.testValidation(validationTestCases);

      results.forEach((result, index) => {
        expect(result.passed).toBe(validationTestCases[index].shouldPass);
      });
    });
  });
});
