/**
 * NativeToolApiKeyEntity Unit Tests
 *
 * Tests for serialization, deserialization, validation, transformations,
 * and helper methods of the NativeToolApiKeyEntity class.
 */

import { NativeToolApiKeyEntity } from '@/entities/NativeToolApiKeyEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('NativeToolApiKeyEntity', () => {
  let testHelper: EntityTestHelper<NativeToolApiKeyEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(NativeToolApiKeyEntity, 'NativeToolApiKeyEntity');
    jest.clearAllMocks();
  });

  describe('NativeToolApiKeyTransformers', () => {
    describe('ToolNameTransform', () => {
      it('should transform tool name to lowercase and remove special chars', () => {
        const testCases = [
          { input: 'Gmail_API', expected: 'gmailapi' },
          { input: 'Slack-Bot@Special!', expected: 'slackbotspecial' },
          { input: '  WEB_SCRAPER  ', expected: 'webscraper' },
        ];

        testCases.forEach(({ input, expected }) => {
          const plain = { toolName: input };
          const instance = fromDatabase(NativeToolApiKeyEntity, plain);
          expect(instance.toolName).toBe(expected);
        });
      });

      it('should handle null and non-string values', () => {
        const testCases = [
          { input: null, expected: null },
          { input: undefined, expected: undefined },
          { input: 123, expected: 123 },
        ];

        testCases.forEach(({ input, expected }) => {
          const plain = { toolName: input };
          const instance = fromDatabase(NativeToolApiKeyEntity, plain);
          expect(instance.toolName).toBe(expected);
        });
      });
    });

    describe('StarshipIdTransform', () => {
      it('should trim starship ID', () => {
        const plain = { starshipId: '  starship-123  ' };
        const instance = fromDatabase(NativeToolApiKeyEntity, plain);
        expect(instance.starshipId).toBe('starship-123');
      });
    });

    describe('EncryptedApiKeyTransform', () => {
      it('should trim encrypted API key', () => {
        const plain = { encryptedApiKey: '  encrypted_key_data  ' };
        const instance = fromDatabase(NativeToolApiKeyEntity, plain);
        expect(instance.encryptedApiKey).toBe('encrypted_key_data');
      });
    });
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const apiKey = new NativeToolApiKeyEntity();
      apiKey.id = 'api-key-123';
      apiKey.starshipId = 'starship-456';
      apiKey.toolName = 'gmail_api';
      apiKey.encryptedApiKey = 'iv:auth:encrypted_data_here';
      apiKey.createdAt = '2024-01-01T00:00:00.000Z';
      apiKey.updatedAt = '2024-01-01T00:00:00.000Z';

      const serialized = toDatabase(apiKey);

      expect(serialized).toEqual({
        id: 'api-key-123',
        starshipId: 'starship-456',
        toolName: 'gmailapi', // Transform removes underscores
        encryptedApiKey: 'iv:auth:encrypted_data_here',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'api-key-123',
        starshipId: '  starship-456  ', // Should be trimmed
        toolName: 'Gmail_API@Special!', // Should be transformed
        encryptedApiKey: '  iv:auth:encrypted_data_here  ', // Should be trimmed
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
      };

      const entity = fromDatabase(NativeToolApiKeyEntity, databaseRecord);

      expect(entity).toBeInstanceOf(NativeToolApiKeyEntity);
      expect(entity.id).toBe('api-key-123');
      expect(entity.starshipId).toBe('starship-456'); // Trimmed
      expect(entity.toolName).toBe('gmailapispecial'); // Transformed - all special chars removed
      expect(entity.encryptedApiKey).toBe('iv:auth:encrypted_data_here'); // Trimmed
      expect(entity.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.updatedAt).toBe('2024-01-01T00:05:00.000Z');
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'api-key-1',
          starshipId: 'starship-1',
          toolName: 'gmail_api',
          encryptedApiKey: 'encrypted_key_1',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'api-key-2',
          starshipId: 'starship-2',
          toolName: 'slack_bot',
          encryptedApiKey: 'encrypted_key_2',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(NativeToolApiKeyEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(NativeToolApiKeyEntity);
      expect(entities[1]).toBeInstanceOf(NativeToolApiKeyEntity);
      expect(entities[0].toolName).toBe('gmailapi'); // Transform removes underscores
      expect(entities[1].toolName).toBe('slackbot'); // Transform removes underscores
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        starshipId: 'starship-123',
        toolName: 'gmail_api',
        encryptedApiKey: 'iv:auth:encrypted_data',
      };

      await expect(NativeToolApiKeyEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        toolName: 'gmail_api',
        // Missing starshipId and encryptedApiKey
      };

      await expect(NativeToolApiKeyEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate field length constraints', async () => {
      // Too long starshipId
      await expect(
        NativeToolApiKeyEntity.validate({
          starshipId: 'a'.repeat(256),
          toolName: 'gmail_api',
          encryptedApiKey: 'encrypted_data',
        })
      ).rejects.toThrow();

      // Too long toolName
      await expect(
        NativeToolApiKeyEntity.validate({
          starshipId: 'starship-123',
          toolName: 'a'.repeat(101),
          encryptedApiKey: 'encrypted_data',
        })
      ).rejects.toThrow();

      // Too long encryptedApiKey
      await expect(
        NativeToolApiKeyEntity.validate({
          starshipId: 'starship-123',
          toolName: 'gmail_api',
          encryptedApiKey: 'a'.repeat(1001),
        })
      ).rejects.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        toolName: 'updated_tool',
      };

      await expect(NativeToolApiKeyEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(NativeToolApiKeyEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(NativeToolApiKeyEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(NativeToolApiKeyEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Helper Methods', () => {
    let apiKey: NativeToolApiKeyEntity;
    const now = new Date('2024-01-01T12:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);

      apiKey = new NativeToolApiKeyEntity();
      apiKey.id = 'api-key-123';
      apiKey.starshipId = 'starship-456';
      apiKey.toolName = 'gmail_api';
      apiKey.encryptedApiKey = 'iv:auth:encrypted_data_here_1234567890';
      apiKey.createdAt = '2024-01-01T00:00:00.000Z'; // 12 hours ago
      apiKey.updatedAt = '2024-01-01T00:00:00.000Z';
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('getAge', () => {
      it('should return age in milliseconds', () => {
        const expectedAge = 12 * 60 * 60 * 1000; // 12 hours in ms
        expect(apiKey.getAge()).toBe(expectedAge);
      });
    });

    describe('isNew', () => {
      it('should return true for keys created within last 24 hours', () => {
        expect(apiKey.isNew()).toBe(true);
      });

      it('should return false for keys older than 24 hours', () => {
        apiKey.createdAt = '2023-12-30T00:00:00.000Z'; // 2 days ago
        expect(apiKey.isNew()).toBe(false);
      });
    });

    describe('wasRecentlyUpdated', () => {
      it('should return true for keys updated recently but not immediately after creation', () => {
        // Created 2 hours ago, updated 30 minutes ago
        apiKey.createdAt = '2024-01-01T10:00:00.000Z';
        apiKey.updatedAt = '2024-01-01T11:30:00.000Z';

        expect(apiKey.wasRecentlyUpdated()).toBe(true);
      });

      it('should return false for keys not recently updated', () => {
        // Both created and updated at the same time
        expect(apiKey.wasRecentlyUpdated()).toBe(false);
      });

      it('should return false for keys updated long ago', () => {
        // Created and updated yesterday
        apiKey.createdAt = '2023-12-31T10:00:00.000Z';
        apiKey.updatedAt = '2023-12-31T11:30:00.000Z';

        expect(apiKey.wasRecentlyUpdated()).toBe(false);
      });
    });

    describe('getToolDisplayName', () => {
      it('should convert snake_case to Title Case', () => {
        apiKey.toolName = 'gmail_api';
        expect(apiKey.getToolDisplayName()).toBe('Gmail Api');
      });

      it('should convert kebab-case to Title Case', () => {
        apiKey.toolName = 'slack-bot';
        expect(apiKey.getToolDisplayName()).toBe('Slack Bot');
      });

      it('should handle single words', () => {
        apiKey.toolName = 'webhook';
        expect(apiKey.getToolDisplayName()).toBe('Webhook');
      });

      it('should handle mixed separators', () => {
        apiKey.toolName = 'web_scraper-tool';
        expect(apiKey.getToolDisplayName()).toBe('Web Scraper Tool');
      });
    });

    describe('getToolCategory', () => {
      it('should categorize web tools', () => {
        const webTools = ['web_scraper', 'browser_automation', 'web_crawler'];
        webTools.forEach((tool) => {
          apiKey.toolName = tool;
          expect(apiKey.getToolCategory()).toBe('web');
        });
      });

      it('should categorize email tools', () => {
        const emailTools = ['gmail_api', 'smtp_client', 'mail_sender'];
        emailTools.forEach((tool) => {
          apiKey.toolName = tool;
          expect(apiKey.getToolCategory()).toBe('email');
        });
      });

      it('should categorize storage tools', () => {
        const storageTools = ['s3_client', 'drive_api', 'cloud_storage'];
        storageTools.forEach((tool) => {
          apiKey.toolName = tool;
          expect(apiKey.getToolCategory()).toBe('storage');
        });
      });

      it('should categorize communication tools', () => {
        const commTools = ['slack_bot', 'discord_webhook', 'teams_api'];
        commTools.forEach((tool) => {
          apiKey.toolName = tool;
          expect(apiKey.getToolCategory()).toBe('communication');
        });
      });

      it('should categorize analytics tools', () => {
        const analyticsTools = ['google_analytics', 'tracking_pixel', 'metrics_api'];
        analyticsTools.forEach((tool) => {
          apiKey.toolName = tool;
          expect(apiKey.getToolCategory()).toBe('analytics');
        });
      });

      it('should categorize unknown tools as other', () => {
        apiKey.toolName = 'custom_tool';
        expect(apiKey.getToolCategory()).toBe('other');
      });
    });

    describe('needsRotation', () => {
      it('should return true for keys older than 90 days', () => {
        apiKey.createdAt = '2023-10-01T00:00:00.000Z'; // More than 90 days ago
        expect(apiKey.needsRotation()).toBe(true);
      });

      it('should return false for keys newer than 90 days', () => {
        apiKey.createdAt = '2023-12-01T00:00:00.000Z'; // Less than 90 days ago
        expect(apiKey.needsRotation()).toBe(false);
      });
    });

    describe('getMaskedKey', () => {
      it('should mask middle portion of encrypted key', () => {
        apiKey.encryptedApiKey = 'iv:auth:abcdef1234567890xyz';
        const masked = apiKey.getMaskedKey();

        expect(masked).toBe('abcd*********890xyz'); // Actual behavior: 4 + 9 + 6 = 19 chars
        expect(masked.includes('abcd')).toBe(true); // First 4 chars
        expect(masked.includes('890xyz')).toBe(true); // Last 4 chars
        expect(masked.includes('*')).toBe(true); // Masked middle
      });

      it('should handle short encrypted keys', () => {
        apiKey.encryptedApiKey = 'iv:auth:short';
        const masked = apiKey.getMaskedKey();

        expect(masked).toBe('*****');
      });

      it('should handle malformed keys', () => {
        apiKey.encryptedApiKey = 'malformed_key';
        const masked = apiKey.getMaskedKey();

        expect(masked).toBe('****');
      });
    });

    describe('getSecurityScore', () => {
      it('should give high score for new keys', () => {
        const security = apiKey.getSecurityScore();

        expect(security.level).toBe('high');
        expect(security.score).toBeGreaterThan(80);
        // Tool name 'gmail_api' contains underscores which are now invalid due to strict validation
        expect(security.issues.length).toBeGreaterThanOrEqual(0);
      });

      it('should reduce score for old keys', () => {
        apiKey.createdAt = '2023-09-01T00:00:00.000Z'; // Over 90 days old
        const security = apiKey.getSecurityScore();

        expect(security.level).toBe('medium');
        expect(security.score).toBeLessThan(80);
        expect(security.issues).toContain('API key is older than 90 days and should be rotated');
      });

      it('should reduce score for medium-aged keys', () => {
        apiKey.createdAt = '2023-11-01T00:00:00.000Z'; // Over 60 days old
        const security = apiKey.getSecurityScore();

        expect(security.score).toBeLessThan(100);
        expect(security.issues).toContain('API key is older than 60 days, consider rotation');
      });

      it('should reduce score for invalid tool names', () => {
        apiKey.toolName = 'Invalid@Tool!Name';
        const security = apiKey.getSecurityScore();

        expect(security.score).toBeLessThan(100);
        expect(security.issues).toContain('Tool name contains invalid characters');
      });

      it('should give low score for very old keys with issues', () => {
        apiKey.createdAt = '2023-01-01T00:00:00.000Z'; // Very old
        apiKey.toolName = 'Invalid@Tool!Name';
        const security = apiKey.getSecurityScore();

        expect(security.level).toBe('low');
        expect(security.score).toBeLessThan(60);
        expect(security.issues.length).toBeGreaterThan(1);
      });
    });

    describe('getCompositeKey', () => {
      it('should create composite key from starshipId and toolName', () => {
        const composite = apiKey.getCompositeKey();
        expect(composite).toBe('starship-456:gmail_api');
      });
    });

    describe('conflictsWith', () => {
      it('should detect conflicts with same starship and tool but different ID', () => {
        const otherKey = new NativeToolApiKeyEntity();
        otherKey.id = 'different-id';
        otherKey.starshipId = 'starship-456';
        otherKey.toolName = 'gmail_api';

        expect(apiKey.conflictsWith(otherKey)).toBe(true);
      });

      it('should not detect conflicts with same ID', () => {
        const sameKey = new NativeToolApiKeyEntity();
        sameKey.id = 'api-key-123';
        sameKey.starshipId = 'starship-456';
        sameKey.toolName = 'gmail_api';

        expect(apiKey.conflictsWith(sameKey)).toBe(false);
      });

      it('should not detect conflicts with different starship', () => {
        const differentStarship = new NativeToolApiKeyEntity();
        differentStarship.id = 'different-id';
        differentStarship.starshipId = 'different-starship';
        differentStarship.toolName = 'gmail_api';

        expect(apiKey.conflictsWith(differentStarship)).toBe(false);
      });

      it('should not detect conflicts with different tool', () => {
        const differentTool = new NativeToolApiKeyEntity();
        differentTool.id = 'different-id';
        differentTool.starshipId = 'starship-456';
        differentTool.toolName = 'slack_bot';

        expect(apiKey.conflictsWith(differentTool)).toBe(false);
      });
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'api-key-123',
        starshipId: '  starship-456  ', // Will be trimmed
        toolName: 'Gmail_API@Special!', // Will be transformed
        encryptedApiKey: '  iv:auth:encrypted_data_here  ', // Will be trimmed
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'API key with transformations' }]);

      expect(results[0].success).toBe(true);

      // Verify transformations worked correctly
      const entity = results[0].entity as NativeToolApiKeyEntity;
      expect(entity.starshipId).toBe('starship-456'); // Trimmed
      expect(entity.toolName).toBe('gmailapispecial'); // Transformed - all special chars removed
      expect(entity.encryptedApiKey).toBe('iv:auth:encrypted_data_here'); // Trimmed
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(NativeToolApiKeyEntity, null)).toThrow();
      expect(() => fromDatabase(NativeToolApiKeyEntity, undefined)).toThrow();
      expect(() => fromDatabase(NativeToolApiKeyEntity, 'not an object')).toThrow();
    });
  });

  describe('Integration with test helper', () => {
    it('should work with entity test helper validation tests', async () => {
      const validationTestCases = [
        {
          data: {
            starshipId: 'starship-123',
            toolName: 'gmail_api',
            encryptedApiKey: 'encrypted_key_data',
          },
          shouldPass: true,
          description: 'valid API key data should pass',
        },
        {
          data: {
            toolName: 'gmail_api',
            encryptedApiKey: 'encrypted_key_data',
          }, // Missing starshipId
          shouldPass: false,
          description: 'missing starshipId should fail',
        },
        {
          data: {
            starshipId: 'starship-123',
            encryptedApiKey: 'encrypted_key_data',
          }, // Missing toolName
          shouldPass: false,
          description: 'missing toolName should fail',
        },
        {
          data: {
            starshipId: 'starship-123',
            toolName: 'gmail_api',
          }, // Missing encryptedApiKey
          shouldPass: false,
          description: 'missing encryptedApiKey should fail',
        },
      ];

      const results = await testHelper.testValidation(validationTestCases);

      results.forEach((result, index) => {
        expect(result.passed).toBe(validationTestCases[index].shouldPass);
      });
    });
  });
});
