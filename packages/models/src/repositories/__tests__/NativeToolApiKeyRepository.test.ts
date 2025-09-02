/**
 * NativeToolApiKeyRepository Unit Tests
 */

// Mock dependencies first
jest.mock('../../helpers/database/connection');
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue(Buffer.from('1234567890123456', 'hex')),
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue(Buffer.from('secret-key'))
  }),
  createCipheriv: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue('encrypted-part'),
    final: jest.fn().mockReturnValue('final-part'),
    getAuthTag: jest.fn().mockReturnValue(Buffer.from('auth-tag'))
  }),
  createDecipheriv: jest.fn().mockReturnValue({
    setAuthTag: jest.fn(),
    update: jest.fn().mockReturnValue('decrypted-part'),
    final: jest.fn().mockReturnValue('final-part')
  })
}));

import { NativeToolApiKeyRepository } from '../NativeToolApiKeyRepository';
import { Neo4jConnection, getConnection } from '../../helpers/database';
import { ValidationError, DatabaseError, ConflictError } from '../../helpers/errors';
import crypto from 'crypto';

describe('NativeToolApiKeyRepository', () => {
  let repository: NativeToolApiKeyRepository;
  let mockGetConnection: jest.MockedFunction<any>;
  let mockConnection: jest.Mocked<Neo4jConnection>;

  beforeEach(() => {
    // Clear all mocks first
    jest.clearAllMocks();

    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    } as any;

    // Mock getConnection to return our mock connection
    mockGetConnection = getConnection as jest.MockedFunction<typeof getConnection>;
    mockGetConnection.mockReturnValue(mockConnection);

    repository = new NativeToolApiKeyRepository();
  });

  describe('constructor', () => {
    it('should create repository with proper service name', () => {
      expect(repository).toBeInstanceOf(NativeToolApiKeyRepository);
    });

    it('should initialize encryption secret from environment', () => {
      const originalEnv = process.env.API_KEY_ENCRYPTION_SECRET;
      process.env.API_KEY_ENCRYPTION_SECRET = 'test-secret';

      new NativeToolApiKeyRepository();

      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
      
      process.env.API_KEY_ENCRYPTION_SECRET = originalEnv;
    });

    it('should use default secret when environment variable not set', () => {
      const originalEnv = process.env.API_KEY_ENCRYPTION_SECRET;
      delete process.env.API_KEY_ENCRYPTION_SECRET;

      new NativeToolApiKeyRepository();

      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
      
      process.env.API_KEY_ENCRYPTION_SECRET = originalEnv;
    });
  });

  describe('saveApiKey', () => {
    it('should save API key successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.saveApiKey('starship-123', 'openai', 'sk-test-key');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (k:NativeToolApiKey'),
        expect.objectContaining({
          starshipId: 'starship-123',
          toolName: 'openai',
          encryptedApiKey: expect.any(String)
        })
      );
    });

    it('should validate required parameters', async () => {
      await expect(repository.saveApiKey('', 'openai', 'key')).rejects.toThrow(ValidationError);
      await expect(repository.saveApiKey('starship-123', '', 'key')).rejects.toThrow(ValidationError);
      await expect(repository.saveApiKey('starship-123', 'openai', '')).rejects.toThrow(ValidationError);
    });

    it('should encrypt API key before saving', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.saveApiKey('starship-123', 'openai', 'sk-test-key');

      expect(crypto.randomBytes).toHaveBeenCalledWith(16);
      expect(crypto.createCipheriv).toHaveBeenCalledWith('aes-256-gcm', expect.any(Buffer), expect.any(Buffer));
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.saveApiKey('starship-123', 'openai', 'key')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getApiKey', () => {
    it('should retrieve and decrypt API key', async () => {
      const encryptedKey = '1234567890123456:auth-tag:encrypted-data';
      mockConnection.executeQuery.mockResolvedValue([{ encryptedApiKey: encryptedKey }]);

      const result = await repository.getApiKey('starship-123', 'openai');

      expect(result).toBe('decrypted-partfinal-part');
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (k:NativeToolApiKey'),
        { starshipId: 'starship-123', toolName: 'openai' }
      );
      expect(crypto.createDecipheriv).toHaveBeenCalled();
    });

    it('should return null when API key not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getApiKey('starship-123', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should validate required parameters', async () => {
      await expect(repository.getApiKey('', 'openai')).rejects.toThrow(ValidationError);
      await expect(repository.getApiKey('starship-123', '')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getApiKey('starship-123', 'openai')).rejects.toThrow(DatabaseError);
    });

    it('should handle decryption errors', async () => {
      const invalidEncryptedKey = 'invalid-format';
      mockConnection.executeQuery.mockResolvedValue([{ encryptedApiKey: invalidEncryptedKey }]);
      
      const mockDecipher = {
        setAuthTag: jest.fn(),
        update: jest.fn().mockImplementation(() => { throw new Error('Invalid encrypted data'); }),
        final: jest.fn()
      };
      (crypto.createDecipheriv as jest.Mock).mockReturnValue(mockDecipher);

      await expect(repository.getApiKey('starship-123', 'openai')).rejects.toThrow(DatabaseError);

      // Reset crypto mock after this test
      (crypto.createDecipheriv as jest.Mock).mockReturnValue({
        setAuthTag: jest.fn(),
        update: jest.fn().mockReturnValue('decrypted-part'),
        final: jest.fn().mockReturnValue('final-part')
      });
    });
  });

  describe('getAllApiKeys', () => {

    it('should retrieve all API keys for starship', async () => {
      const mockResults = [
        { toolName: 'openai', encryptedApiKey: '1234:auth:encrypted1' },
        { toolName: 'anthropic', encryptedApiKey: '5678:auth:encrypted2' }
      ];
      mockConnection.executeQuery.mockResolvedValue(mockResults);

      const result = await repository.getAllApiKeys('starship-123');

      expect(result).toEqual({
        openai: 'decrypted-partfinal-part',
        anthropic: 'decrypted-partfinal-part'
      });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (k:NativeToolApiKey {starshipId: $starshipId})'),
        { starshipId: 'starship-123' }
      );
    });

    it('should return empty object when no API keys found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getAllApiKeys('starship-123');

      expect(result).toEqual({});
    });

    it('should skip entries with null encrypted keys', async () => {
      const mockResults = [
        { toolName: 'openai', encryptedApiKey: '1234:auth:encrypted1' },
        { toolName: 'anthropic', encryptedApiKey: null }
      ];
      mockConnection.executeQuery.mockResolvedValue(mockResults);

      const result = await repository.getAllApiKeys('starship-123');

      expect(result).toEqual({
        openai: 'decrypted-partfinal-part'
      });
    });

    it('should validate starshipId parameter', async () => {
      await expect(repository.getAllApiKeys('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getAllApiKeys('starship-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteApiKey', () => {
    it('should delete API key successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.deleteApiKey('starship-123', 'openai');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DELETE k'),
        { starshipId: 'starship-123', toolName: 'openai' }
      );
    });

    it('should validate required parameters', async () => {
      await expect(repository.deleteApiKey('', 'openai')).rejects.toThrow(ValidationError);
      await expect(repository.deleteApiKey('starship-123', '')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.deleteApiKey('starship-123', 'openai')).rejects.toThrow(DatabaseError);
    });
  });

  describe('hasApiKey', () => {
    it('should return true when API key exists', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ hasKey: true }]);

      const result = await repository.hasApiKey('starship-123', 'openai');

      expect(result).toBe(true);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('count(k) > 0 as hasKey'),
        { starshipId: 'starship-123', toolName: 'openai' }
      );
    });

    it('should return false when API key does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.hasApiKey('starship-123', 'nonexistent');

      expect(result).toBe(false);
    });

    it('should return false when result is undefined', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ hasKey: undefined }]);

      const result = await repository.hasApiKey('starship-123', 'openai');

      expect(result).toBe(false);
    });

    it('should validate required parameters', async () => {
      await expect(repository.hasApiKey('', 'openai')).rejects.toThrow(ValidationError);
      await expect(repository.hasApiKey('starship-123', '')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.hasApiKey('starship-123', 'openai')).rejects.toThrow(DatabaseError);
    });
  });

  describe('encryption/decryption methods', () => {
    it('should encrypt and decrypt consistently', () => {
      // Test with mocked crypto to ensure consistent behavior
      const originalKey = 'sk-test-api-key-12345';
      
      // Reset crypto mocks to default behavior for this test
      (crypto.createCipheriv as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnValue('encrypted-part'),
        final: jest.fn().mockReturnValue('final-part'),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('auth-tag'))
      });
      
      (crypto.createDecipheriv as jest.Mock).mockReturnValue({
        setAuthTag: jest.fn(),
        update: jest.fn().mockReturnValue('decrypted-part'),
        final: jest.fn().mockReturnValue('final-part')
      });
      
      // Access private methods via any casting
      const encrypted = (repository as any).encrypt(originalKey);
      const decrypted = (repository as any).decrypt(encrypted);
      
      expect(decrypted).toBe('decrypted-partfinal-part'); // This matches our mock return value
      expect(encrypted).toBe('1234567890123456:617574682d746167:encrypted-partfinal-part'); // 'auth-tag' in hex
    });

    it('should handle encryption errors', async () => {
      const mockCipher = {
        update: jest.fn().mockImplementation(() => { throw new Error('Encryption failed'); }),
        final: jest.fn(),
        getAuthTag: jest.fn()
      };
      (crypto.createCipheriv as jest.Mock).mockReturnValue(mockCipher);

      await expect(repository.saveApiKey('starship-123', 'openai', 'key')).rejects.toThrow(DatabaseError);

      // Reset crypto mock after this test
      (crypto.createCipheriv as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnValue('encrypted-part'),
        final: jest.fn().mockReturnValue('final-part'),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('auth-tag'))
      });
    });

    it('should handle decryption errors with malformed data', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ encryptedApiKey: 'malformed-data' }]);

      await expect(repository.getApiKey('starship-123', 'openai')).rejects.toThrow(DatabaseError);
    });
  });

  describe('integration scenarios', () => {

    it('should handle complete workflow: save -> get -> check -> delete', async () => {
      const starshipId = 'starship-123';
      const toolName = 'openai';
      const apiKey = 'sk-test-key';

      // Save
      mockConnection.executeWrite.mockResolvedValue([]);
      await repository.saveApiKey(starshipId, toolName, apiKey);

      // Check exists
      mockConnection.executeQuery.mockResolvedValue([{ hasKey: true }]);
      const exists = await repository.hasApiKey(starshipId, toolName);
      expect(exists).toBe(true);

      // Get
      mockConnection.executeQuery.mockResolvedValue([{ encryptedApiKey: 'mock:encrypted:data' }]);
      const retrieved = await repository.getApiKey(starshipId, toolName);
      expect(retrieved).toBe('decrypted-partfinal-part');

      // Delete
      mockConnection.executeWrite.mockResolvedValue([]);
      await repository.deleteApiKey(starshipId, toolName);

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2); // Save and delete
    });

    it('should handle multiple API keys for same starship', async () => {
      const mockResults = [
        { toolName: 'openai', encryptedApiKey: '1234:auth:encrypted1' },
        { toolName: 'anthropic', encryptedApiKey: '5678:auth:encrypted2' },
        { toolName: 'google', encryptedApiKey: '9abc:auth:encrypted3' }
      ];
      mockConnection.executeQuery.mockResolvedValue(mockResults);

      const result = await repository.getAllApiKeys('starship-123');

      expect(Object.keys(result)).toHaveLength(3);
      expect(result).toHaveProperty('openai');
      expect(result).toHaveProperty('anthropic');
      expect(result).toHaveProperty('google');
      expect(result.openai).toBe('decrypted-partfinal-part');
      expect(result.anthropic).toBe('decrypted-partfinal-part');
      expect(result.google).toBe('decrypted-partfinal-part');
    });

    it('should handle overwriting existing API key', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      // Save initial key
      await repository.saveApiKey('starship-123', 'openai', 'old-key');
      
      // Overwrite with new key
      await repository.saveApiKey('starship-123', 'openai', 'new-key');

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2);
      expect(mockConnection.executeWrite).toHaveBeenNthCalledWith(2,
        expect.stringContaining('MERGE'),
        expect.objectContaining({
          starshipId: 'starship-123',
          toolName: 'openai'
        })
      );
    });
  });

  describe('error handling scenarios', () => {
    it('should handle constraint violations', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('constraint violation'));

      await expect(repository.saveApiKey('starship-123', 'openai', 'key')).rejects.toThrow(ConflictError);
    });

    it('should handle connection timeouts', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('connection timeout'));

      await expect(repository.getApiKey('starship-123', 'openai')).rejects.toThrow(DatabaseError);
    });

    it('should handle query syntax errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('syntax error in query'));

      await expect(repository.getAllApiKeys('starship-123')).rejects.toThrow(DatabaseError);
    });

    it('should handle network errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('network error'));

      await expect(repository.deleteApiKey('starship-123', 'openai')).rejects.toThrow(DatabaseError);
    });
  });

  describe('edge cases', () => {

    it('should handle special characters in tool names', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.saveApiKey('starship-123', 'custom-tool-v2.1', 'key');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          toolName: 'custom-tool-v2.1'
        })
      );
    });

    it('should handle very long API keys', async () => {
      const longApiKey = 'sk-' + 'x'.repeat(200);
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.saveApiKey('starship-123', 'openai', longApiKey);

      expect(crypto.createCipheriv).toHaveBeenCalled();
    });

    it('should handle empty encrypted key in getAllApiKeys', async () => {
      const mockResults = [
        { toolName: 'openai', encryptedApiKey: 'valid:encrypted:data' },
        { toolName: 'empty', encryptedApiKey: '' },
        { toolName: 'null', encryptedApiKey: null }
      ];
      mockConnection.executeQuery.mockResolvedValue(mockResults);

      const result = await repository.getAllApiKeys('starship-123');

      expect(result).toEqual({
        openai: 'decrypted-partfinal-part'
      });
    });

    it('should handle starship with no API keys', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const hasKey = await repository.hasApiKey('empty-starship', 'openai');
      const allKeys = await repository.getAllApiKeys('empty-starship');

      expect(hasKey).toBe(false);
      expect(allKeys).toEqual({});
    });
  });

  describe('security considerations', () => {

    it('should use different IVs for each encryption', async () => {
      const mockRandomBytes = crypto.randomBytes as jest.Mock;
      mockRandomBytes
        .mockReturnValueOnce(Buffer.from('1111111111111111', 'hex'))
        .mockReturnValueOnce(Buffer.from('2222222222222222', 'hex'));

      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.saveApiKey('starship-123', 'tool1', 'key1');
      await repository.saveApiKey('starship-123', 'tool2', 'key2');

      expect(mockRandomBytes).toHaveBeenCalledTimes(2);
    });

    it('should handle authentication tag validation', async () => {
      const mockDecipher = {
        setAuthTag: jest.fn().mockImplementation(() => { throw new Error('Invalid auth tag'); }),
        update: jest.fn(),
        final: jest.fn()
      };
      (crypto.createDecipheriv as jest.Mock).mockReturnValue(mockDecipher);

      mockConnection.executeQuery.mockResolvedValue([{ encryptedApiKey: 'iv:tag:data' }]);

      await expect(repository.getApiKey('starship-123', 'openai')).rejects.toThrow(DatabaseError);

      // Reset crypto mock after this test
      (crypto.createDecipheriv as jest.Mock).mockReturnValue({
        setAuthTag: jest.fn(),
        update: jest.fn().mockReturnValue('decrypted-part'),
        final: jest.fn().mockReturnValue('final-part')
      });
    });
  });
});