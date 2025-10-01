/**
 * StarshipEntity Unit Tests
 *
 * Tests for serialization, deserialization, validation, transformations,
 * and helper methods of the StarshipEntity class.
 */

import { StarshipEntity, StarshipTransformers } from '@/entities/StarshipEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';
import { plainToInstance, Expose } from 'class-transformer';

// Test entity classes to test transformations in real scenarios (like common serializer tests)
class SlugTestEntity {
  @Expose()
  @StarshipTransformers.SlugTransform()
  slug?: string;
}

class MaxAgentsTestEntity {
  @Expose()
  @StarshipTransformers.MaxAgentsTransform()
  maxAgents?: number;

  class?: string; // For testing class-based calculations
}

describe('StarshipEntity', () => {
  let testHelper: EntityTestHelper<StarshipEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(StarshipEntity, 'StarshipEntity');
    jest.clearAllMocks();
  });

  describe('StarshipTransformers', () => {
    describe('SlugTransform', () => {
      it('should transform name to URL-safe slug', () => {
        const testCases = [
          { input: 'My Amazing Starship!', expected: 'my-amazing-starship' },
          { input: 'Test___Ship   123', expected: 'test-ship-123' },
          { input: '---Start--End---', expected: 'start-end' },
        ];

        testCases.forEach(({ input, expected }) => {
          const plain = { slug: input };
          const instance = plainToInstance(SlugTestEntity, plain);
          expect(instance.slug).toBe(expected);
        });
      });

      it('should handle empty and non-string values', () => {
        const testCases = [
          { input: '', expected: '' },
          { input: null, expected: null },
          { input: 123, expected: 123 },
        ];

        testCases.forEach(({ input, expected }) => {
          const plain = { slug: input };
          const instance = plainToInstance(SlugTestEntity, plain);
          expect(instance.slug).toBe(expected);
        });
      });
    });

    describe('MaxAgentsTransform', () => {
      it('should use provided value if valid', () => {
        const testCases = [
          { input: { maxAgents: 5, class: 'scout' }, expected: 5 },
          { input: { maxAgents: 8, class: 'cruiser' }, expected: 8 },
        ];

        testCases.forEach(({ input, expected }) => {
          const instance = plainToInstance(MaxAgentsTestEntity, input);
          expect(instance.maxAgents).toBe(expected);
        });
      });

      it('should auto-calculate based on class when no value provided', () => {
        const testCases = [
          { input: { maxAgents: undefined, class: 'scout' }, expected: 3 },
          { input: { maxAgents: undefined, class: 'cruiser' }, expected: 5 },
          { input: { maxAgents: undefined, class: 'draught' }, expected: 10 },
          { input: { maxAgents: undefined, class: 'unknown' }, expected: 3 },
        ];

        testCases.forEach(({ input, expected }) => {
          const instance = plainToInstance(MaxAgentsTestEntity, input);
          expect(instance.maxAgents).toBe(expected);
        });
      });

      it('should handle invalid values', () => {
        const testCases = [
          { input: { maxAgents: 0, class: 'scout' }, expected: 3 },
          { input: { maxAgents: -1, class: 'scout' }, expected: 3 },
        ];

        testCases.forEach(({ input, expected }) => {
          const instance = plainToInstance(MaxAgentsTestEntity, input);
          expect(instance.maxAgents).toBe(expected);
        });
      });
    });
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const starship = new StarshipEntity();
      starship.id = 'starship-123';
      starship.slug = 'test-starship';
      starship.ownerId = 'user-123';
      starship.class = 'scout';
      starship.name = 'Test Starship';
      starship.maxAgents = 3;
      starship.status = 'active';
      starship.createdAt = '2024-01-01T00:00:00.000Z';
      starship.updatedAt = '2024-01-01T00:00:00.000Z';
      starship.subscriptionId = 'sub_123456789';
      starship.plan = 'scout';
      starship.billingPeriod = 'monthly';
      starship.stripeCustomerId = 'cus_123456789';

      const serialized = toDatabase(starship);

      expect(serialized).toEqual({
        id: 'starship-123',
        slug: 'test-starship',
        owner_id: 'user-123',
        class: 'scout',
        name: 'Test Starship',
        max_agents: 3,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        subscription_id: 'sub_123456789',
        plan: 'scout',
        billing_period: 'monthly',
        stripe_customer_id: 'cus_123456789',
      });
    });

    it('should handle optional fields', async () => {
      const starship = new StarshipEntity();
      starship.id = 'starship-123';
      starship.slug = 'test-starship';
      starship.ownerId = 'user-123';
      starship.class = 'scout';
      starship.name = 'Test Starship';
      starship.maxAgents = 3;
      starship.status = 'active';
      starship.createdAt = '2024-01-01T00:00:00.000Z';
      starship.updatedAt = '2024-01-01T00:00:00.000Z';

      const serialized = toDatabase(starship);

      expect(serialized.subscription_id).toBeUndefined();
      expect(serialized.plan).toBeUndefined();
      expect(serialized.billing_period).toBeUndefined();
      expect(serialized.stripe_customer_id).toBeUndefined();
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'starship-123',
        slug: 'My Amazing Ship!', // Should be transformed
        ownerId: 'user-123',
        class: 'cruiser',
        name: 'Amazing Ship',
        maxAgents: undefined, // Should be auto-calculated
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        subscriptionId: 'sub_123456789',
        plan: 'cruiser',
        billingPeriod: 'yearly',
        stripeCustomerId: 'cus_123456789',
      };

      const entity = fromDatabase(StarshipEntity, databaseRecord);

      expect(entity).toBeInstanceOf(StarshipEntity);
      expect(entity.id).toBe('starship-123');
      expect(entity.slug).toBe('my-amazing-ship'); // Transformed
      expect(entity.ownerId).toBe('user-123');
      expect(entity.class).toBe('cruiser');
      expect(entity.name).toBe('Amazing Ship');
      expect(entity.maxAgents).toBe(5); // Auto-calculated for cruiser class
      expect(entity.status).toBe('active');
      expect(entity.subscriptionId).toBe('sub_123456789');
      expect(entity.plan).toBe('cruiser');
      expect(entity.billingPeriod).toBe('yearly');
      expect(entity.stripeCustomerId).toBe('cus_123456789');
    });

    it('should handle missing optional fields', async () => {
      const databaseRecord = {
        id: 'starship-123',
        slug: 'test-starship',
        ownerId: 'user-123',
        class: 'scout',
        name: 'Test Starship',
        maxAgents: 3,
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(StarshipEntity, databaseRecord);

      expect(entity).toBeInstanceOf(StarshipEntity);
      expect(entity.subscriptionId).toBeUndefined();
      expect(entity.plan).toBeUndefined();
      expect(entity.billingPeriod).toBeUndefined();
      expect(entity.stripeCustomerId).toBeUndefined();
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'starship-1',
          slug: 'starship-1',
          ownerId: 'user-123',
          class: 'scout',
          name: 'Starship 1',
          maxAgents: 3,
          status: 'active',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'starship-2',
          slug: 'starship-2',
          ownerId: 'user-456',
          class: 'cruiser',
          name: 'Starship 2',
          maxAgents: 5,
          status: 'inactive',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(StarshipEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(StarshipEntity);
      expect(entities[1]).toBeInstanceOf(StarshipEntity);
      expect(entities[0].class).toBe('scout');
      expect(entities[1].class).toBe('cruiser');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        slug: 'test-starship',
        ownerId: 'user-123',
        class: 'scout',
        name: 'Test Starship',
        maxAgents: 3,
        status: 'active',
      };

      await expect(StarshipEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        name: 'Test Starship',
      };

      await expect(StarshipEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate class constraints', async () => {
      // Invalid class
      await expect(
        StarshipEntity.validate({
          slug: 'test-starship',
          ownerId: 'user-123',
          class: 'invalid-class',
          name: 'Test Starship',
          maxAgents: 3,
          status: 'active',
        })
      ).rejects.toThrow();

      // Valid classes should pass
      for (const validClass of ['scout', 'cruiser', 'draught']) {
        await expect(
          StarshipEntity.validate({
            slug: 'test-starship',
            ownerId: 'user-123',
            class: validClass,
            name: 'Test Starship',
            maxAgents: 3,
            status: 'active',
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate status constraints', async () => {
      // Invalid status
      await expect(
        StarshipEntity.validate({
          slug: 'test-starship',
          ownerId: 'user-123',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 3,
          status: 'invalid-status',
        })
      ).rejects.toThrow();

      // Valid statuses should pass
      for (const validStatus of ['active', 'inactive', 'restricted', 'disabled', 'pending_payment']) {
        await expect(
          StarshipEntity.validate({
            slug: 'test-starship',
            ownerId: 'user-123',
            class: 'scout',
            name: 'Test Starship',
            maxAgents: 3,
            status: validStatus,
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate maxAgents constraints', async () => {
      // Too few agents
      await expect(
        StarshipEntity.validate({
          slug: 'test-starship',
          ownerId: 'user-123',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 0,
          status: 'active',
        })
      ).rejects.toThrow();

      // Too many agents
      await expect(
        StarshipEntity.validate({
          slug: 'test-starship',
          ownerId: 'user-123',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 51,
          status: 'active',
        })
      ).rejects.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        name: 'Updated Starship Name',
      };

      await expect(StarshipEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });
  });

  describe('Helper Methods', () => {
    let starship: StarshipEntity;

    beforeEach(() => {
      starship = new StarshipEntity();
      starship.id = 'starship-123';
      starship.slug = 'test-starship';
      starship.ownerId = 'user-123';
      starship.class = 'scout';
      starship.name = 'Test Starship';
      starship.maxAgents = 3;
      starship.status = 'active';
      starship.createdAt = '2024-01-01T00:00:00.000Z';
      starship.updatedAt = '2024-01-01T00:00:00.000Z';
    });

    describe('Status Check Methods', () => {
      it('should correctly identify active status', () => {
        starship.status = 'active';
        expect(starship.isActive()).toBe(true);

        starship.status = 'inactive';
        expect(starship.isActive()).toBe(false);
      });

      it('should correctly identify restricted status', () => {
        starship.status = 'restricted';
        expect(starship.isRestricted()).toBe(true);

        starship.status = 'active';
        expect(starship.isRestricted()).toBe(false);
      });

      it('should correctly identify pending payment status', () => {
        starship.status = 'pending_payment';
        expect(starship.hasPendingPayment()).toBe(true);

        starship.status = 'active';
        expect(starship.hasPendingPayment()).toBe(false);
      });

      it('should correctly identify disabled status', () => {
        starship.status = 'disabled';
        expect(starship.isDisabled()).toBe(true);

        starship.status = 'active';
        expect(starship.isDisabled()).toBe(false);
      });
    });

    describe('Display Name Methods', () => {
      it('should get class display names', () => {
        starship.class = 'scout';
        expect(starship.getClassDisplayName()).toBe('Scout Class');

        starship.class = 'cruiser';
        expect(starship.getClassDisplayName()).toBe('Cruiser Class');

        starship.class = 'draught';
        expect(starship.getClassDisplayName()).toBe('Draught Class');
      });

      it('should get status display names', () => {
        starship.status = 'active';
        expect(starship.getStatusDisplayName()).toBe('Active');

        starship.status = 'pending_payment';
        expect(starship.getStatusDisplayName()).toBe('Payment Pending');

        starship.status = 'restricted';
        expect(starship.getStatusDisplayName()).toBe('Restricted');
      });
    });

    describe('Age and Time Methods', () => {
      it('should calculate age in days', () => {
        const now = Date.now();
        const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
        starship.createdAt = threeDaysAgo;

        const ageInDays = starship.getAgeInDays();
        expect(ageInDays).toBe(3);
      });

      it('should identify new starships', () => {
        const now = Date.now();
        const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
        const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

        starship.createdAt = threeDaysAgo;
        expect(starship.isNew()).toBe(true);

        starship.createdAt = tenDaysAgo;
        expect(starship.isNew()).toBe(false);
      });
    });

    describe('Payment and Plan Methods', () => {
      it('should identify Stripe integration', () => {
        expect(starship.hasStripeIntegration()).toBe(false);

        starship.subscriptionId = 'sub_123456789';
        expect(starship.hasStripeIntegration()).toBe(true);

        starship.subscriptionId = undefined;
        starship.stripeCustomerId = 'cus_123456789';
        expect(starship.hasStripeIntegration()).toBe(true);
      });

      it('should identify paid plans', () => {
        starship.class = 'scout';
        expect(starship.isPaidPlan()).toBe(false); // Scout without Stripe is free

        starship.subscriptionId = 'sub_123456789';
        expect(starship.isPaidPlan()).toBe(true); // Scout with Stripe is paid

        starship.subscriptionId = undefined;
        starship.class = 'cruiser';
        expect(starship.isPaidPlan()).toBe(true); // Cruiser is always paid
      });

      it('should get billing info', () => {
        starship.class = 'scout';
        starship.plan = 'scout';
        starship.billingPeriod = 'monthly';
        starship.status = 'active';

        const billingInfo = starship.getBillingInfo();

        expect(billingInfo.plan).toBe('Scout Class');
        expect(billingInfo.period).toBe('Monthly');
        expect(billingInfo.status).toBe('Active');
      });
    });

    describe('Capacity Management Methods', () => {
      it('should calculate available agent slots', () => {
        starship.maxAgents = 5;

        expect(starship.getAvailableAgentSlots(2)).toBe(3);
        expect(starship.getAvailableAgentSlots(5)).toBe(0);
        expect(starship.getAvailableAgentSlots(6)).toBe(0); // Should not go negative
      });

      it('should check if can add agents', () => {
        starship.maxAgents = 5;

        expect(starship.canAddAgents(2)).toBe(true);
        expect(starship.canAddAgents(5)).toBe(false);
        expect(starship.canAddAgents(6)).toBe(false);
      });

      it('should get capacity utilization', () => {
        starship.maxAgents = 5;

        const utilization = starship.getCapacityUtilization(3);

        expect(utilization.agents.used).toBe(3);
        expect(utilization.agents.max).toBe(5);
        expect(utilization.agents.percentage).toBe(60);
      });
    });

    describe('Attention Management', () => {
      it('should identify starships that need attention', () => {
        // Payment pending
        starship.status = 'pending_payment';
        expect(starship.needsAttention()).toBe(true);

        // Restricted
        starship.status = 'restricted';
        expect(starship.needsAttention()).toBe(true);

        // Disabled
        starship.status = 'disabled';
        expect(starship.needsAttention()).toBe(true);

        // Inactive for more than 30 days
        const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
        starship.createdAt = oldDate;
        starship.status = 'inactive';
        expect(starship.needsAttention()).toBe(true);

        // Active starship should not need attention
        starship.status = 'active';
        expect(starship.needsAttention()).toBe(false);
      });
    });
  });

  describe('Static Helper Methods', () => {
    describe('generateSlugFromName', () => {
      it('should generate URL-safe slug from name', () => {
        expect(StarshipEntity.generateSlugFromName('My Amazing Starship!')).toBe('my-amazing-starship');
        expect(StarshipEntity.generateSlugFromName('Test___Ship   123')).toBe('test-ship-123');
        expect(StarshipEntity.generateSlugFromName('---Start--End---')).toBe('start-end');
        expect(StarshipEntity.generateSlugFromName('')).toBe('');
      });
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'starship-123',
        slug: 'My Amazing Ship!', // Will be transformed
        ownerId: 'user-123',
        class: 'cruiser',
        name: 'Amazing Ship',
        maxAgents: undefined, // Will be auto-calculated
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        subscriptionId: 'sub_123456789',
        plan: 'cruiser',
        billingPeriod: 'yearly',
        stripeCustomerId: 'cus_123456789',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete starship data with transformations' }]);

      expect(results[0].success).toBe(true);

      // Verify transformations worked correctly
      const entity = results[0].entity as StarshipEntity;
      expect(entity.slug).toBe('my-amazing-ship');
      expect(entity.maxAgents).toBe(5); // Auto-calculated for cruiser
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(StarshipEntity, null)).toThrow();
      expect(() => fromDatabase(StarshipEntity, undefined)).toThrow();
      expect(() => fromDatabase(StarshipEntity, 'not an object')).toThrow();
    });

    it('should handle invalid transformations', async () => {
      const databaseRecord = {
        id: 'starship-123',
        slug: 123, // Non-string value
        ownerId: 'user-123',
        class: 'scout',
        name: 'Test Starship',
        maxAgents: 3,
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(StarshipEntity, databaseRecord);
      expect(entity.slug).toBe(123); // Non-string values pass through unchanged
    });
  });

  describe('Edge Cases', () => {
    it('should handle edge cases in capacity calculations', () => {
      const starship = new StarshipEntity();
      starship.maxAgents = 0; // Edge case

      expect(starship.getAvailableAgentSlots(0)).toBe(0);
      expect(starship.canAddAgents(0)).toBe(false);

      const utilization = starship.getCapacityUtilization(0);
      expect(utilization.agents.percentage).toBe(0);
    });

    it('should handle edge cases in age calculations', () => {
      const starship = new StarshipEntity();
      starship.createdAt = new Date().toISOString(); // Just created

      expect(starship.getAgeInDays()).toBe(0);
      expect(starship.isNew()).toBe(true);
    });

    it('should handle missing billing period in billing info', () => {
      const starship = new StarshipEntity();
      starship.class = 'scout';
      starship.status = 'active';

      const billingInfo = starship.getBillingInfo();
      expect(billingInfo.period).toBeUndefined();
    });
  });
});
