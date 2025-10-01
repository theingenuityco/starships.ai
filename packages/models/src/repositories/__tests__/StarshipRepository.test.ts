/**
 * StarshipRepository Unit Tests
 */

import 'reflect-metadata';
import { StarshipRepository } from '../StarshipRepository';
import { StarshipEntity } from '@/entities/StarshipEntity';
import { DatabaseError } from '@starships/errors';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';

// Mock nanoid for predictable IDs
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-starship-id-123'),
}));

// Mock the database connection
jest.mock('@/helpers/database', () => ({
  getConnection: jest.fn(),
}));

// Mock entity validation
jest.spyOn(StarshipEntity, 'validate').mockResolvedValue(undefined);

describe('StarshipRepository', () => {
  let repository: StarshipRepository;
  let testHelper: RepositoryTestHelper;

  beforeEach(() => {
    testHelper = new RepositoryTestHelper();
    repository = new StarshipRepository();
    testHelper.reset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as unknown as { serviceName: string }).serviceName).toBe('StarshipRepository');
    });
  });

  describe('findAll', () => {
    it('should return all starships ordered by creation date', async () => {
      const mockStarships = [
        {
          id: 'starship-1',
          name: 'Starship 1',
          slug: 'starship-1',
          owner_id: 'user-123',
          class: 'scout',
          max_agents: 3,
          status: 'active',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'starship-2',
          name: 'Starship 2',
          slug: 'starship-2',
          owner_id: 'user-123',
          class: 'cruiser',
          max_agents: 5,
          status: 'active',
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockStarships);

      const result = await repository.findAll();

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM starships ORDER BY created_at DESC');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Starship 1');
      expect(result[1].name).toBe('Starship 2');
    });

    it('should handle empty result', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();
      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });
  });

  describe('findById', () => {
    it('should return starship by id', async () => {
      const mockStarship = {
        id: 'starship-1',
        name: 'Test Starship',
        slug: 'test-starship',
        owner_id: 'user-123',
        class: 'scout',
        max_agents: 3,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockStarship]);

      const result = await repository.findById('starship-1');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM starships WHERE id = $1', ['starship-1']);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Test Starship');
    });

    it('should return null when starship not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should return starship by slug and owner', async () => {
      const mockStarship = {
        id: 'starship-1',
        name: 'Test Starship',
        slug: 'test-starship',
        owner_id: 'user-123',
        class: 'scout',
        max_agents: 3,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockStarship);

      const result = await repository.findBySlug('test-starship', 'user-123');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith('SELECT * FROM starships WHERE slug = $1 AND owner_id = $2', [
        'test-starship',
        'user-123',
      ]);
      expect(result).not.toBeNull();
      expect(result!.slug).toBe('test-starship');
    });

    it('should return null when not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.findBySlug('nonexistent', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('findByOwner', () => {
    it('should return starships by owner', async () => {
      const mockStarships = [
        {
          id: 'starship-1',
          name: 'Starship 1',
          slug: 'starship-1',
          owner_id: 'user-123',
          class: 'scout',
          max_agents: 3,
          status: 'active',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockStarships);

      const result = await repository.findByOwner('user-123');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM starships WHERE owner_id = $1 ORDER BY created_at DESC', [
        'user-123',
      ]);
      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should create starship with scout class (3 agents)', async () => {
      const createData = {
        name: 'Test Starship',
        ownerId: 'user-123',
        class: 'scout' as const,
        status: 'active' as const,
      };

      const mockCreatedStarship = {
        id: 'test-starship-id-123',
        name: 'Test Starship',
        slug: 'test-starship',
        owner_id: 'user-123',
        class: 'scout',
        max_agents: 3,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreatedStarship]);

      const result = await repository.create(createData);

      expect(StarshipEntity.validate).toHaveBeenCalled();
      expect(result.name).toBe('Test Starship');
      expect(result.maxAgents).toBe(3);
    });

    it('should create starship with cruiser class (5 agents)', async () => {
      const createData = {
        name: 'Cruiser Ship',
        ownerId: 'user-123',
        class: 'cruiser' as const,
        status: 'active' as const,
      };

      const mockCreatedStarship = {
        id: 'test-starship-id-123',
        name: 'Cruiser Ship',
        slug: 'cruiser-ship',
        owner_id: 'user-123',
        class: 'cruiser',
        max_agents: 5,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreatedStarship]);

      const result = await repository.create(createData);

      expect(result.maxAgents).toBe(5);
    });

    it('should create starship with draught class (10 agents)', async () => {
      const createData = {
        name: 'Draught Ship',
        ownerId: 'user-123',
        class: 'draught' as const,
        status: 'active' as const,
      };

      const mockCreatedStarship = {
        id: 'test-starship-id-123',
        name: 'Draught Ship',
        slug: 'draught-ship',
        owner_id: 'user-123',
        class: 'draught',
        max_agents: 10,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreatedStarship]);

      const result = await repository.create(createData);

      expect(result.maxAgents).toBe(10);
    });

    it('should use provided slug if given', async () => {
      const createData = {
        name: 'Test Starship',
        slug: 'custom-slug',
        ownerId: 'user-123',
        class: 'scout' as const,
        status: 'active' as const,
      };

      const mockCreatedStarship = {
        id: 'test-starship-id-123',
        name: 'Test Starship',
        slug: 'custom-slug',
        owner_id: 'user-123',
        class: 'scout',
        max_agents: 3,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreatedStarship]);

      const result = await repository.create(createData);

      expect(result.slug).toBe('custom-slug');
    });
  });

  describe('update', () => {
    it('should update starship successfully', async () => {
      const updates = { name: 'Updated Name' };
      const mockUpdated = {
        id: 'starship-1',
        name: 'Updated Name',
        slug: 'updated-name',
        owner_id: 'user-123',
        class: 'scout',
        max_agents: 3,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockUpdated]);

      const result = await repository.update('starship-1', updates);

      expect(StarshipEntity.validate).toHaveBeenCalledWith(updates, 'update');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated Name');
    });

    it('should return null when starship not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.update('nonexistent', { name: 'Updated' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete starship successfully', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 1 } as unknown as unknown[]);

      const result = await repository.delete('starship-1');

      expect(result).toBe(true);
    });

    it('should return false when starship not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 0 } as unknown as unknown[]);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getDeployedAgents', () => {
    it('should return deployed agents for starship', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          starship_id: 'starship-123',
          deployed_at: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockAgents);

      const result = await repository.getDeployedAgents('starship-123');

      expect(result).toHaveLength(1);
    });

    it('should throw error for missing starshipId', async () => {
      await expect(repository.getDeployedAgents('')).rejects.toThrow('Starship ID is required');
    });
  });

  describe('deployAgent', () => {
    it('should deploy agent successfully', async () => {
      // Mock available slots check
      testHelper.mockConnection.queryOne.mockResolvedValueOnce({
        max_agents: '3',
        deployed_count: '1',
      });

      // Mock existing deployment check
      testHelper.mockConnection.queryOne.mockResolvedValueOnce(null);

      // Mock deployment update
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.deployAgent('starship-123', 'agent-456');

      expect(result).toBe(true);
    });

    it('should throw error when no slots available', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({
        max_agents: '3',
        deployed_count: '3',
      });

      await expect(repository.deployAgent('starship-123', 'agent-456')).rejects.toThrow('No available slots on this starship');
    });

    it('should throw error when agent already deployed', async () => {
      testHelper.mockConnection.queryOne
        .mockResolvedValueOnce({
          max_agents: '3',
          deployed_count: '1',
        })
        .mockResolvedValueOnce({ id: 'agent-456' });

      await expect(repository.deployAgent('starship-123', 'agent-456')).rejects.toThrow('Agent is already deployed on this starship');
    });

    it('should throw error for missing parameters', async () => {
      await expect(repository.deployAgent('', 'agent-456')).rejects.toThrow('Starship ID is required');
      await expect(repository.deployAgent('starship-123', '')).rejects.toThrow('Agent ID is required');
    });
  });

  describe('removeAgent', () => {
    it('should remove agent successfully', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 1 } as unknown as unknown[]);

      const result = await repository.removeAgent('starship-123', 'agent-456');

      expect(result).toBe(true);
    });

    it('should return false when agent not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 0 } as unknown as unknown[]);

      const result = await repository.removeAgent('starship-123', 'nonexistent');

      expect(result).toBe(false);
    });

    it('should throw error for missing parameters', async () => {
      await expect(repository.removeAgent('', 'agent-456')).rejects.toThrow('Starship ID is required');
      await expect(repository.removeAgent('starship-123', '')).rejects.toThrow('Agent ID is required');
    });
  });

  describe('getAvailableSlots', () => {
    it('should return available slots', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({
        max_agents: '5',
        deployed_count: '2',
      });

      const result = await repository.getAvailableSlots('starship-123');

      expect(result).toBe(3);
    });

    it('should return 0 when fully deployed', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({
        max_agents: '3',
        deployed_count: '3',
      });

      const result = await repository.getAvailableSlots('starship-123');

      expect(result).toBe(0);
    });

    it('should throw error for missing starshipId', async () => {
      await expect(repository.getAvailableSlots('')).rejects.toThrow('Starship ID is required');
    });
  });

  describe('updateStatus', () => {
    it('should update starship status', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 1 } as unknown as unknown[]);

      const result = await repository.updateStatus('starship-123', 'inactive');

      expect(result).toBe(true);
    });

    it('should return false when starship not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 0 } as unknown as unknown[]);

      const result = await repository.updateStatus('nonexistent', 'inactive');

      expect(result).toBe(false);
    });
  });

  describe('slug generation', () => {
    describe('createSlugFromName', () => {
      it('should create slug from name', () => {
        expect(repository.createSlugFromName('Test Starship')).toBe('test-starship');
        expect(repository.createSlugFromName('My Cool Ship!')).toBe('my-cool-ship');
        expect(repository.createSlugFromName('  Extra   Spaces  ')).toBe('extra-spaces');
      });

      it('should handle special characters', () => {
        expect(repository.createSlugFromName('Ship #1 @Test')).toBe('ship-1-test');
      });

      it('should handle multiple hyphens', () => {
        expect(repository.createSlugFromName('ship---name')).toBe('ship-name');
      });
    });

    describe('isSlugAvailable', () => {
      it('should return true when slug is available', async () => {
        testHelper.mockConnection.queryOne.mockResolvedValue({ count: '0' });

        const result = await repository.isSlugAvailable('new-slug', 'user-123');

        expect(result).toBe(true);
      });

      it('should return false when slug is taken', async () => {
        testHelper.mockConnection.queryOne.mockResolvedValue({ count: '1' });

        const result = await repository.isSlugAvailable('existing-slug', 'user-123');

        expect(result).toBe(false);
      });

      it('should exclude specific id when provided', async () => {
        testHelper.mockConnection.queryOne.mockResolvedValue({ count: '0' });

        await repository.isSlugAvailable('slug', 'user-123', 'starship-123');

        expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith(expect.stringContaining('AND id != $3'), [
          'slug',
          'user-123',
          'starship-123',
        ]);
      });

      it('should throw error for missing parameters', async () => {
        await expect(repository.isSlugAvailable('', 'user-123')).rejects.toThrow('Slug parameter is required');
        await expect(repository.isSlugAvailable('slug', '')).rejects.toThrow('Owner ID parameter is required');
      });
    });
  });

  describe('Stripe integration', () => {
    describe('findBySubscriptionId', () => {
      it('should find starship by subscription id', async () => {
        const mockStarship = {
          id: 'starship-1',
          subscription_id: 'sub_123',
          name: 'Test',
          slug: 'test',
          owner_id: 'user-123',
          class: 'scout',
          max_agents: 3,
          status: 'active',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        };

        testHelper.mockConnection.queryOne.mockResolvedValue(mockStarship);

        const result = await repository.findBySubscriptionId('sub_123');

        expect(result).not.toBeNull();
      });
    });

    describe('updateSubscription', () => {
      it('should update subscription details', async () => {
        testHelper.mockConnection.query.mockResolvedValue([]);

        await repository.updateSubscription('starship-123', {
          subscriptionId: 'sub_123',
          status: 'active',
        });

        expect(testHelper.mockConnection.query).toHaveBeenCalled();
      });
    });

    describe('countFreeStarships', () => {
      it('should count free starships for user', async () => {
        testHelper.mockConnection.queryOne.mockResolvedValue({ count: '2' });

        const result = await repository.countFreeStarships('user-123');

        expect(result).toBe(2);
      });
    });

    describe('findByStripeCustomerId', () => {
      it('should find starship by stripe customer id', async () => {
        const mockStarship = {
          id: 'starship-1',
          stripe_customer_id: 'cus_123',
          name: 'Test',
          slug: 'test',
          owner_id: 'user-123',
          class: 'scout',
          max_agents: 3,
          status: 'active',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        };

        testHelper.mockConnection.queryOne.mockResolvedValue(mockStarship);

        const result = await repository.findByStripeCustomerId('cus_123');

        expect(result).not.toBeNull();
      });
    });
  });

  describe('conversation methods', () => {
    describe('getConversations', () => {
      it('should get conversations for starship', async () => {
        const mockConversations = [
          {
            id: 'conv-1',
            starship_id: 'starship-123',
            title: 'Conv 1',
            status: 'active',
            created_at: '2024-01-01T00:00:00.000Z',
          },
        ];

        testHelper.mockConnection.query.mockResolvedValue(mockConversations);

        const result = await repository.getConversations('starship-123');

        expect(result).toHaveLength(1);
      });

      it('should throw error for missing starshipId', async () => {
        await expect(repository.getConversations('')).rejects.toThrow('Starship ID is required');
      });
    });

    describe('getConversationCount', () => {
      it('should get conversation count', async () => {
        testHelper.mockConnection.queryOne.mockResolvedValue({ count: '5' });

        const result = await repository.getConversationCount('starship-123');

        expect(result).toBe(5);
      });
    });
  });
});
