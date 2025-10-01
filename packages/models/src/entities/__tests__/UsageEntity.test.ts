/**
 * UsageEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the UsageEntity class.
 */

import { UsageEntity } from '@/entities/UsageEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('UsageEntity', () => {
  let testHelper: EntityTestHelper<UsageEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(UsageEntity, 'UsageEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const usage = new UsageEntity();
      usage.id = 'usage-123';
      usage.starshipId = 'starship-456';
      usage.conversationId = 'conversation-789';
      usage.promptTokens = 100;
      usage.completionTokens = 50;
      usage.totalTokens = 150;
      usage.cost = 0.0025;
      usage.model = 'gpt-4';
      usage.createdAt = '2024-01-01T00:00:00.000Z';

      const serialized = toDatabase(usage);

      expect(serialized).toEqual({
        id: 'usage-123',
        starship_id: 'starship-456',
        conversation_id: 'conversation-789',
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost: 0.0025,
        model: 'gpt-4',
        created_at: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should handle optional model field', async () => {
      const usage = new UsageEntity();
      usage.id = 'usage-123';
      usage.starshipId = 'starship-456';
      usage.conversationId = 'conversation-789';
      usage.promptTokens = 100;
      usage.completionTokens = 50;
      usage.totalTokens = 150;
      usage.cost = 0.0025;
      usage.createdAt = '2024-01-01T00:00:00.000Z';

      const serialized = toDatabase(usage);

      expect(serialized.model).toBeUndefined();
      expect(serialized.prompt_tokens).toBe(100);
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'usage-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.0025,
        model: 'gpt-4',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UsageEntity, databaseRecord);

      expect(entity).toBeInstanceOf(UsageEntity);
      expect(entity.id).toBe('usage-123');
      expect(entity.starshipId).toBe('starship-456');
      expect(entity.conversationId).toBe('conversation-789');
      expect(entity.promptTokens).toBe(100);
      expect(entity.completionTokens).toBe(50);
      expect(entity.totalTokens).toBe(150);
      expect(entity.cost).toBe(0.0025);
      expect(entity.model).toBe('gpt-4');
    });

    it('should handle missing optional model field', async () => {
      const databaseRecord = {
        id: 'usage-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.0025,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UsageEntity, databaseRecord);

      expect(entity).toBeInstanceOf(UsageEntity);
      expect(entity.model).toBeUndefined();
      expect(entity.totalTokens).toBe(150);
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'usage-1',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.0025,
          model: 'gpt-4',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'usage-2',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          cost: 0.005,
          model: 'claude-3',
          createdAt: '2024-01-02T00:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(UsageEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(UsageEntity);
      expect(entities[1]).toBeInstanceOf(UsageEntity);
      expect(entities[0].totalTokens).toBe(150);
      expect(entities[1].totalTokens).toBe(300);
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.0025,
      };

      await expect(UsageEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        // promptTokens is missing
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.0025,
      };

      await expect(UsageEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate token counts are non-negative', async () => {
      await expect(
        UsageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: -1,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.0025,
        })
      ).rejects.toThrow();

      await expect(
        UsageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 100,
          completionTokens: -1,
          totalTokens: 150,
          cost: 0.0025,
        })
      ).rejects.toThrow();

      await expect(
        UsageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: -1,
          cost: 0.0025,
        })
      ).rejects.toThrow();

      await expect(
        UsageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
        })
      ).resolves.not.toThrow();
    });

    it('should validate cost is non-negative', async () => {
      await expect(
        UsageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: -0.001,
        })
      ).rejects.toThrow();

      await expect(
        UsageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0,
        })
      ).resolves.not.toThrow();

      await expect(
        UsageEntity.validate({
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.0025,
        })
      ).resolves.not.toThrow();
    });

    it('should validate starshipId and conversationId are not empty', async () => {
      await expect(
        UsageEntity.validate({
          starshipId: '',
          conversationId: 'conversation-789',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.0025,
        })
      ).rejects.toThrow();

      await expect(
        UsageEntity.validate({
          starshipId: 'starship-456',
          conversationId: '',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.0025,
        })
      ).rejects.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        cost: 0.005,
      };

      await expect(UsageEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(UsageEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(UsageEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(UsageEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'usage-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.025,
        model: 'gpt-4-turbo',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete usage data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as UsageEntity;
      expect(entity.promptTokens).toBe(1000);
      expect(entity.completionTokens).toBe(500);
      expect(entity.totalTokens).toBe(1500);
      expect(entity.cost).toBe(0.025);
      expect(entity.model).toBe('gpt-4-turbo');
    });

    it('should handle round-trip with minimal data', async () => {
      const minimalData = {
        id: 'usage-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.0025,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: minimalData, description: 'minimal usage data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as UsageEntity;
      expect(entity.model).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(UsageEntity, null)).toThrow();
      expect(() => fromDatabase(UsageEntity, undefined)).toThrow();
      expect(() => fromDatabase(UsageEntity, 'not an object')).toThrow();
    });

    it('should handle empty array deserialization', async () => {
      const emptyArray: never[] = [];
      const entities = fromDatabaseArray(UsageEntity, emptyArray);

      expect(entities).toHaveLength(0);
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero token counts and costs', async () => {
      const record = {
        id: 'usage-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UsageEntity, record);
      expect(entity.promptTokens).toBe(0);
      expect(entity.completionTokens).toBe(0);
      expect(entity.totalTokens).toBe(0);
      expect(entity.cost).toBe(0);
    });

    it('should handle large token counts', async () => {
      const record = {
        id: 'usage-123',
        starshipId: 'starship-456',
        conversationId: 'conversation-789',
        promptTokens: 100000,
        completionTokens: 50000,
        totalTokens: 150000,
        cost: 2.5,
        model: 'gpt-4',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UsageEntity, record);
      expect(entity.promptTokens).toBe(100000);
      expect(entity.completionTokens).toBe(50000);
      expect(entity.totalTokens).toBe(150000);
      expect(entity.cost).toBe(2.5);
    });

    it('should handle very small costs (fractional cents)', async () => {
      const smallCosts = [0.0001, 0.00001, 0.000001];

      for (const cost of smallCosts) {
        const record = {
          id: 'usage-123',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          cost,
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(UsageEntity, record);
        expect(entity.cost).toBe(cost);
      }
    });

    it('should handle different model names', async () => {
      const models = [
        'gpt-4',
        'gpt-4-turbo',
        'gpt-3.5-turbo',
        'claude-3-opus',
        'claude-3-sonnet',
        'claude-3-haiku',
        'gemini-pro',
        'llama-2-70b',
      ];

      for (const model of models) {
        const record = {
          id: 'usage-123',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.0025,
          model,
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(UsageEntity, record);
        expect(entity.model).toBe(model);
      }
    });

    it('should handle usage records across different conversations', async () => {
      const conversationIds = ['conv-1', 'conv-2', 'conv-3'];

      for (const conversationId of conversationIds) {
        const record = {
          id: `usage-${conversationId}`,
          starshipId: 'starship-456',
          conversationId,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.0025,
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(UsageEntity, record);
        expect(entity.conversationId).toBe(conversationId);
      }
    });

    it('should handle floating-point precision for costs', async () => {
      const costs = [0.001, 0.0025, 0.005, 0.01, 0.1, 1.0, 10.55];

      for (const cost of costs) {
        const record = {
          id: 'usage-123',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost,
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(UsageEntity, record);
        expect(entity.cost).toBe(cost);

        const serialized = toDatabase(entity);
        const deserialized = fromDatabase(UsageEntity, serialized);
        expect(deserialized.cost).toBe(cost);
      }
    });

    it('should handle usage records with different timestamps', async () => {
      const timestamps = ['2024-01-01T00:00:00.000Z', '2024-06-15T12:30:45.123Z', '2024-12-31T23:59:59.999Z'];

      for (const createdAt of timestamps) {
        const record = {
          id: 'usage-123',
          starshipId: 'starship-456',
          conversationId: 'conversation-789',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.0025,
          createdAt,
        };

        const entity = fromDatabase(UsageEntity, record);
        expect(entity.createdAt).toBe(createdAt);
      }
    });
  });
});
