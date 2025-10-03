/**
 * EnvironmentRepository Unit Tests
 */

import 'reflect-metadata';
import { EnvironmentRepository } from '../EnvironmentRepository';
import { EnvironmentEntity } from '@/entities/EnvironmentEntity';
import { DatabaseError } from '@starships/errors';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';
import { createCipheriv, createHash, randomBytes } from 'crypto';

// Deterministic test master key derived from a non-secret seed
const TEST_MASTER_KEY = createHash('sha256').update('unit-test-key').digest('hex');

// Mock nanoid for predictable IDs
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-env-id-123'),
}));

// Mock the database connection
jest.mock('@/helpers/database', () => ({
  getConnection: jest.fn(),
}));

// Mock env config for encryption key
jest.mock('@starships/env', () => ({
  getEnvConfig: jest.fn(() => ({
    ENCRYPTION_KEY: TEST_MASTER_KEY,
  })),
}));

// Mock entity validation
jest.spyOn(EnvironmentEntity, 'validate').mockResolvedValue(undefined);

describe('EnvironmentRepository', () => {
  let repository: EnvironmentRepository;
  let testHelper: RepositoryTestHelper;

  beforeEach(() => {
    testHelper = new RepositoryTestHelper();
    repository = new EnvironmentRepository();
    testHelper.reset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as unknown as { serviceName: string }).serviceName).toBe('EnvironmentRepository');
    });
  });

  describe('findByStarship', () => {
    it('should return environment summaries for a starship', async () => {
      const mockEnvs = [
        {
          id: 'env-1',
          starship_id: 'starship-123',
          key: 'API_KEY',
          encrypted_value: 'encrypted-value-1',
          description: 'API Key',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          created_by: 'user-123',
        },
        {
          id: 'env-2',
          starship_id: 'starship-123',
          key: 'DATABASE_URL',
          encrypted_value: 'encrypted-value-2',
          description: 'Database URL',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          created_by: 'user-123',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockEnvs);

      const result = await repository.findByStarship('starship-123');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM environments WHERE starship_id = $1 ORDER BY key', [
        'starship-123',
      ]);
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('API_KEY');
      expect(result[0].description).toBe('API Key');
      // Summaries should not include encrypted value
      expect(result[0]).not.toHaveProperty('encryptedValue');
    });

    it('should throw error for missing starshipId', async () => {
      await expect(repository.findByStarship('')).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();
      await expect(repository.findByStarship('starship-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findByStarshipAndKey', () => {
    it('should return environment by starship and key', async () => {
      const mockEnv = {
        id: 'env-1',
        starship_id: 'starship-123',
        key: 'API_KEY',
        encrypted_value: 'encrypted-value',
        description: 'API Key',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        created_by: 'user-123',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockEnv);

      const result = await repository.findByStarshipAndKey('starship-123', 'API_KEY');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith('SELECT * FROM environments WHERE starship_id = $1 AND key = $2', [
        'starship-123',
        'API_KEY',
      ]);
      expect(result).not.toBeNull();
      expect(result!.key).toBe('API_KEY');
    });

    it('should return null when not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.findByStarshipAndKey('starship-123', 'NONEXISTENT');

      expect(result).toBeNull();
    });

    it('should throw error for missing parameters', async () => {
      await expect(repository.findByStarshipAndKey('', 'KEY')).rejects.toThrow(DatabaseError);
      await expect(repository.findByStarshipAndKey('starship-123', '')).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    it('should create environment with encrypted value', async () => {
      const createData = {
        starshipId: 'starship-123',
        key: 'API_KEY',
        value: 'secret-api-key',
        description: 'API Key',
        createdBy: 'user-123',
      };

      const mockCreatedEnv = {
        id: 'test-env-id-123',
        starship_id: 'starship-123',
        key: 'API_KEY',
        encrypted_value: 'encrypted-base64-value',
        description: 'API Key',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        created_by: 'user-123',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreatedEnv]);

      const result = await repository.create(createData);

      expect(EnvironmentEntity.validate).toHaveBeenCalled();
      expect(result.id).toBe('test-env-id-123');
      expect(result.key).toBe('API_KEY');
      expect(result.starshipId).toBe('starship-123');
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();

      await expect(
        repository.create({
          starshipId: 'starship-123',
          key: 'API_KEY',
          value: 'secret',
          createdBy: 'user-123',
        })
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should update environment value', async () => {
      const existingEnv = {
        id: 'env-1',
        starship_id: 'starship-123',
        key: 'API_KEY',
        encrypted_value: 'old-encrypted-value',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        created_by: 'user-123',
      };

      const updatedEnv = {
        ...existingEnv,
        encrypted_value: 'new-encrypted-value',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(existingEnv);
      testHelper.mockConnection.query.mockResolvedValue([updatedEnv]);

      const result = await repository.update('env-1', {
        value: 'new-secret-value',
        updatedBy: 'user-123',
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('env-1');
    });

    it('should update description without value', async () => {
      const existingEnv = {
        id: 'env-1',
        starship_id: 'starship-123',
        key: 'API_KEY',
        encrypted_value: 'encrypted-value',
        description: 'Old description',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        created_by: 'user-123',
      };

      const updatedEnv = {
        ...existingEnv,
        description: 'New description',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(existingEnv);
      testHelper.mockConnection.query.mockResolvedValue([updatedEnv]);

      const result = await repository.update('env-1', {
        description: 'New description',
        updatedBy: 'user-123',
      });

      expect(result).not.toBeNull();
    });

    it('should return null when environment not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.update('nonexistent', {
        value: 'new-value',
        updatedBy: 'user-123',
      });

      expect(result).toBeNull();
    });

    it('should throw error for missing id', async () => {
      await expect(
        repository.update('', {
          value: 'new-value',
          updatedBy: 'user-123',
        })
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('delete', () => {
    it('should delete environment successfully', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 1 } as unknown as unknown[]);

      const result = await repository.delete('env-1');

      expect(result).toBe(true);
    });

    it('should return false when environment not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 0 } as unknown as unknown[]);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });

    it('should throw error for missing id', async () => {
      await expect(repository.delete('')).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteByStarshipAndKey', () => {
    it('should delete by starship and key', async () => {
      testHelper.mockConnection.query.mockResolvedValue([{ id: 'env-1' }]);

      const result = await repository.deleteByStarshipAndKey('starship-123', 'API_KEY');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith(
        'DELETE FROM environments WHERE starship_id = $1 AND key = $2 RETURNING id',
        ['starship-123', 'API_KEY']
      );
      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.deleteByStarshipAndKey('starship-123', 'NONEXISTENT');

      expect(result).toBe(false);
    });

    it('should throw error for missing parameters', async () => {
      await expect(repository.deleteByStarshipAndKey('', 'KEY')).rejects.toThrow(DatabaseError);
      await expect(repository.deleteByStarshipAndKey('starship-123', '')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getDecryptedEnvironment', () => {
    it('should return decrypted environment variables as record', async () => {
      // Create a properly encrypted value for testing
      const masterKey = TEST_MASTER_KEY;
      const starshipId = 'starship-123';
      const key = createHash('sha256')
        .update(masterKey + starshipId)
        .digest();
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update('test-value', 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const encryptedValue = Buffer.concat([iv, tag, encrypted]).toString('base64');

      const mockEnvs = [
        {
          id: 'env-1',
          starship_id: 'starship-123',
          key: 'API_KEY',
          encrypted_value: encryptedValue,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          created_by: 'user-123',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockEnvs);

      const result = await repository.getDecryptedEnvironment('starship-123');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM environments WHERE starship_id = $1', ['starship-123']);
      expect(result).toHaveProperty('API_KEY');
      expect(typeof result.API_KEY).toBe('string');
      expect(result.API_KEY).toBe('test-value');
    });

    it('should skip invalid encrypted values', async () => {
      // Create a properly encrypted value for one key
      const masterKey = TEST_MASTER_KEY;
      const starshipId = 'starship-123';
      const key = createHash('sha256')
        .update(masterKey + starshipId)
        .digest();
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update('valid-value', 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const encryptedValue = Buffer.concat([iv, tag, encrypted]).toString('base64');

      const mockEnvs = [
        {
          id: 'env-1',
          starship_id: 'starship-123',
          key: 'VALID_KEY',
          encrypted_value: encryptedValue,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          created_by: 'user-123',
        },
        {
          id: 'env-2',
          starship_id: 'starship-123',
          key: 'INVALID_KEY',
          encrypted_value: 'invalid-base64',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          created_by: 'user-123',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockEnvs);

      // Should not throw, just skip invalid values
      const result = await repository.getDecryptedEnvironment('starship-123');
      expect(result).toHaveProperty('VALID_KEY');
      expect(result.VALID_KEY).toBe('valid-value');
      expect(result).not.toHaveProperty('INVALID_KEY');
    });

    it('should throw error for missing starshipId', async () => {
      await expect(repository.getDecryptedEnvironment('')).rejects.toThrow(DatabaseError);
    });
  });
});
