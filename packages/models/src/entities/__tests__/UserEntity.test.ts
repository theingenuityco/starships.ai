/**
 * UserEntity Unit Tests
 *
 * Tests for serialization, deserialization, validation, and helper methods
 * of the UserEntity class.
 */

import { UserEntity } from '@/entities/UserEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('UserEntity', () => {
  let testHelper: EntityTestHelper<UserEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(UserEntity, 'UserEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const user = new UserEntity();
      user.id = 'user-123';
      user.email = 'test@example.com';
      user.displayName = 'Test User';
      user.avatar = 'https://example.com/avatar.jpg';
      user.password = 'hashedpassword123';
      user.createdAt = '2024-01-01T00:00:00.000Z';
      user.updatedAt = '2024-01-02T12:00:00.000Z';

      const serialized = toDatabase(user);

      expect(serialized).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        display_name: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
        password: 'hashedpassword123',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should handle optional fields', async () => {
      const user = new UserEntity();
      user.id = 'user-123';
      user.email = 'test@example.com';
      user.createdAt = '2024-01-01T00:00:00.000Z';
      user.stripeCustomerId = 'cus_123abc';

      const serialized = toDatabase(user);

      expect(serialized.display_name).toBeUndefined();
      expect(serialized.avatar).toBeUndefined();
      expect(serialized.password).toBeUndefined();
      expect(serialized.stripe_customer_id).toBe('cus_123abc');
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
        password: 'hashedpassword123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(UserEntity, databaseRecord);

      expect(entity).toBeInstanceOf(UserEntity);
      expect(entity.id).toBe('user-123');
      expect(entity.email).toBe('test@example.com');
      expect(entity.displayName).toBe('Test User');
      expect(entity.avatar).toBe('https://example.com/avatar.jpg');
    });

    it('should handle optional Stripe customer ID', async () => {
      const databaseRecord = {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        stripeCustomerId: 'cus_abc123',
      };

      const entity = fromDatabase(UserEntity, databaseRecord);

      expect(entity.stripeCustomerId).toBe('cus_abc123');
    });

    it('should apply email transformation (lowercase)', async () => {
      const databaseRecord = {
        id: 'user-123',
        email: 'TEST@EXAMPLE.COM',
        displayName: 'Test User',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(UserEntity, databaseRecord);

      expect(entity.email).toBe('test@example.com');
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          displayName: 'User 1',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          displayName: 'User 2',
          createdAt: '2024-01-02T00:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(UserEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(UserEntity);
      expect(entities[1]).toBeInstanceOf(UserEntity);
      expect(entities[0].email).toBe('user1@example.com');
      expect(entities[1].email).toBe('user2@example.com');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        email: 'test@example.com',
        displayName: 'Test User',
        password: 'password123',
      };

      await expect(UserEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should validate email format', async () => {
      await expect(
        UserEntity.validate({
          email: 'invalid-email',
          displayName: 'Test User',
        })
      ).rejects.toThrow();

      await expect(
        UserEntity.validate({
          email: 'valid@example.com',
          displayName: 'Test User',
        })
      ).resolves.not.toThrow();
    });

    it('should validate password length constraints', async () => {
      await expect(
        UserEntity.validate({
          email: 'test@example.com',
          password: '12345',
        })
      ).rejects.toThrow();

      await expect(
        UserEntity.validate({
          email: 'test@example.com',
          password: '123456',
        })
      ).resolves.not.toThrow();
    });

    it('should validate displayName length constraints', async () => {
      await expect(
        UserEntity.validate({
          email: 'test@example.com',
          displayName: '',
        })
      ).rejects.toThrow();

      await expect(
        UserEntity.validate({
          email: 'test@example.com',
          displayName: 'a'.repeat(101),
        })
      ).rejects.toThrow();

      await expect(
        UserEntity.validate({
          email: 'test@example.com',
          displayName: 'Valid Name',
        })
      ).resolves.not.toThrow();
    });

    it('should validate Stripe customer ID format', async () => {
      await expect(
        UserEntity.validate({
          email: 'test@example.com',
          stripeCustomerId: 'invalid_format',
        })
      ).rejects.toThrow();

      await expect(
        UserEntity.validate({
          email: 'test@example.com',
          stripeCustomerId: 'cus_abc123',
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
    describe('Profile helpers', () => {
      it('should check if user has complete profile', () => {
        const user = new UserEntity();

        user.email = 'test@example.com';
        user.displayName = 'Test User';
        expect(user.hasCompleteProfile()).toBe(true);

        user.displayName = undefined;
        expect(user.hasCompleteProfile()).toBe(false);

        user.email = undefined;
        user.displayName = 'Test User';
        expect(user.hasCompleteProfile()).toBe(false);
      });

      it('should check if user has Stripe integration', () => {
        const user = new UserEntity();

        expect(user.hasStripeIntegration()).toBe(false);

        user.stripeCustomerId = 'cus_123';
        expect(user.hasStripeIntegration()).toBe(true);
      });
    });

    describe('Display helpers', () => {
      it('should get initials from display name', () => {
        const user = new UserEntity();

        user.displayName = 'John Doe';
        expect(user.getInitials()).toBe('JD');

        user.displayName = 'Jane Smith Williams';
        expect(user.getInitials()).toBe('JS');

        user.displayName = 'SingleName';
        expect(user.getInitials()).toBe('S');

        user.displayName = undefined;
        user.email = 'test@example.com';
        expect(user.getInitials()).toBe('T');

        user.email = undefined;
        expect(user.getInitials()).toBe('U');
      });

      it('should get display name or fallback', () => {
        const user = new UserEntity();

        user.displayName = 'John Doe';
        expect(user.getDisplayName()).toBe('John Doe');

        user.displayName = undefined;
        user.email = 'test@example.com';
        expect(user.getDisplayName()).toBe('test');

        user.email = undefined;
        expect(user.getDisplayName()).toBe('Unknown User');
      });
    });

    describe('Age and lifecycle helpers', () => {
      it('should get user age in milliseconds', () => {
        const user = new UserEntity();
        user.createdAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

        const age = user.getAge();
        expect(age).toBeGreaterThan(0);
        expect(age).toBeLessThanOrEqual(5 * 24 * 60 * 60 * 1000 + 1000); // Allow 1 second tolerance
      });

      it('should check if user is new', () => {
        const user = new UserEntity();

        user.createdAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        expect(user.isNewUser()).toBe(true);

        user.createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        expect(user.isNewUser()).toBe(false);
      });
    });

    describe('Security helpers', () => {
      it('should return safe user object without password', () => {
        const user = new UserEntity();
        user.id = 'user-123';
        user.email = 'test@example.com';
        user.displayName = 'Test User';
        user.password = 'secret123';
        user.createdAt = '2024-01-01T00:00:00.000Z';

        const safeUser = user.toSafeObject();

        expect(safeUser.id).toBe('user-123');
        expect(safeUser.email).toBe('test@example.com');
        expect(safeUser.displayName).toBe('Test User');
        expect('password' in safeUser).toBe(false);
      });
    });

    describe('Email provider helper', () => {
      it('should identify email providers', () => {
        const user = new UserEntity();

        user.email = 'test@gmail.com';
        expect(user.getEmailProvider()).toBe('Google');

        user.email = 'test@outlook.com';
        expect(user.getEmailProvider()).toBe('Microsoft');

        user.email = 'test@hotmail.com';
        expect(user.getEmailProvider()).toBe('Microsoft');

        user.email = 'test@yahoo.com';
        expect(user.getEmailProvider()).toBe('Yahoo');

        user.email = 'test@icloud.com';
        expect(user.getEmailProvider()).toBe('Apple');

        user.email = 'test@protonmail.com';
        expect(user.getEmailProvider()).toBe('ProtonMail');

        user.email = 'test@unknown.com';
        expect(user.getEmailProvider()).toBe('Other');

        user.email = undefined;
        expect(user.getEmailProvider()).toBe('unknown');
      });
    });

    describe('Password strength validation', () => {
      it('should validate password strength', () => {
        expect(UserEntity.validatePasswordStrength('weak').isStrong).toBe(false);
        expect(UserEntity.validatePasswordStrength('weak').issues.length).toBeGreaterThan(0);

        expect(UserEntity.validatePasswordStrength('Strong1!').isStrong).toBe(true);
        expect(UserEntity.validatePasswordStrength('Strong1!').issues).toHaveLength(0);

        const result = UserEntity.validatePasswordStrength('Pass123!');
        expect(result.score).toBeGreaterThan(0);
        expect(typeof result.isStrong).toBe('boolean');
      });

      it('should identify specific password weaknesses', () => {
        const noUppercase = UserEntity.validatePasswordStrength('password123!');
        expect(noUppercase.issues).toContain('Password must contain at least one uppercase letter');

        const noLowercase = UserEntity.validatePasswordStrength('PASSWORD123!');
        expect(noLowercase.issues).toContain('Password must contain at least one lowercase letter');

        const noNumber = UserEntity.validatePasswordStrength('Password!');
        expect(noNumber.issues).toContain('Password must contain at least one number');

        const noSpecial = UserEntity.validatePasswordStrength('Password123');
        expect(noSpecial.issues).toContain('Password must contain at least one special character');

        const tooShort = UserEntity.validatePasswordStrength('Pa1!');
        expect(tooShort.issues).toContain('Password must be at least 6 characters long');
      });
    });
  });

  describe('Transformations', () => {
    it('should transform email to lowercase', async () => {
      const testCases = [
        {
          input: { id: 'user-123', email: 'TEST@EXAMPLE.COM', createdAt: '2024-01-01T00:00:00.000Z' },
          expected: { email: 'test@example.com' },
          description: 'should transform uppercase email to lowercase',
        },
        {
          input: { id: 'user-123', email: '  Test@Example.com  ', createdAt: '2024-01-01T00:00:00.000Z' },
          expected: { email: 'test@example.com' },
          description: 'should trim and lowercase email',
        },
      ];

      const results = await testHelper.testTransformations(testCases);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    it('should transform display name (trim whitespace)', async () => {
      const testCases = [
        {
          input: { id: 'user-123', displayName: '  Test User  ', createdAt: '2024-01-01T00:00:00.000Z' },
          expected: { displayName: 'Test User' },
          description: 'should trim display name',
        },
      ];

      const results = await testHelper.testTransformations(testCases);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
        password: 'hashedpassword123',
        stripeCustomerId: 'cus_abc123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete user data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as UserEntity;
      expect(entity.email).toBe('test@example.com');
      expect(entity.displayName).toBe('Test User');
      expect(entity.stripeCustomerId).toBe('cus_abc123');
    });

    it('should handle round-trip with minimal data', async () => {
      const minimalData = {
        id: 'user-123',
        email: 'test@example.com',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: minimalData, description: 'minimal user data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as UserEntity;
      expect(entity.displayName).toBeUndefined();
      expect(entity.avatar).toBeUndefined();
      expect(entity.password).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(UserEntity, null)).toThrow();
      expect(() => fromDatabase(UserEntity, undefined)).toThrow();
      expect(() => fromDatabase(UserEntity, 'not an object')).toThrow();
    });

    it('should handle empty array deserialization', async () => {
      const emptyArray: never[] = [];
      const entities = fromDatabaseArray(UserEntity, emptyArray);

      expect(entities).toHaveLength(0);
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle various email formats', async () => {
      const emails = [
        'simple@example.com',
        'user+tag@example.com',
        'user.name@example.com',
        'user_name@example.co.uk',
        'user-name@sub.example.com',
      ];

      for (const email of emails) {
        const record = {
          id: 'user-123',
          email,
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(UserEntity, record);
        expect(entity.email).toBe(email.toLowerCase());
      }
    });

    it('should handle special characters in display name', async () => {
      const displayNames = ["John O'Brien", 'María García', 'François Dubois', '李明', 'محمد', 'User with emoji 😊'];

      for (const displayName of displayNames) {
        const record = {
          id: 'user-123',
          email: 'test@example.com',
          displayName,
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(UserEntity, record);
        expect(entity.displayName).toBe(displayName.trim());
      }
    });

    it('should handle various avatar URL formats', async () => {
      const avatars = [
        'https://example.com/avatar.jpg',
        'http://example.com/avatar.png',
        '/static/avatar.jpg',
        'data:image/png;base64,iVBORw0KG...',
      ];

      for (const avatar of avatars) {
        const record = {
          id: 'user-123',
          email: 'test@example.com',
          avatar,
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(UserEntity, record);
        expect(entity.avatar).toBe(avatar.trim());
      }
    });

    it('should handle various Stripe customer ID formats', async () => {
      const stripeIds = ['cus_abc123', 'cus_ABC123', 'cus_123ABC', 'cus_aB1cD2'];

      for (const stripeCustomerId of stripeIds) {
        const record = {
          id: 'user-123',
          email: 'test@example.com',
          stripeCustomerId,
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(UserEntity, record);
        expect(entity.stripeCustomerId).toBe(stripeCustomerId);
      }
    });

    it('should handle users at different lifecycle stages', async () => {
      const user = new UserEntity();
      user.createdAt = new Date().toISOString();

      // Just created
      expect(user.getAge()).toBeGreaterThanOrEqual(0);
      expect(user.isNewUser()).toBe(true);

      // 10 days old
      user.createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(user.isNewUser()).toBe(false);
    });
  });
});
