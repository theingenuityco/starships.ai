/**
 * StarshipEntity Unit Tests
 *
 * Tests for serialization, deserialization, validation, and helper methods
 * of the StarshipEntity class.
 */

import { StarshipEntity } from '@/entities/StarshipEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('StarshipEntity', () => {
  let testHelper: EntityTestHelper<StarshipEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(StarshipEntity, 'StarshipEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const starship = new StarshipEntity();
      starship.id = 'starship-123';
      starship.slug = 'test-starship';
      starship.ownerId = 'user-456';
      starship.class = 'scout';
      starship.name = 'Test Starship';
      starship.maxAgents = 3;
      starship.status = 'active';
      starship.createdAt = '2024-01-01T00:00:00.000Z';
      starship.updatedAt = '2024-01-02T12:00:00.000Z';

      const serialized = toDatabase(starship);

      expect(serialized).toEqual({
        id: 'starship-123',
        slug: 'test-starship',
        owner_id: 'user-456',
        class: 'scout',
        name: 'Test Starship',
        max_agents: 3,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T12:00:00.000Z',
      });
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'starship-123',
        slug: 'test-starship',
        ownerId: 'user-456',
        class: 'scout',
        name: 'Test Starship',
        maxAgents: 3,
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(StarshipEntity, databaseRecord);

      expect(entity).toBeInstanceOf(StarshipEntity);
      expect(entity.id).toBe('starship-123');
      expect(entity.slug).toBe('test-starship');
      expect(entity.class).toBe('scout');
      expect(entity.status).toBe('active');
      expect(entity.maxAgents).toBe(3);
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'starship-1',
          slug: 'starship-1',
          ownerId: 'user-456',
          class: 'scout',
          name: 'Starship 1',
          maxAgents: 3,
          status: 'active',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          id: 'starship-2',
          slug: 'starship-2',
          ownerId: 'user-789',
          class: 'cruiser',
          name: 'Starship 2',
          maxAgents: 5,
          status: 'inactive',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
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
        ownerId: 'user-456',
        class: 'scout',
        name: 'Test Starship',
        maxAgents: 3,
        status: 'active',
      };

      await expect(StarshipEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        slug: 'test-starship',
        // ownerId is missing
        class: 'scout',
        name: 'Test Starship',
      };

      await expect(StarshipEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate class enum constraints', async () => {
      await expect(
        StarshipEntity.validate({
          slug: 'test-starship',
          ownerId: 'user-456',
          class: 'invalid-class',
          name: 'Test Starship',
          maxAgents: 3,
          status: 'active',
        })
      ).rejects.toThrow();

      const validClasses = ['scout', 'cruiser', 'draught'];
      for (const starshipClass of validClasses) {
        await expect(
          StarshipEntity.validate({
            slug: 'test-starship',
            ownerId: 'user-456',
            class: starshipClass,
            name: 'Test Starship',
            maxAgents: 3,
            status: 'active',
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate status enum constraints', async () => {
      await expect(
        StarshipEntity.validate({
          slug: 'test-starship',
          ownerId: 'user-456',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 3,
          status: 'invalid-status',
        })
      ).rejects.toThrow();

      const validStatuses = ['active', 'inactive', 'restricted', 'disabled', 'pending_payment'];
      for (const status of validStatuses) {
        await expect(
          StarshipEntity.validate({
            slug: 'test-starship',
            ownerId: 'user-456',
            class: 'scout',
            name: 'Test Starship',
            maxAgents: 3,
            status,
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate maxAgents constraints', async () => {
      await expect(
        StarshipEntity.validate({
          slug: 'test-starship',
          ownerId: 'user-456',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 0,
          status: 'active',
        })
      ).rejects.toThrow();

      await expect(
        StarshipEntity.validate({
          slug: 'test-starship',
          ownerId: 'user-456',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 51,
          status: 'active',
        })
      ).rejects.toThrow();

      await expect(
        StarshipEntity.validate({
          slug: 'test-starship',
          ownerId: 'user-456',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 5,
          status: 'active',
        })
      ).resolves.not.toThrow();
    });

    it('should validate slug length constraints', async () => {
      await expect(
        StarshipEntity.validate({
          slug: '',
          ownerId: 'user-456',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 3,
          status: 'active',
        })
      ).rejects.toThrow();

      await expect(
        StarshipEntity.validate({
          slug: 'a'.repeat(101),
          ownerId: 'user-456',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 3,
          status: 'active',
        })
      ).rejects.toThrow();

      await expect(
        StarshipEntity.validate({
          slug: 'valid-slug',
          ownerId: 'user-456',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 3,
          status: 'active',
        })
      ).resolves.not.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        name: 'Updated Starship Name',
      };

      await expect(StarshipEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(StarshipEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(StarshipEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(StarshipEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Helper Methods', () => {
    describe('Status helpers', () => {
      it('should check if starship is active', () => {
        const starship = new StarshipEntity();
        starship.status = 'active';
        expect(starship.isActive()).toBe(true);

        starship.status = 'inactive';
        expect(starship.isActive()).toBe(false);
      });

      it('should check if starship is restricted', () => {
        const starship = new StarshipEntity();
        starship.status = 'restricted';
        expect(starship.isRestricted()).toBe(true);

        starship.status = 'active';
        expect(starship.isRestricted()).toBe(false);
      });

      it('should check if starship has pending payment', () => {
        const starship = new StarshipEntity();
        starship.status = 'pending_payment';
        expect(starship.hasPendingPayment()).toBe(true);

        starship.status = 'active';
        expect(starship.hasPendingPayment()).toBe(false);
      });

      it('should check if starship is disabled', () => {
        const starship = new StarshipEntity();
        starship.status = 'disabled';
        expect(starship.isDisabled()).toBe(true);

        starship.status = 'active';
        expect(starship.isDisabled()).toBe(false);
      });
    });

    describe('Display name helpers', () => {
      it('should get class display name', () => {
        const starship = new StarshipEntity();

        starship.class = 'scout';
        expect(starship.getClassDisplayName()).toBe('Scout Class');

        starship.class = 'cruiser';
        expect(starship.getClassDisplayName()).toBe('Cruiser Class');

        starship.class = 'draught';
        expect(starship.getClassDisplayName()).toBe('Draught Class');
      });

      it('should get status display name', () => {
        const starship = new StarshipEntity();

        starship.status = 'active';
        expect(starship.getStatusDisplayName()).toBe('Active');

        starship.status = 'inactive';
        expect(starship.getStatusDisplayName()).toBe('Inactive');

        starship.status = 'restricted';
        expect(starship.getStatusDisplayName()).toBe('Restricted');

        starship.status = 'disabled';
        expect(starship.getStatusDisplayName()).toBe('Disabled');

        starship.status = 'pending_payment';
        expect(starship.getStatusDisplayName()).toBe('Payment Pending');
      });
    });

    describe('Age and lifecycle helpers', () => {
      it('should get age in days', () => {
        const starship = new StarshipEntity();
        starship.createdAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

        const age = starship.getAgeInDays();
        expect(age).toBeGreaterThanOrEqual(4);
        expect(age).toBeLessThanOrEqual(5);
      });

      it('should check if starship is new', () => {
        const starship = new StarshipEntity();

        starship.createdAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        expect(starship.isNew()).toBe(true);

        starship.createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        expect(starship.isNew()).toBe(false);
      });
    });

    describe('Agent capacity helpers', () => {
      it('should get available agent slots', () => {
        const starship = new StarshipEntity();
        starship.maxAgents = 5;

        expect(starship.getAvailableAgentSlots(2)).toBe(3);
        expect(starship.getAvailableAgentSlots(5)).toBe(0);
        expect(starship.getAvailableAgentSlots(10)).toBe(0); // Should not go negative
      });

      it('should check if starship can add agents', () => {
        const starship = new StarshipEntity();
        starship.maxAgents = 5;

        expect(starship.canAddAgents(2)).toBe(true);
        expect(starship.canAddAgents(5)).toBe(false);
        expect(starship.canAddAgents(10)).toBe(false);
      });

      it('should get capacity utilization', () => {
        const starship = new StarshipEntity();
        starship.maxAgents = 10;

        const utilization = starship.getCapacityUtilization(7);
        expect(utilization.agents.used).toBe(7);
        expect(utilization.agents.max).toBe(10);
        expect(utilization.agents.percentage).toBe(70);
      });
    });

    describe('Utility helpers', () => {
      it('should generate slug from name', () => {
        expect(StarshipEntity.generateSlugFromName('My Starship')).toBe('my-starship');
        expect(StarshipEntity.generateSlugFromName('Test  Multiple   Spaces')).toBe('test-multiple-spaces');
        expect(StarshipEntity.generateSlugFromName('Special@#$Characters')).toBe('specialcharacters');
        expect(StarshipEntity.generateSlugFromName('  Leading and Trailing  ')).toBe('leading-and-trailing');
        expect(StarshipEntity.generateSlugFromName('under_score')).toBe('under-score');
      });

      it('should check if starship needs attention', () => {
        const starship = new StarshipEntity();
        starship.createdAt = new Date().toISOString();

        starship.status = 'active';
        expect(starship.needsAttention()).toBe(false);

        starship.status = 'pending_payment';
        expect(starship.needsAttention()).toBe(true);

        starship.status = 'restricted';
        expect(starship.needsAttention()).toBe(true);

        starship.status = 'disabled';
        expect(starship.needsAttention()).toBe(true);

        starship.status = 'inactive';
        starship.createdAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
        expect(starship.needsAttention()).toBe(true);

        starship.createdAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
        expect(starship.needsAttention()).toBe(false);
      });
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'starship-123',
        slug: 'premium-starship',
        ownerId: 'user-456',
        class: 'draught',
        name: 'Premium Starship',
        maxAgents: 10,
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete starship data' }]);

      expect(results[0].success).toBe(true);
    });

    it('should handle round-trip with minimal data', async () => {
      const minimalData = {
        id: 'starship-123',
        slug: 'basic-starship',
        ownerId: 'user-456',
        class: 'scout',
        name: 'Basic Starship',
        maxAgents: 3,
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: minimalData, description: 'minimal starship data' }]);

      expect(results[0].success).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(StarshipEntity, null)).toThrow();
      expect(() => fromDatabase(StarshipEntity, undefined)).toThrow();
      expect(() => fromDatabase(StarshipEntity, 'not an object')).toThrow();
    });

    it('should handle empty array deserialization', async () => {
      const emptyArray: never[] = [];
      const entities = fromDatabaseArray(StarshipEntity, emptyArray);

      expect(entities).toHaveLength(0);
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle all valid classes', async () => {
      const classes = ['scout', 'cruiser', 'draught'];

      for (const starshipClass of classes) {
        const record = {
          id: 'starship-123',
          slug: `starship-${starshipClass}`,
          ownerId: 'user-456',
          class: starshipClass,
          name: `Starship ${starshipClass}`,
          maxAgents: 3,
          status: 'active',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(StarshipEntity, record);
        expect(entity.class).toBe(starshipClass);
      }
    });

    it('should handle all valid statuses', async () => {
      const statuses = ['active', 'inactive', 'restricted', 'disabled', 'pending_payment'];

      for (const status of statuses) {
        const record = {
          id: 'starship-123',
          slug: 'test-starship',
          ownerId: 'user-456',
          class: 'scout',
          name: 'Test Starship',
          maxAgents: 3,
          status,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(StarshipEntity, record);
        expect(entity.status).toBe(status);
      }
    });

    it('should handle special characters in name and slug', async () => {
      const specialNames = [
        { name: 'Starship with special chars', expectedSlug: 'starship-with-special-chars' },
        { name: 'Test "quoted" name', expectedSlug: 'test-quoted-name' },
        { name: 'Mixed: English text', expectedSlug: 'mixed-english-text' },
      ];

      for (const { name, expectedSlug } of specialNames) {
        const record = {
          id: 'starship-123',
          slug: StarshipEntity.generateSlugFromName(name),
          ownerId: 'user-456',
          class: 'scout',
          name,
          maxAgents: 3,
          status: 'active',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(StarshipEntity, record);
        expect(entity.name).toBe(name);
        expect(entity.slug).toBe(expectedSlug);
      }
    });

    it('should handle edge case agent counts', async () => {
      const starship = new StarshipEntity();
      starship.maxAgents = 1;

      expect(starship.getAvailableAgentSlots(0)).toBe(1);
      expect(starship.getAvailableAgentSlots(1)).toBe(0);

      starship.maxAgents = 50;
      expect(starship.getAvailableAgentSlots(25)).toBe(25);
      expect(starship.getCapacityUtilization(25).agents.percentage).toBe(50);
    });
  });
});
