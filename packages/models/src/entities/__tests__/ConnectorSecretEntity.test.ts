/**
 * ConnectorSecretEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the ConnectorSecretEntity class.
 */

import { ConnectorSecretEntity } from '@/entities/ConnectorSecretEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('ConnectorSecretEntity', () => {
  let testHelper: EntityTestHelper<ConnectorSecretEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(ConnectorSecretEntity, 'ConnectorSecretEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const secret = new ConnectorSecretEntity();
      secret.id = 'secret-123';
      secret.starshipId = 'starship-456';
      secret.key = 'API_KEY';
      secret.encryptedValue = 'encrypted_value_here';
      secret.description = 'Test API Key';
      secret.createdAt = '2024-01-01T00:00:00.000Z';
      secret.updatedAt = '2024-01-02T12:00:00.000Z';
      secret.createdBy = 'user-789';

      const serialized = toDatabase(secret);

      expect(serialized).toEqual({
        id: 'secret-123',
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
      const secret = new ConnectorSecretEntity();
      secret.id = 'secret-123';
      secret.starshipId = 'starship-456';
      secret.key = 'API_KEY';
      secret.encryptedValue = 'encrypted_value_here';
      secret.createdAt = '2024-01-01T00:00:00.000Z';
      secret.updatedAt = '2024-01-02T12:00:00.000Z';
      secret.createdBy = 'user-789';

      const serialized = toDatabase(secret);

      expect(serialized.description).toBeUndefined();
      expect(serialized.key).toBe('API_KEY');
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'secret-123',
        starshipId: 'starship-456',
        key: 'API_KEY',
        encryptedValue: 'encrypted_value_here',
        description: 'Test API Key',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        createdBy: 'user-789',
      };

      const entity = fromDatabase(ConnectorSecretEntity, databaseRecord);

      expect(entity).toBeInstanceOf(ConnectorSecretEntity);
      expect(entity.id).toBe('secret-123');
      expect(entity.starshipId).toBe('starship-456');
      expect(entity.key).toBe('API_KEY');
      expect(entity.encryptedValue).toBe('encrypted_value_here');
      expect(entity.description).toBe('Test API Key');
      expect(entity.createdBy).toBe('user-789');
    });

    it('should handle missing optional description field', async () => {
      const databaseRecord = {
        id: 'secret-123',
        starshipId: 'starship-456',
        key: 'API_KEY',
        encryptedValue: 'encrypted_value_here',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        createdBy: 'user-789',
      };

      const entity = fromDatabase(ConnectorSecretEntity, databaseRecord);

      expect(entity).toBeInstanceOf(ConnectorSecretEntity);
      expect(entity.description).toBeUndefined();
      expect(entity.key).toBe('API_KEY');
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'secret-1',
          starshipId: 'starship-456',
          key: 'API_KEY_1',
          encryptedValue: 'encrypted_value_1',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
          createdBy: 'user-789',
        },
        {
          id: 'secret-2',
          starshipId: 'starship-456',
          key: 'API_KEY_2',
          encryptedValue: 'encrypted_value_2',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
          createdBy: 'user-789',
        },
      ];

      const entities = fromDatabaseArray(ConnectorSecretEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(ConnectorSecretEntity);
      expect(entities[1]).toBeInstanceOf(ConnectorSecretEntity);
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

      await expect(ConnectorSecretEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        starshipId: 'starship-456',
        // key is missing
        encryptedValue: 'encrypted_value_here',
      };

      await expect(ConnectorSecretEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        description: 'Updated Description',
      };

      await expect(ConnectorSecretEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(ConnectorSecretEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(ConnectorSecretEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(ConnectorSecretEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'secret-123',
        starshipId: 'starship-456',
        key: 'API_KEY',
        encryptedValue: 'encrypted_value_here',
        description: 'Test API Key for external service',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        createdBy: 'user-789',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete connector secret data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as ConnectorSecretEntity;
      expect(entity.key).toBe('API_KEY');
      expect(entity.encryptedValue).toBe('encrypted_value_here');
      expect(entity.description).toBe('Test API Key for external service');
    });

    it('should handle round-trip with minimal data', async () => {
      const minimalData = {
        id: 'secret-123',
        starshipId: 'starship-456',
        key: 'API_KEY',
        encryptedValue: 'encrypted_value_here',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        createdBy: 'user-789',
      };

      const results = await testHelper.testRoundTrip([{ data: minimalData, description: 'minimal connector secret data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as ConnectorSecretEntity;
      expect(entity.description).toBeUndefined();
    });
  });
});
