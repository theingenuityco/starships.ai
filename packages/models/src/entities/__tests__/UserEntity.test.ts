/**
 * UserEntity Unit Tests
 *
 * Tests for serialization, deserialization, validation, transformations,
 * and helper methods of the UserEntity class.
 */

import { UserEntity, UserTransformers } from '@/entities/UserEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';
import { plainToInstance, Expose } from 'class-transformer';

// Test entity classes to test transformations in real scenarios (like common serializer tests)
class UsernameTestEntity {
  @Expose()
  @UserTransformers.UsernameTransform()
  username?: string;
}

class EmailTestEntity {
  @Expose()
  @UserTransformers.EmailTransform()
  email?: string;
}

class DisplayNameTestEntity {
  @Expose()
  @UserTransformers.DisplayNameTransform()
  displayName?: string;
}

class AvatarTestEntity {
  @Expose()
  @UserTransformers.AvatarTransform()
  avatar?: string;
}

describe('UserEntity', () => {
  let testHelper: EntityTestHelper<UserEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(UserEntity, 'UserEntity');
    jest.clearAllMocks();
  });

  describe('UserTransformers', () => {
    describe('UsernameTransform', () => {
      it('should transform username to lowercase and remove spaces', () => {
        const plain = { username: 'Test User 123' };
        const instance = plainToInstance(UsernameTestEntity, plain);

        expect(instance.username).toBe('testuser123');
      });

      it('should handle empty and null values', () => {
        const testCases = [
          { input: null, expected: null },
          { input: undefined, expected: undefined },
          { input: '', expected: '' },
        ];

        testCases.forEach(({ input, expected }) => {
          const plain = { username: input };
          const instance = plainToInstance(UsernameTestEntity, plain);
          expect(instance.username).toBe(expected);
        });
      });
    });

    describe('EmailTransform', () => {
      it('should transform email to lowercase and trim', () => {
        const plain = { email: '  TEST@EXAMPLE.COM  ' };
        const instance = plainToInstance(EmailTestEntity, plain);

        expect(instance.email).toBe('test@example.com');
      });

      it('should handle non-string values', () => {
        const testCases = [
          { input: null, expected: null },
          { input: 123, expected: 123 },
        ];

        testCases.forEach(({ input, expected }) => {
          const plain = { email: input };
          const instance = plainToInstance(EmailTestEntity, plain);
          expect(instance.email).toBe(expected);
        });
      });
    });

    describe('DisplayNameTransform', () => {
      it('should trim display name', () => {
        const plain = { displayName: '  John Doe  ' };
        const instance = plainToInstance(DisplayNameTestEntity, plain);

        expect(instance.displayName).toBe('John Doe');
      });
    });

    describe('AvatarTransform', () => {
      it('should accept valid URLs', () => {
        const testCases = [
          { input: 'https://example.com/avatar.jpg', expected: 'https://example.com/avatar.jpg' },
          { input: 'http://example.com/avatar.jpg', expected: 'http://example.com/avatar.jpg' },
        ];

        testCases.forEach(({ input, expected }) => {
          const plain = { avatar: input };
          const instance = plainToInstance(AvatarTestEntity, plain);
          expect(instance.avatar).toBe(expected);
        });
      });

      it('should accept relative paths and data URLs', () => {
        const testCases = [
          { input: '/images/avatar.jpg', expected: '/images/avatar.jpg' },
          { input: 'data:image/png;base64,iVBOR...', expected: 'data:image/png;base64,iVBOR...' },
        ];

        testCases.forEach(({ input, expected }) => {
          const plain = { avatar: input };
          const instance = plainToInstance(AvatarTestEntity, plain);
          expect(instance.avatar).toBe(expected);
        });
      });

      it('should reject invalid URLs', () => {
        const testCases = [
          { input: 'invalid-url', expected: undefined },
          { input: 'ftp://example.com/avatar.jpg', expected: undefined },
        ];

        testCases.forEach(({ input, expected }) => {
          const plain = { avatar: input };
          const instance = plainToInstance(AvatarTestEntity, plain);
          expect(instance.avatar).toBe(expected);
        });
      });
    });
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const user = new UserEntity();
      user.id = 'user-123';
      user.username = 'testuser';
      user.email = 'test@example.com';
      user.displayName = 'Test User';
      user.avatar = 'https://example.com/avatar.jpg';
      user.password = 'securepassword123';
      user.stripeCustomerId = 'cus_123456789';
      user.createdAt = '2024-01-01T00:00:00.000Z';

      const serialized = toDatabase(user);

      expect(serialized).toEqual({
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
        password: 'securepassword123',
        stripeCustomerId: 'cus_123456789',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should handle optional fields', async () => {
      const user = new UserEntity();
      user.id = 'user-123';
      user.username = 'testuser';
      user.createdAt = '2024-01-01T00:00:00.000Z';

      const serialized = toDatabase(user);

      expect(serialized.email).toBeUndefined();
      expect(serialized.displayName).toBeUndefined();
      expect(serialized.avatar).toBeUndefined();
      expect(serialized.password).toBeUndefined();
      expect(serialized.stripeCustomerId).toBeUndefined();
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'user-123',
        username: 'Test User 123', // Should be transformed
        email: '  TEST@EXAMPLE.COM  ', // Should be transformed
        displayName: '  John Doe  ', // Should be transformed
        avatar: '  https://example.com/avatar.jpg  ', // Should be transformed
        password: 'securepassword123',
        stripeCustomerId: 'cus_123456789',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UserEntity, databaseRecord);

      expect(entity).toBeInstanceOf(UserEntity);
      expect(entity.id).toBe('user-123');
      expect(entity.username).toBe('testuser123'); // Transformed
      expect(entity.email).toBe('test@example.com'); // Transformed
      expect(entity.displayName).toBe('John Doe'); // Transformed
      expect(entity.avatar).toBe('https://example.com/avatar.jpg'); // Transformed
      expect(entity.password).toBe('securepassword123');
      expect(entity.stripeCustomerId).toBe('cus_123456789');
    });

    it('should handle missing optional fields', async () => {
      const databaseRecord = {
        id: 'user-123',
        username: 'testuser',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UserEntity, databaseRecord);

      expect(entity).toBeInstanceOf(UserEntity);
      expect(entity.email).toBeUndefined();
      expect(entity.displayName).toBeUndefined();
      expect(entity.avatar).toBeUndefined();
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'user-1',
          username: 'user1',
          email: 'user1@example.com',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'user-2',
          username: 'user2',
          email: 'user2@example.com',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(UserEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(UserEntity);
      expect(entities[1]).toBeInstanceOf(UserEntity);
      expect(entities[0].username).toBe('user1');
      expect(entities[1].username).toBe('user2');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      await expect(UserEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required username', async () => {
      const invalidData = {
        email: 'test@example.com',
      };

      await expect(UserEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate username constraints', async () => {
      // Too short username
      await expect(
        UserEntity.validate({
          username: '',
        })
      ).rejects.toThrow();

      // Too long username
      await expect(
        UserEntity.validate({
          username: 'a'.repeat(51),
        })
      ).rejects.toThrow();

      // Invalid characters
      await expect(
        UserEntity.validate({
          username: 'user@invalid',
        })
      ).rejects.toThrow();
    });

    it('should validate email format', async () => {
      // Invalid email format
      await expect(
        UserEntity.validate({
          username: 'testuser',
          email: 'invalid-email',
        })
      ).rejects.toThrow();

      // Valid email should pass
      await expect(
        UserEntity.validate({
          username: 'testuser',
          email: 'test@example.com',
        })
      ).resolves.not.toThrow();
    });

    it('should validate password length', async () => {
      // Too short password
      await expect(
        UserEntity.validate({
          username: 'testuser',
          password: '12345',
        })
      ).rejects.toThrow();

      // Valid password should pass
      await expect(
        UserEntity.validate({
          username: 'testuser',
          password: 'securepassword123',
        })
      ).resolves.not.toThrow();
    });

    it('should validate Stripe Customer ID format', async () => {
      // Invalid format
      await expect(
        UserEntity.validate({
          username: 'testuser',
          stripeCustomerId: 'invalid-format',
        })
      ).rejects.toThrow();

      // Valid format should pass
      await expect(
        UserEntity.validate({
          username: 'testuser',
          stripeCustomerId: 'cus_123456789',
        })
      ).resolves.not.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        displayName: 'Updated Name',
      };

      await expect(UserEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(UserEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(UserEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(UserEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Helper Methods', () => {
    let user: UserEntity;

    beforeEach(() => {
      user = new UserEntity();
      user.id = 'user-123';
      user.username = 'testuser';
      user.createdAt = '2024-01-01T00:00:00.000Z';
    });

    describe('hasCompleteProfile', () => {
      it('should return true when all required fields are present', () => {
        user.email = 'test@example.com';
        user.displayName = 'Test User';
        user.username = 'testuser';

        expect(user.hasCompleteProfile()).toBe(true);
      });

      it('should return false when any required field is missing', () => {
        user.email = 'test@example.com';
        // displayName is missing

        expect(user.hasCompleteProfile()).toBe(false);
      });
    });

    describe('hasStripeIntegration', () => {
      it('should return true when stripeCustomerId is present', () => {
        user.stripeCustomerId = 'cus_123456789';

        expect(user.hasStripeIntegration()).toBe(true);
      });

      it('should return false when stripeCustomerId is missing', () => {
        expect(user.hasStripeIntegration()).toBe(false);
      });
    });

    describe('getInitials', () => {
      it('should return initials from display name', () => {
        user.displayName = 'John Doe';

        expect(user.getInitials()).toBe('JD');
      });

      it('should return single initial from display name with one word', () => {
        user.displayName = 'John';

        expect(user.getInitials()).toBe('J');
      });

      it('should return username initial when no display name', () => {
        user.username = 'testuser';

        expect(user.getInitials()).toBe('T');
      });

      it('should return email initial when no display name or username', () => {
        user.username = '';
        user.email = 'test@example.com';

        expect(user.getInitials()).toBe('T');
      });

      it('should return default when no identifying information', () => {
        user.username = '';

        expect(user.getInitials()).toBe('U');
      });
    });

    describe('getDisplayName', () => {
      it('should return display name when available', () => {
        user.displayName = 'John Doe';
        user.username = 'johndoe';
        user.email = 'john@example.com';

        expect(user.getDisplayName()).toBe('John Doe');
      });

      it('should return username when no display name', () => {
        user.username = 'johndoe';
        user.email = 'john@example.com';

        expect(user.getDisplayName()).toBe('johndoe');
      });

      it('should return email local part when no display name or username', () => {
        user.username = '';
        user.email = 'john@example.com';

        expect(user.getDisplayName()).toBe('john');
      });

      it('should return default when no identifying information', () => {
        user.username = '';

        expect(user.getDisplayName()).toBe('Unknown User');
      });
    });

    describe('getAge', () => {
      it('should return age in milliseconds', () => {
        const now = Date.now();
        const pastDate = new Date(now - 86400000).toISOString(); // 1 day ago
        user.createdAt = pastDate;

        const age = user.getAge();
        expect(age).toBeGreaterThanOrEqual(86400000 - 1000); // Allow for test timing
        expect(age).toBeLessThanOrEqual(86400000 + 1000);
      });
    });

    describe('isNewUser', () => {
      it('should return true for users created within last 7 days', () => {
        const now = Date.now();
        const recentDate = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
        user.createdAt = recentDate;

        expect(user.isNewUser()).toBe(true);
      });

      it('should return false for users created more than 7 days ago', () => {
        const now = Date.now();
        const oldDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
        user.createdAt = oldDate;

        expect(user.isNewUser()).toBe(false);
      });
    });

    describe('toSafeObject', () => {
      it('should return user data without password', () => {
        user.password = 'securepassword123';
        user.email = 'test@example.com';
        user.displayName = 'Test User';

        const safeData = user.toSafeObject();

        expect('password' in safeData).toBe(false);
        expect(safeData.email).toBe('test@example.com');
        expect(safeData.displayName).toBe('Test User');
        expect(safeData.id).toBe('user-123');
      });
    });

    describe('getEmailProvider', () => {
      it('should identify known email providers', () => {
        user.email = 'test@gmail.com';
        expect(user.getEmailProvider()).toBe('Google');

        user.email = 'test@outlook.com';
        expect(user.getEmailProvider()).toBe('Microsoft');

        user.email = 'test@yahoo.com';
        expect(user.getEmailProvider()).toBe('Yahoo');
      });

      it('should return Other for unknown providers', () => {
        user.email = 'test@customdomain.com';
        expect(user.getEmailProvider()).toBe('Other');
      });

      it('should return unknown for missing email', () => {
        expect(user.getEmailProvider()).toBe('unknown');
      });
    });
  });

  describe('Static Helper Methods', () => {
    describe('generateUsernameFromEmail', () => {
      it('should extract username from email', () => {
        expect(UserEntity.generateUsernameFromEmail('john.doe@example.com')).toBe('johndoe');
        expect(UserEntity.generateUsernameFromEmail('test_user@example.com')).toBe('test_user');
        expect(UserEntity.generateUsernameFromEmail('user-123@example.com')).toBe('user-123');
      });

      it('should handle emails with special characters', () => {
        expect(UserEntity.generateUsernameFromEmail('user+tag@example.com')).toBe('usertag');
        expect(UserEntity.generateUsernameFromEmail('user.name+tag@example.com')).toBe('usernametag');
      });
    });

    describe('validatePasswordStrength', () => {
      it('should validate strong passwords', () => {
        const result = UserEntity.validatePasswordStrength('StrongPass123!');

        expect(result.isStrong).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(4);
        expect(result.issues).toHaveLength(0);
      });

      it('should identify weak passwords', () => {
        const result = UserEntity.validatePasswordStrength('weak');

        expect(result.isStrong).toBe(false);
        expect(result.issues).toContain('Password must be at least 6 characters long');
        expect(result.issues).toContain('Password must contain at least one uppercase letter');
        expect(result.issues).toContain('Password must contain at least one number');
        expect(result.issues).toContain('Password must contain at least one special character');
      });

      it('should validate medium strength passwords', () => {
        const result = UserEntity.validatePasswordStrength('Password123');

        expect(result.isStrong).toBe(false);
        expect(result.issues).toContain('Password must contain at least one special character');
      });
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'user-123',
        username: 'Test User 123', // Will be transformed
        email: '  TEST@EXAMPLE.COM  ', // Will be transformed
        displayName: '  John Doe  ', // Will be transformed
        avatar: '  https://example.com/avatar.jpg  ', // Will be transformed
        password: 'securepassword123',
        stripeCustomerId: 'cus_123456789',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete user data with transformations' }]);

      expect(results[0].success).toBe(true);
      expect(results[0].keysMatch).toBe(true);

      // Verify transformations worked correctly
      const entity = results[0].entity as UserEntity;
      expect(entity.username).toBe('testuser123');
      expect(entity.email).toBe('test@example.com');
      expect(entity.displayName).toBe('John Doe');
      expect(entity.avatar).toBe('https://example.com/avatar.jpg');
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(UserEntity, null)).toThrow();
      expect(() => fromDatabase(UserEntity, undefined)).toThrow();
      expect(() => fromDatabase(UserEntity, 'not an object')).toThrow();
    });

    it('should handle invalid transformations', async () => {
      const databaseRecord = {
        id: 'user-123',
        username: 'testuser',
        avatar: 'invalid-url-format',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UserEntity, databaseRecord);
      expect(entity.avatar).toBeUndefined(); // Invalid URL should be transformed to undefined
    });
  });
});
