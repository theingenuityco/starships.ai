/**
 * ConnectorSecretRepository Unit Tests
 */

import 'reflect-metadata';
import { ConnectorSecretRepository } from '../ConnectorSecretRepository';
import { ConnectorSecretEntity } from '@/entities/ConnectorSecretEntity';
import { DatabaseError } from '@starships/errors';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';
import { createCipheriv, createHash, randomBytes } from 'crypto';

// Deterministic test master key derived from a non-secret seed
const TEST_MASTER_KEY = createHash('sha256').update('unit-test-key').digest('hex');

// Mock nanoid for predictable IDs
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-secret-id-123'),
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
jest.spyOn(ConnectorSecretEntity, 'validate').mockResolvedValue(undefined);

describe('ConnectorSecretRepository', () => {
  let repository: ConnectorSecretRepository;
  let testHelper: RepositoryTestHelper;

  beforeEach(() => {
    testHelper = new RepositoryTestHelper();
    repository = new ConnectorSecretRepository();
    testHelper.reset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as unknown as { serviceName: string }).serviceName).toBe('ConnectorSecretRepository');
    });
  });

  describe('findByStarship', () => {
    it('should return connector secret summaries for a starship', async () => {
      const mockSecrets = [
        {
          id: 'secret-1',
          starship_id: 'starship-123',
          key: 'API_KEY',
          encrypted_value: 'encrypted-value-1',
          description: 'API Key',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          created_by: 'user-123',
        },
        {
          id: 'secret-2',
          starship_id: 'starship-123',
          key: 'DATABASE_URL',
          encrypted_value: 'encrypted-value-2',
          description: 'Database URL',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          created_by: 'user-123',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockSecrets);

      const result = await repository.findByStarship('starship-123');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM connector_secrets WHERE starship_id = $1 ORDER BY key', [
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
    it('should return connector secret by starship and key', async () => {
      const mockSecret = {
        id: 'secret-1',
        starship_id: 'starship-123',
        key: 'API_KEY',
        encrypted_value: 'encrypted-value',
        description: 'API Key',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        created_by: 'user-123',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockSecret);

      const result = await repository.findByStarshipAndKey('starship-123', 'API_KEY');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith(
        'SELECT * FROM connector_secrets WHERE starship_id = $1 AND key = $2',
        ['starship-123', 'API_KEY']
      );
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
    it('should create connector secret with encrypted value', async () => {
      const createData = {
        starshipId: 'starship-123',
        key: 'API_KEY',
        value: 'secret-api-key',
        description: 'API Key',
        createdBy: 'user-123',
      };

      const mockCreated = {
        id: 'test-secret-id-123',
        starship_id: 'starship-123',
        key: 'API_KEY',
        encrypted_value: 'encrypted-base64-value',
        description: 'API Key',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        created_by: 'user-123',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreated]);

      const result = await repository.create(createData);

      expect(ConnectorSecretEntity.validate).toHaveBeenCalled();
      expect(result.id).toBe('test-secret-id-123');
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

  describe('getDecryptedSecrets', () => {
    it('should return decrypted connector secrets as record', async () => {
      // Create a properly encrypted value for testing
      const masterKey = TEST_MASTER_KEY;
      const starshipId = 'starship-123';
      const derivedKey = createHash('sha256')
        .update(masterKey + starshipId)
        .digest();
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
      const encrypted = Buffer.concat([cipher.update('test-value', 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const encryptedValue = Buffer.concat([iv, tag, encrypted]).toString('base64');

      const mockSecrets = [
        {
          id: 'secret-1',
          starship_id: 'starship-123',
          key: 'API_KEY',
          encrypted_value: encryptedValue,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          created_by: 'user-123',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockSecrets);

      const result = await repository.getDecryptedSecrets('starship-123');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM connector_secrets WHERE starship_id = $1', [
        'starship-123',
      ]);
      expect(result).toHaveProperty('API_KEY');
      expect(typeof result.API_KEY).toBe('string');
      expect(result.API_KEY).toBe('test-value');
    });

    it('should throw error for missing starshipId', async () => {
      await expect(repository.getDecryptedSecrets('')).rejects.toThrow(DatabaseError);
    });
  });
});
