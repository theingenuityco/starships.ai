/**
 * UserEntity Unit Tests (username removed)
 *
 * Tests for serialization, deserialization, validation, and helper methods
 * of the UserEntity class with identity based on email/id instead of username.
 */

import { UserEntity, UserTransformers } from '@/entities/UserEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { plainToInstance, Expose } from 'class-transformer';

// Test entity classes to exercise transformers
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

describe('UserEntity (no-username)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UserTransformers', () => {
    describe('EmailTransform', () => {
      it('should transform email to lowercase and trim', () => {
        const plain = { email: '  TEST@EXAMPLE.COM  ' };
        const instance = plainToInstance(EmailTestEntity, plain);

        expect(instance.email).toBe('test@example.com');
      });

      it('should handle non-string or falsy values', () => {
        const cases: Array<{ input: unknown; expected: unknown }> = [
          { input: null, expected: null },
          { input: undefined, expected: undefined },
          { input: 123, expected: 123 },
        ];

        for (const { input, expected } of cases) {
          const instance = plainToInstance(EmailTestEntity, { email: input });
          expect(instance.email).toBe(expected);
        }
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
        const urls = [
          { input: 'https://example.com/avatar.jpg', expected: 'https://example.com/avatar.jpg' },
          { input: 'http://example.com/avatar.jpg', expected: 'http://example.com/avatar.jpg' },
        ];

        for (const { input, expected } of urls) {
          const instance = plainToInstance(AvatarTestEntity, { avatar: input });
          expect(instance.avatar).toBe(expected);
        }
      });

      it('should accept relative paths and data URLs', () => {
        const inputs = [
          { input: '/images/avatar.jpg', expected: '/images/avatar.jpg' },
          { input: 'data:image/png;base64,iVBOR...', expected: 'data:image/png;base64,iVBOR...' },
        ];

        for (const { input, expected } of inputs) {
          const instance = plainToInstance(AvatarTestEntity, { avatar: input });
          expect(instance.avatar).toBe(expected);
        }
      });

      it('should reject invalid URLs', () => {
        const invalids = [
          { input: 'invalid-url', expected: undefined },
          { input: 'ftp://example.com/avatar.jpg', expected: undefined },
        ];

        for (const { input, expected } of invalids) {
          const instance = plainToInstance(AvatarTestEntity, { avatar: input });
          expect(instance.avatar).toBe(expected);
        }
      });
    });
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const user = new UserEntity();
      user.id = 'user-123';
      user.email = 'test@example.com';
      user.displayName = 'Test User';
      user.avatar = 'https://example.com/avatar.jpg';
      user.password = 'securepassword123';
      user.stripeCustomerId = 'cus_123456789';
      user.createdAt = '2024-01-01T00:00:00.000Z';

      const serialized = toDatabase(user);

      expect(serialized).toEqual({
        id: 'user-123',
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
    it('should deserialize database record with transformations', async () => {
      const databaseRecord = {
        id: 'user-123',
        email: '  TEST@EXAMPLE.COM  ', // should be transformed
        displayName: '  John Doe  ', // should be trimmed
        avatar: '  https://example.com/avatar.jpg  ', // leading/trailing spaces
        password: 'securepassword123',
        stripeCustomerId: 'cus_123456789',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UserEntity, databaseRecord);

      expect(entity).toBeInstanceOf(UserEntity);
      expect(entity.id).toBe('user-123');
      expect(entity.email).toBe('test@example.com');
      expect(entity.displayName).toBe('John Doe');
      expect(entity.avatar).toBe('https://example.com/avatar.jpg');
      expect(entity.password).toBe('securepassword123');
      expect(entity.stripeCustomerId).toBe('cus_123456789');
    });

    it('should handle missing optional fields', async () => {
      const databaseRecord = {
        id: 'user-123',
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
          email: 'user1@example.com',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(UserEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(UserEntity);
      expect(entities[1]).toBeInstanceOf(UserEntity);
      expect(entities[0].id).toBe('user-1');
      expect(entities[1].id).toBe('user-2');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        email: 'test@example.com',
        displayName: 'Test User',
      };

      await expect(UserEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should validate email format', async () => {
      // Invalid email format
      await expect(
        UserEntity.validate({
          email: 'invalid-email',
        })
      ).rejects.toThrow();

      // Valid email should pass
      await expect(
        UserEntity.validate({
          email: 'test@example.com',
        })
      ).resolves.not.toThrow();
    });

    it('should validate password length', async () => {
      // Too short password
      await expect(
        UserEntity.validate({
          password: '12345',
        })
      ).rejects.toThrow();

      // Valid password should pass
      await expect(
        UserEntity.validate({
          password: 'securepassword123',
        })
      ).resolves.not.toThrow();
    });

    it('should validate Stripe Customer ID format', async () => {
      // Invalid format
      await expect(
        UserEntity.validate({
          stripeCustomerId: 'invalid-format',
        })
      ).rejects.toThrow();

      // Valid format should pass
      await expect(
        UserEntity.validate({
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
      user.createdAt = '2024-01-01T00:00:00.000Z';
    });

    describe('hasCompleteProfile', () => {
      it('should return true when email and displayName are present', () => {
        user.email = 'test@example.com';
        user.displayName = 'Test User';

        expect(user.hasCompleteProfile()).toBe(true);
      });

      it('should return false when any required field is missing', () => {
        user.email = 'test@example.com'; // displayName missing

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

      it('should return email initial when no display name', () => {
        user.email = 'test@example.com';

        expect(user.getInitials()).toBe('T');
      });

      it('should return default when no identifying information', () => {
        expect(user.getInitials()).toBe('U');
      });
    });

    describe('getDisplayName', () => {
      it('should return display name when available', () => {
        user.displayName = 'John Doe';
        user.email = 'john@example.com';

        expect(user.getDisplayName()).toBe('John Doe');
      });

      it('should return email local part when no display name', () => {
        user.email = 'john@example.com';

        expect(user.getDisplayName()).toBe('john');
      });

      it('should return default when no identifying information', () => {
        expect(user.getDisplayName()).toBe('Unknown User');
      });
    });

    describe('getAge', () => {
      it('should return age in milliseconds', () => {
        const now = Date.now();
        const pastDate = new Date(now - 86400000).toISOString(); // 1 day ago
        user.createdAt = pastDate;

        const age = user.getAge();
        expect(age).toBeGreaterThanOrEqual(86400000 - 1000);
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
        user.email = undefined;
        expect(user.getEmailProvider()).toBe('unknown');
      });
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'user-123',
        email: '  TEST@EXAMPLE.COM  ', // Will be transformed
        displayName: '  John Doe  ', // Will be transformed
        avatar: '  https://example.com/avatar.jpg  ', // Will be transformed
        password: 'securepassword123',
        stripeCustomerId: 'cus_123456789',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UserEntity, originalData);
      const serialized = toDatabase(entity);
      const roundTrip = fromDatabase(UserEntity, serialized);

      // Verify transformations persisted
      expect(roundTrip.email).toBe('test@example.com');
      expect(roundTrip.displayName).toBe('John Doe');
      expect(roundTrip.avatar).toBe('https://example.com/avatar.jpg');
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(UserEntity, null as unknown as Record<string, unknown>)).toThrow();
      expect(() => fromDatabase(UserEntity, undefined as unknown as Record<string, unknown>)).toThrow();
      expect(() => fromDatabase(UserEntity, 'not an object' as unknown as Record<string, unknown>)).toThrow();
    });

    it('should handle invalid transformations', async () => {
      const databaseRecord = {
        id: 'user-123',
        avatar: 'invalid-url-format',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UserEntity, databaseRecord);
      expect(entity.avatar).toBeUndefined(); // Invalid URL should be transformed to undefined
    });
  });
});
