/**
 * EnvironmentEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the EnvironmentEntity class.
 */

import { EnvironmentEntity } from '@/entities/EnvironmentEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('EnvironmentEntity', () => {
  let testHelper: EntityTestHelper<EnvironmentEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(EnvironmentEntity, 'EnvironmentEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const environment = new EnvironmentEntity();
      environment.id = 'env-123';
      environment.starshipId = 'starship-456';
      environment.key = 'API_KEY';
      environment.encryptedValue = 'encrypted_value_here';
      environment.description = 'Test API Key';
      environment.createdAt = '2024-01-01T00:00:00.000Z';
      environment.updatedAt = '2024-01-02T12:00:00.000Z';
      environment.createdBy = 'user-789';

      const serialized = toDatabase(environment);

      expect(serialized).toEqual({
        id: 'env-123',
        starship_id: 'starship-456',
        key: 'API_KEY',
        encrypted_value: 'encrypted_value_here',
        description: 'Test API Key',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T12:00:00.000Z',
        created_by: 'user-789',
      });
    });

    it('should handle optional description field', async () => {
      const environment = new EnvironmentEntity();
      environment.id = 'env-123';
      environment.starshipId = 'starship-456';
      environment.key = 'API_KEY';
      environment.encryptedValue = 'encrypted_value_here';
      environment.createdAt = '2024-01-01T00:00:00.000Z';
      environment.updatedAt = '2024-01-02T12:00:00.000Z';
      environment.createdBy = 'user-789';

      const serialized = toDatabase(environment);

      expect(serialized.description).toBeUndefined();
      expect(serialized.key).toBe('API_KEY');
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'env-123',
        starshipId: 'starship-456',
        key: 'API_KEY',
        encryptedValue: 'encrypted_value_here',
        description: 'Test API Key',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        createdBy: 'user-789',
      };

      const entity = fromDatabase(EnvironmentEntity, databaseRecord);

      expect(entity).toBeInstanceOf(EnvironmentEntity);
      expect(entity.id).toBe('env-123');
      expect(entity.starshipId).toBe('starship-456');
      expect(entity.key).toBe('API_KEY');
      expect(entity.encryptedValue).toBe('encrypted_value_here');
      expect(entity.description).toBe('Test API Key');
      expect(entity.createdBy).toBe('user-789');
    });

    it('should handle missing optional description field', async () => {
      const databaseRecord = {
        id: 'env-123',
        starshipId: 'starship-456',
        key: 'API_KEY',
        encryptedValue: 'encrypted_value_here',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        createdBy: 'user-789',
      };

      const entity = fromDatabase(EnvironmentEntity, databaseRecord);

      expect(entity).toBeInstanceOf(EnvironmentEntity);
      expect(entity.description).toBeUndefined();
      expect(entity.key).toBe('API_KEY');
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'env-1',
          starshipId: 'starship-456',
          key: 'API_KEY_1',
          encryptedValue: 'encrypted_value_1',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
          createdBy: 'user-789',
        },
        {
          id: 'env-2',
          starshipId: 'starship-456',
          key: 'API_KEY_2',
          encryptedValue: 'encrypted_value_2',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
          createdBy: 'user-789',
        },
      ];

      const entities = fromDatabaseArray(EnvironmentEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(EnvironmentEntity);
      expect(entities[1]).toBeInstanceOf(EnvironmentEntity);
      expect(entities[0].key).toBe('API_KEY_1');
      expect(entities[1].key).toBe('API_KEY_2');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        starshipId: 'starship-456',
        key: 'API_KEY',
        encryptedValue: 'encrypted_value_here',
        createdBy: 'user-789',
      };

      await expect(EnvironmentEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        starshipId: 'starship-456',
        // key is missing
        encryptedValue: 'encrypted_value_here',
      };

      await expect(EnvironmentEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate key length constraints', async () => {
      await expect(
        EnvironmentEntity.validate({
          starshipId: 'starship-456',
          key: '',
          encryptedValue: 'encrypted_value_here',
          createdBy: 'user-789',
        })
      ).rejects.toThrow();

      await expect(
        EnvironmentEntity.validate({
          starshipId: 'starship-456',
          key: 'a'.repeat(101),
          encryptedValue: 'encrypted_value_here',
          createdBy: 'user-789',
        })
      ).rejects.toThrow();

      await expect(
        EnvironmentEntity.validate({
          starshipId: 'starship-456',
          key: 'VALID_KEY',
          encryptedValue: 'encrypted_value_here',
          createdBy: 'user-789',
        })
      ).resolves.not.toThrow();
    });

    it('should validate description length constraints', async () => {
      await expect(
        EnvironmentEntity.validate({
          starshipId: 'starship-456',
          key: 'API_KEY',
          encryptedValue: 'encrypted_value_here',
          description: 'a'.repeat(501),
          createdBy: 'user-789',
        })
      ).rejects.toThrow();

      await expect(
        EnvironmentEntity.validate({
          starshipId: 'starship-456',
          key: 'API_KEY',
          encryptedValue: 'encrypted_value_here',
          description: 'Valid description',
          createdBy: 'user-789',
        })
      ).resolves.not.toThrow();
    });

    it('should validate starshipId and createdBy are not empty', async () => {
      await expect(
        EnvironmentEntity.validate({
          starshipId: '',
          key: 'API_KEY',
          encryptedValue: 'encrypted_value_here',
          createdBy: 'user-789',
        })
      ).rejects.toThrow();

      await expect(
        EnvironmentEntity.validate({
          starshipId: 'starship-456',
          key: 'API_KEY',
          encryptedValue: 'encrypted_value_here',
          createdBy: '',
        })
      ).rejects.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        description: 'Updated Description',
      };

      await expect(EnvironmentEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(EnvironmentEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(EnvironmentEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(EnvironmentEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'env-123',
        starshipId: 'starship-456',
        key: 'API_KEY',
        encryptedValue: 'encrypted_value_here',
        description: 'Test API Key for external service',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        createdBy: 'user-789',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete environment data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as EnvironmentEntity;
      expect(entity.key).toBe('API_KEY');
      expect(entity.encryptedValue).toBe('encrypted_value_here');
      expect(entity.description).toBe('Test API Key for external service');
    });

    it('should handle round-trip with minimal data', async () => {
      const minimalData = {
        id: 'env-123',
        starshipId: 'starship-456',
        key: 'API_KEY',
        encryptedValue: 'encrypted_value_here',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        createdBy: 'user-789',
      };

      const results = await testHelper.testRoundTrip([{ data: minimalData, description: 'minimal environment data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as EnvironmentEntity;
      expect(entity.description).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(EnvironmentEntity, null)).toThrow();
      expect(() => fromDatabase(EnvironmentEntity, undefined)).toThrow();
      expect(() => fromDatabase(EnvironmentEntity, 'not an object')).toThrow();
    });

    it('should handle empty array deserialization', async () => {
      const emptyArray: never[] = [];
      const entities = fromDatabaseArray(EnvironmentEntity, emptyArray);

      expect(entities).toHaveLength(0);
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle various key formats', async () => {
      const keyFormats = ['API_KEY', 'OPENAI_API_KEY', 'database-url', 'service.key', 'KEY_123', 'a', 'a'.repeat(100)];

      for (const key of keyFormats) {
        const record = {
          id: 'env-123',
          starshipId: 'starship-456',
          key,
          encryptedValue: 'encrypted_value_here',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
          createdBy: 'user-789',
        };

        const entity = fromDatabase(EnvironmentEntity, record);
        expect(entity.key).toBe(key);
      }
    });

    it('should handle special characters in description', async () => {
      const specialDescriptions = [
        'Description with "quotes"',
        "Description with 'apostrophes'",
        'Description with émojis 🔑',
        'Unicode test: αβγδε',
        'Mixed: English 中文 العربية',
      ];

      for (const description of specialDescriptions) {
        const record = {
          id: 'env-123',
          starshipId: 'starship-456',
          key: 'API_KEY',
          encryptedValue: 'encrypted_value_here',
          description,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
          createdBy: 'user-789',
        };

        const entity = fromDatabase(EnvironmentEntity, record);
        expect(entity.description).toBe(description);

        const serialized = toDatabase(entity);
        const deserialized = fromDatabase(EnvironmentEntity, serialized);
        expect(deserialized.description).toBe(description);
      }
    });

    it('should handle long encrypted values', async () => {
      const longEncryptedValue = 'a'.repeat(1000);
      const record = {
        id: 'env-123',
        starshipId: 'starship-456',
        key: 'API_KEY',
        encryptedValue: longEncryptedValue,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        createdBy: 'user-789',
      };

      const entity = fromDatabase(EnvironmentEntity, record);
      expect(entity.encryptedValue).toBe(longEncryptedValue);
      expect(entity.encryptedValue.length).toBe(1000);
    });
  });
});
