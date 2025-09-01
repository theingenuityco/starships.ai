/**
 * StarshipRepository Unit Tests
 */

import { StarshipRepository } from '../StarshipRepository';
import { ValidationError, NotFoundError } from '../../helpers/errors';
import { StarshipModel } from '@starships/protocol';

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(() => ({
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
  }))
}));

import { getConnection } from '../../helpers/database';

describe('StarshipRepository', () => {
  let repository: StarshipRepository;
  let mockConnection: any;

  beforeEach(() => {
    repository = new StarshipRepository();
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as any).serviceName).toBe('StarshipRepository');
    });
  });

  describe('validateUUID', () => {
    it('should validate valid UUID', () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      
      expect(() => {
        (repository as any).validateUUID(validUUID, 'id');
      }).not.toThrow();
    });

    it('should throw ValidationError for invalid UUID', () => {
      const invalidUUID = 'invalid-uuid';
      
      expect(() => {
        (repository as any).validateUUID(invalidUUID, 'id');
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for missing UUID', () => {
      expect(() => {
        (repository as any).validateUUID('', 'id');
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for non-string UUID', () => {
      expect(() => {
        (repository as any).validateUUID(123 as any, 'id');
      }).toThrow(ValidationError);
    });
  });

  describe('findAll', () => {
    it('should return all starships ordered by creation date', async () => {
      const mockStarships = [
        global.createMockStarship({ id: 'starship-1', name: 'Ship One' }),
        global.createMockStarship({ id: 'starship-2', name: 'Ship Two' })
      ];

      mockConnection.executeQuery.mockResolvedValue([
        { s: mockStarships[0] },
        { s: mockStarships[1] }
      ]);

      const result = await repository.findAll();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (s:Starship) RETURN s ORDER BY s.createdAt DESC'
      );
      expect(result).toEqual(mockStarships);
    });

    it('should return empty array when no starships found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return starship by ID', async () => {
      const mockStarship = global.createMockStarship();
      mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]);

      const result = await repository.findById('starship-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (s:Starship) WHERE s.id = $id RETURN s',
        { id: 'starship-123' }
      );
      expect(result).toEqual(mockStarship);
    });

    it('should return null when starship not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should validate required ID parameter', async () => {
      await expect(repository.findById('')).rejects.toThrow(ValidationError);
    });
  });

  describe('findBySlug', () => {
    it('should return starship by slug and owner ID', async () => {
      const mockStarship = global.createMockStarship({ slug: 'test-ship' });
      mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]);

      const result = await repository.findBySlug('test-ship', 'owner-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId RETURN s',
        { slug: 'test-ship', ownerId: 'owner-123' }
      );
      expect(result).toEqual(mockStarship);
    });

    it('should validate required parameters', async () => {
      await expect(repository.findBySlug('', 'owner-123')).rejects.toThrow(ValidationError);
      await expect(repository.findBySlug('slug', '')).rejects.toThrow(ValidationError);
    });
  });

  describe('findByOwner', () => {
    it('should return starships by owner ID', async () => {
      const mockStarships = [
        global.createMockStarship({ ownerId: 'owner-123', name: 'Ship A' }),
        global.createMockStarship({ ownerId: 'owner-123', name: 'Ship B' })
      ];

      mockConnection.executeQuery.mockResolvedValue([
        { s: mockStarships[0] },
        { s: mockStarships[1] }
      ]);

      const result = await repository.findByOwner('owner-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (s:Starship) WHERE s.ownerId = $ownerId RETURN s ORDER BY s.createdAt DESC',
        { ownerId: 'owner-123' }
      );
      expect(result).toEqual(mockStarships);
    });
  });

  describe('create', () => {
    it('should create starship with scout class defaults', async () => {
      const starshipData = {
        name: 'Test Scout',
        ownerId: 'owner-123',
        class: 'scout' as const,
        status: 'active' as const
      };

      mockConnection.executeWrite.mockResolvedValueOnce([]); // CREATE starship
      mockConnection.executeWrite.mockResolvedValueOnce([]); // CREATE relationship

      // Mock slug generation
      jest.spyOn(repository as any, 'generateUniqueSlug').mockResolvedValue('test-scout');

      await repository.create(starshipData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'CREATE (s:Starship $props) RETURN s',
        {
          props: expect.objectContaining({
            name: 'Test Scout',
            ownerId: 'owner-123',
            class: 'scout',
            maxAgents: 3,
            maxActiveMissions: 3,
            slug: 'test-scout',
            status: 'active'
          })
        }
      );
    });

    it('should create starship with cruiser class defaults', async () => {
      const starshipData = {
        name: 'Test Cruiser',
        ownerId: 'owner-123',
        class: 'cruiser' as const,
        status: 'active' as const
      };

      mockConnection.executeWrite.mockResolvedValueOnce([]);
      mockConnection.executeWrite.mockResolvedValueOnce([]);

      jest.spyOn(repository as any, 'generateUniqueSlug').mockResolvedValue('test-cruiser');

      await repository.create(starshipData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'CREATE (s:Starship $props) RETURN s',
        {
          props: expect.objectContaining({
            maxAgents: 5,
            maxActiveMissions: 6
          })
        }
      );
    });

    it('should create starship with draught class defaults', async () => {
      const starshipData = {
        name: 'Test Draught',
        ownerId: 'owner-123',
        class: 'draught' as const,
        status: 'active' as const
      };

      mockConnection.executeWrite.mockResolvedValueOnce([]);
      mockConnection.executeWrite.mockResolvedValueOnce([]);

      jest.spyOn(repository as any, 'generateUniqueSlug').mockResolvedValue('test-draught');

      await repository.create(starshipData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'CREATE (s:Starship $props) RETURN s',
        {
          props: expect.objectContaining({
            maxAgents: 10,
            maxActiveMissions: 10
          })
        }
      );
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        name: 'Test Ship'
        // Missing ownerId and class
      };

      await expect(repository.create(incompleteData as any)).rejects.toThrow(ValidationError);
    });

    it('should create owner relationship after starship creation', async () => {
      const starshipData = {
        name: 'Test Ship',
        ownerId: 'owner-123',
        class: 'scout' as const,
        status: 'active' as const
      };

      mockConnection.executeWrite.mockResolvedValueOnce([]);
      mockConnection.executeWrite.mockResolvedValueOnce([]);

      jest.spyOn(repository as any, 'generateUniqueSlug').mockResolvedValue('test-ship');

      await repository.create(starshipData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (u)-[:OWNS {ownedSince: $timestamp}]->(s)'),
        expect.objectContaining({
          ownerId: 'owner-123',
          starshipId: expect.any(String),
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('update', () => {
    it('should update starship successfully', async () => {
      const updates = {
        name: 'Updated Name',
        description: 'Updated description'
      };

      const updatedStarship = global.createMockStarship({
        id: 'starship-123',
        ...updates
      });

      mockConnection.executeWrite.mockResolvedValue([{ s: updatedStarship }]);

      const result = await repository.update('starship-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (s:Starship) WHERE s.id = $id SET s += $updates RETURN s',
        {
          id: 'starship-123',
          updates: expect.objectContaining({
            ...updates,
            updatedAt: expect.any(String)
          })
        }
      );
      expect(result).toEqual(updatedStarship);
    });

    it('should generate new slug when name is updated', async () => {
      const updates = { name: 'New Ship Name' };
      const existingStarship = global.createMockStarship({ ownerId: 'owner-123' });

      jest.spyOn(repository, 'findById').mockResolvedValue(existingStarship);
      jest.spyOn(repository as any, 'generateUniqueSlug').mockResolvedValue('new-ship-name');

      mockConnection.executeWrite.mockResolvedValue([{ s: existingStarship }]);

      await repository.update('starship-123', updates);

      expect(repository.findById).toHaveBeenCalledWith('starship-123');
      expect((repository as any).generateUniqueSlug).toHaveBeenCalledWith('New Ship Name', 'owner-123');
    });

    it('should return null when starship not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('non-existent', { name: 'New Name' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete starship successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('starship-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (s:Starship) WHERE s.id = $id DETACH DELETE s RETURN count(s) as deletedCount',
        { id: 'starship-123' }
      );
      expect(result).toBe(true);
    });

    it('should return false when starship does not exist', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('deployAgent', () => {
    it('should deploy agent to starship with available slots', async () => {
      jest.spyOn(repository, 'getAvailableSlots').mockResolvedValue(2);
      mockConnection.executeQuery.mockResolvedValue([]); // No existing deployment
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.deployAgent('starship-123', 'agent-456');

      expect(repository.getAvailableSlots).toHaveBeenCalledWith('starship-123');
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (a)-[:DEPLOYED_ON'),
        expect.objectContaining({
          starshipId: 'starship-123',
          agentId: 'agent-456',
          timestamp: expect.any(String)
        })
      );
      expect(result).toBe(true);
    });

    it('should throw error when no available slots', async () => {
      jest.spyOn(repository, 'getAvailableSlots').mockResolvedValue(0);

      await expect(
        repository.deployAgent('starship-123', 'agent-456')
      ).rejects.toThrow('No available slots on this starship');
    });

    it('should throw error when agent already deployed', async () => {
      jest.spyOn(repository, 'getAvailableSlots').mockResolvedValue(2);
      mockConnection.executeQuery.mockResolvedValue([{ r: {} }]); // Existing deployment

      await expect(
        repository.deployAgent('starship-123', 'agent-456')
      ).rejects.toThrow('Agent is already deployed on this starship');
    });

    it('should validate required parameters', async () => {
      await expect(repository.deployAgent('', 'agent-456')).rejects.toThrow('Starship ID is required');
      await expect(repository.deployAgent('starship-123', '')).rejects.toThrow('Agent ID is required');
    });
  });

  describe('removeAgent', () => {
    it('should remove agent from starship successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.removeAgent('starship-123', 'agent-456');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DELETE r'),
        { starshipId: 'starship-123', agentId: 'agent-456' }
      );
      expect(result).toBe(true);
    });

    it('should return false when relationship does not exist', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.removeAgent('starship-123', 'agent-456');

      expect(result).toBe(false);
    });
  });

  describe('getAvailableSlots', () => {
    it('should calculate available slots correctly', async () => {
      mockConnection.executeQuery.mockResolvedValue([
        { maxAgents: 5, deployedCount: 2 }
      ]);

      const result = await repository.getAvailableSlots('starship-123');

      expect(result).toBe(3);
    });

    it('should handle no deployed agents', async () => {
      mockConnection.executeQuery.mockResolvedValue([
        { maxAgents: 3, deployedCount: 0 }
      ]);

      const result = await repository.getAvailableSlots('starship-123');

      expect(result).toBe(3);
    });
  });

  describe('slug generation', () => {
    describe('createSlugFromName', () => {
      it('should create slug from name', () => {
        const result = (repository as any).createSlugFromName('My Test Ship!');

        expect(result).toBe('my-test-ship');
      });

      it('should handle special characters', () => {
        const result = (repository as any).createSlugFromName('Ship@#$%Name');

        expect(result).toBe('shipname');
      });

      it('should handle multiple spaces and hyphens', () => {
        const result = (repository as any).createSlugFromName('Ship   Name---Test');

        expect(result).toBe('ship-name-test');
      });
    });

    describe('isSlugAvailable', () => {
      it('should return true when slug is available', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 0 }]);

        const result = await repository.isSlugAvailable('test-slug', 'owner-123');

        expect(result).toBe(true);
      });

      it('should return false when slug is taken', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]);

        const result = await repository.isSlugAvailable('taken-slug', 'owner-123');

        expect(result).toBe(false);
      });

      it('should exclude specific ID when checking availability', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 0 }]);

        await repository.isSlugAvailable('test-slug', 'owner-123', 'exclude-id');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('AND s.id <> $excludeId'),
          expect.objectContaining({ excludeId: 'exclude-id' })
        );
      });
    });

    describe('generateUniqueSlug', () => {
      it('should return base slug when available', async () => {
        jest.spyOn(repository as any, 'isSlugAvailable').mockResolvedValue(true);

        const result = await repository.generateUniqueSlug('Test Ship', 'owner-123');

        expect(result).toBe('test-ship');
      });

      it('should generate optimized slug when base is taken', async () => {
        jest.spyOn(repository as any, 'isSlugAvailable')
          .mockResolvedValueOnce(false) // Base slug taken
          .mockResolvedValueOnce(true); // Optimized slug available

        const result = await repository.generateUniqueSlug('Test Ship', 'owner-123');

        expect(result).toMatch(/^test-ship-[a-z0-9]+-[a-z0-9]{6}$/);
      });

      it('should use fallback UUID when optimized slug is also taken', async () => {
        jest.spyOn(repository as any, 'isSlugAvailable')
          .mockResolvedValueOnce(false) // Base slug taken
          .mockResolvedValueOnce(false); // Optimized slug taken

        const result = await repository.generateUniqueSlug('Test Ship', 'owner-123');

        expect(result).toMatch(/^test-ship-[a-z0-9]{8}$/);
      });

      it('should validate required parameters', async () => {
        await expect(repository.generateUniqueSlug('', 'owner-123')).rejects.toThrow('Name parameter is required');
        await expect(repository.generateUniqueSlug('Test', '')).rejects.toThrow('Owner ID parameter is required');
      });
    });
  });

  describe('Stripe integration', () => {
    describe('findBySubscriptionId', () => {
      it('should return starship by subscription ID', async () => {
        const mockStarship = global.createMockStarship({ subscriptionId: 'sub_123' });
        mockConnection.executeQuery.mockResolvedValue([{ starship: mockStarship }]);

        const result = await repository.findBySubscriptionId('sub_123');

        expect(result).toEqual(mockStarship);
      });

      it('should return null when not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findBySubscriptionId('sub_nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('updateSubscription', () => {
      it('should update subscription details', async () => {
        const updates = {
          subscriptionId: 'sub_123',
          status: 'active' as const,
          plan: 'cruiser' as const
        };

        mockConnection.executeWrite.mockResolvedValue([]);

        await repository.updateSubscription('starship-123', updates);

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('SET starship.subscriptionId = $subscriptionId'),
          expect.objectContaining({
            starshipId: 'starship-123',
            ...updates
          })
        );
      });
    });

    describe('countFreeStarships', () => {
      it('should count free starships for user', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 2 }]);

        const result = await repository.countFreeStarships('user-123');

        expect(result).toBe(2);
      });
    });
  });

  describe('webhook idempotency', () => {
    describe('isEventProcessed', () => {
      it('should return true when event was processed', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ e: {} }]);

        const result = await repository.isEventProcessed('evt_123');

        expect(result).toBe(true);
      });

      it('should return false when event was not processed', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.isEventProcessed('evt_new');

        expect(result).toBe(false);
      });
    });

    describe('markEventProcessed', () => {
      it('should mark event as processed', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        await repository.markEventProcessed('evt_123', 'customer.subscription.created');

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('CREATE (e:StripeEvent'),
          expect.objectContaining({
            eventId: 'evt_123',
            eventType: 'customer.subscription.created'
          })
        );
      });
    });
  });

  describe('memory management', () => {
    describe('getMemories', () => {
      it('should return starship memories', async () => {
        const mockMemories = [
          { id: 'mem-1', content: 'Memory 1' },
          { id: 'mem-2', content: 'Memory 2' }
        ];

        mockConnection.executeQuery.mockResolvedValue([
          { m: mockMemories[0] },
          { m: mockMemories[1] }
        ]);

        const result = await repository.getMemories('starship-123');

        expect(result).toEqual(mockMemories);
        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory)'),
          { starshipId: 'starship-123' }
        );
      });
    });

    describe('getMemoryCount', () => {
      it('should return memory count', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 5 }]);

        const result = await repository.getMemoryCount('starship-123');

        expect(result).toBe(5);
      });
    });

    describe('removeMemory', () => {
      it('should remove memory successfully', async () => {
        mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

        const result = await repository.removeMemory('starship-123', 'memory-456');

        expect(result).toBe(true);
        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('DETACH DELETE m'),
          { starshipId: 'starship-123', memoryId: 'memory-456' }
        );
      });
    });
  });

  describe('error scenarios', () => {
    it('should handle database connection errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Connection failed'));

      await expect(repository.findById('starship-123')).rejects.toThrow();
    });

    it('should handle constraint violations', async () => {
      const error = new Error('unique constraint violation');
      mockConnection.executeWrite.mockRejectedValue(error);

      const starshipData = {
        name: 'Test Ship',
        ownerId: 'owner-123',
        class: 'scout' as const,
        status: 'active' as const
      };

      await expect(repository.create(starshipData)).rejects.toThrow();
    });

    it('should handle validation errors properly', async () => {
      await expect(repository.findById('')).rejects.toThrow(ValidationError);
      await expect(repository.findBySlug('', 'owner')).rejects.toThrow(ValidationError);
      await expect(repository.findByOwner('')).rejects.toThrow(ValidationError);
    });
  });
});