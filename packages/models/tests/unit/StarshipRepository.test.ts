import { StarshipRepository } from '../../src/repositories/StarshipRepository';
import { MCPServerConnectorRepository } from '../../src/repositories/MCPServerConnectorRepository';
import { getConnection } from '../../src/connection';
import { Agent } from '@starships/protocol';
import { MCPServerConnector } from '../../src/types';

// Mock dependencies
jest.mock('../../src/connection');

describe('StarshipRepository', () => {
  let repository: StarshipRepository;
  let mockConnection: any;
  let mockMCPConnectorRepo: jest.Mocked<MCPServerConnectorRepository>;

  const mockStarship = {
    id: 'starship-123',
    name: 'Test Starship',
    slug: 'test-starship',
    description: 'A test starship',
    class: 'destroyer',
    maxAgents: 3,
    ownerId: 'user-123',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockAgent: Agent = {
    id: 'agent-123',
    name: 'Test Agent',
    model: 'gpt-4',
    description: 'A test agent',
    tags: ['test'],
    category: 'general',
    authorId: 'user-123',
    isPublic: true,
    version: '1.0.0',
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockConnectorInstance: MCPServerConnector = {
    id: 'connector-123',
    starshipId: 'starship-123',
    templateId: 'template-123',
    status: 'active',
    isActive: true,
    connectedAt: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock MCPServerConnectorRepository
    mockMCPConnectorRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByStarship: jest.fn(),
      findByTemplate: jest.fn(),
      createFromTemplate: jest.fn(),
      updateStatus: jest.fn(),
      deactivate: jest.fn(),
      activate: jest.fn(),
      findByStarshipAndTemplate: jest.fn(),
    } as unknown as jest.Mocked<MCPServerConnectorRepository>;

    // Mock database connection
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };

    (getConnection as jest.Mock).mockReturnValue(mockConnection);

    // Mock Date.prototype.toISOString for consistent timestamps
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

    repository = new StarshipRepository(mockMCPConnectorRepo);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic CRUD Operations', () => {
    describe('findAll()', () => {
      it('should return all starships ordered by creation date', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]);

        const result = await repository.findAll();

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('MATCH (s:Starship)')
        );
        expect(result).toEqual([mockStarship]);
      });

      it('should return empty array when no starships exist', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findAll();

        expect(result).toEqual([]);
      });

      it('should handle database errors gracefully', async () => {
        mockConnection.executeQuery.mockRejectedValue(new Error('Database connection failed'));

        await expect(repository.findAll()).rejects.toThrow('Database connection failed');
      });
    });

    describe('findById()', () => {
      it('should return starship when found', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]);

        const result = await repository.findById('starship-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('MATCH (s:Starship {id: $id})'),
          { id: 'starship-123' }
        );
        expect(result).toEqual(mockStarship);
      });

      it('should return null when starship not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findById('nonexistent-id');

        expect(result).toBeNull();
      });

      it('should throw error when id is empty', async () => {
        await expect(repository.findById('')).rejects.toThrow('ID parameter is required');
      });

      it('should handle database errors gracefully', async () => {
        mockConnection.executeQuery.mockRejectedValue(new Error('Query failed'));

        await expect(repository.findById('starship-123')).rejects.toThrow('Query failed');
      });
    });

    describe('findBySlug()', () => {
      it('should return starship when found by slug and owner', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]);

        const result = await repository.findBySlug('test-starship', 'user-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('MATCH (s:Starship {slug: $slug, ownerId: $ownerId})'),
          { slug: 'test-starship', ownerId: 'user-123' }
        );
        expect(result).toEqual(mockStarship);
      });

      it('should return null when starship not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findBySlug('nonexistent-slug', 'user-123');

        expect(result).toBeNull();
      });

      it('should throw error when slug is empty', async () => {
        await expect(repository.findBySlug('', 'user-123')).rejects.toThrow(
          'Slug parameter is required'
        );
      });

      it('should throw error when ownerId is empty', async () => {
        await expect(repository.findBySlug('test-slug', '')).rejects.toThrow(
          'Owner ID parameter is required'
        );
      });
    });

    describe('findByOwner()', () => {
      it('should return starships for owner', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]);

        const result = await repository.findByOwner('user-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('MATCH (s:Starship {ownerId: $ownerId})'),
          { ownerId: 'user-123' }
        );
        expect(result).toEqual([mockStarship]);
      });

      it('should return empty array when no starships found', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findByOwner('user-123');

        expect(result).toEqual([]);
      });

      it('should throw error when ownerId is empty', async () => {
        await expect(repository.findByOwner('')).rejects.toThrow('Owner ID parameter is required');
      });
    });

    describe('create()', () => {
      const validStarshipData = {
        slug: 'new-starship',
        name: 'New Starship',
        ownerId: 'user-123',
        class: 'scout' as const,
        powerLevel: 100,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active' as const,
      };

      it('should create a new starship successfully', async () => {
        jest.spyOn(repository, 'generateUniqueSlug').mockResolvedValue('new-starship');
        mockConnection.executeWrite.mockResolvedValue({
          summary: { counters: { nodesCreated: 1 } },
        });

        const result = await repository.create(validStarshipData);

        expect(repository.generateUniqueSlug).toHaveBeenCalledWith('New Starship', 'user-123');
        expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2); // Create starship + relationship
        expect(result).toMatchObject({
          name: 'New Starship',
          slug: 'new-starship',
          class: 'destroyer',
          maxAgents: 3,
          ownerId: 'user-123',
        });
      });

      it('should set maxAgents to 6 for cruiser class', async () => {
        const cruiserData = { ...validStarshipData, class: 'cruiser' as const };
        jest.spyOn(repository, 'generateUniqueSlug').mockResolvedValue('new-cruiser');
        mockConnection.executeWrite.mockResolvedValue({
          summary: { counters: { nodesCreated: 1 } },
        });

        const result = await repository.create(cruiserData);

        expect(result.maxAgents).toBe(6);
      });

      it('should use provided slug if given', async () => {
        const dataWithSlug = { ...validStarshipData, slug: 'custom-slug' };
        mockConnection.executeWrite.mockResolvedValue({
          summary: { counters: { nodesCreated: 1 } },
        });

        await repository.create(dataWithSlug);

        expect(repository.generateUniqueSlug).not.toHaveBeenCalled();
      });

      it('should throw error when name is missing', async () => {
        const invalidData = { ...validStarshipData, name: '' };

        await expect(repository.create(invalidData)).rejects.toThrow('Name is required');
      });

      it('should throw error when ownerId is missing', async () => {
        const invalidData = { ...validStarshipData, ownerId: '' };

        await expect(repository.create(invalidData)).rejects.toThrow('Owner ID is required');
      });
    });

    describe('update()', () => {
      it('should update starship successfully', async () => {
        const updatedStarship = { ...mockStarship, name: 'Updated Name' };
        mockConnection.executeWrite.mockResolvedValue({
          records: [{ get: () => ({ properties: updatedStarship }) }],
        });

        const result = await repository.update('starship-123', { name: 'Updated Name' });

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('MATCH (s:Starship {id: $id})'),
          expect.objectContaining({
            id: 'starship-123',
            updates: expect.objectContaining({
              name: 'Updated Name',
              updatedAt: '2024-01-01T00:00:00.000Z',
            }),
          })
        );
        expect(result).toEqual(updatedStarship);
      });

      it('should generate new slug when name is updated without slug', async () => {
        const updatedStarship = { ...mockStarship, name: 'New Name', slug: 'new-name' };
        jest.spyOn(repository, 'generateUniqueSlug').mockResolvedValue('new-name');
        mockConnection.executeWrite.mockResolvedValue({
          records: [{ get: () => ({ properties: updatedStarship }) }],
        });

        await repository.update('starship-123', { name: 'New Name' });

        expect(repository.generateUniqueSlug).toHaveBeenCalledWith('New Name', 'user-123');
      });

      it('should return null when starship not found', async () => {
        mockConnection.executeWrite.mockResolvedValue({ records: [] });

        const result = await repository.update('nonexistent-id', { name: 'Test' });

        expect(result).toBeNull();
      });

      it('should throw error when id is empty', async () => {
        await expect(repository.update('', { name: 'Test' })).rejects.toThrow(
          'ID parameter is required'
        );
      });
    });

    describe('delete()', () => {
      it('should delete starship successfully', async () => {
        mockConnection.executeWrite.mockResolvedValue({
          summary: { counters: { nodesDeleted: 1 } },
        });

        const result = await repository.delete('starship-123');

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('MATCH (s:Starship {id: $id})'),
          { id: 'starship-123' }
        );
        expect(result).toBe(true);
      });

      it('should return false when starship not found', async () => {
        mockConnection.executeWrite.mockResolvedValue({
          summary: { counters: { nodesDeleted: 0 } },
        });

        const result = await repository.delete('nonexistent-id');

        expect(result).toBe(false);
      });

      it('should throw error when id is empty', async () => {
        await expect(repository.delete('')).rejects.toThrow('ID parameter is required');
      });
    });
  });

  describe('Agent Management', () => {
    describe('getDeployedAgents()', () => {
      it('should return deployed agents for starship', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);

        const result = await repository.getDeployedAgents('starship-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)'),
          { starshipId: 'starship-123' }
        );
        expect(result).toEqual([mockAgent]);
      });

      it('should return empty array when no agents deployed', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.getDeployedAgents('starship-123');

        expect(result).toEqual([]);
      });

      it('should throw error when starshipId is empty', async () => {
        await expect(repository.getDeployedAgents('')).rejects.toThrow('Starship ID is required');
      });
    });

    describe('deployAgent()', () => {
      it('should deploy agent successfully', async () => {
        jest.spyOn(repository, 'getAvailableSlots').mockResolvedValue(2);
        mockConnection.executeQuery.mockResolvedValue([]); // Mock for checking existing deployment
        mockConnection.executeWrite.mockResolvedValue({
          summary: { counters: { relationshipsCreated: 1 } },
        });

        const result = await repository.deployAgent('starship-123', 'agent-123');

        expect(repository.getAvailableSlots).toHaveBeenCalledWith('starship-123');
        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('CREATE (a)-[:DEPLOYED_ON'),
          expect.objectContaining({
            starshipId: 'starship-123',
            agentId: 'agent-123',
          })
        );
        expect(result).toBe(true);
      });

      it('should throw error when no available slots', async () => {
        jest.spyOn(repository, 'getAvailableSlots').mockResolvedValue(0);

        await expect(repository.deployAgent('starship-123', 'agent-123')).rejects.toThrow(
          'No available slots on this starship'
        );
      });

      it('should throw error when agent already deployed', async () => {
        jest.spyOn(repository, 'getAvailableSlots').mockResolvedValue(2);
        mockConnection.executeQuery.mockResolvedValue([{ r: {} }]); // Mock existing deployment found

        await expect(repository.deployAgent('starship-123', 'agent-123')).rejects.toThrow(
          'Agent is already deployed on this starship'
        );
      });

      it('should throw error when starshipId is empty', async () => {
        await expect(repository.deployAgent('', 'agent-123')).rejects.toThrow(
          'Starship ID is required'
        );
      });

      it('should throw error when agentId is empty', async () => {
        await expect(repository.deployAgent('starship-123', '')).rejects.toThrow(
          'Agent ID is required'
        );
      });
    });

    describe('removeAgent()', () => {
      it('should remove agent successfully', async () => {
        mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

        const result = await repository.removeAgent('starship-123', 'agent-123');

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('DELETE r'),
          { starshipId: 'starship-123', agentId: 'agent-123' }
        );
        expect(result).toBe(true);
      });

      it('should return false when no deployment found', async () => {
        mockConnection.executeWrite.mockResolvedValue({
          summary: { counters: { relationshipsDeleted: 0 } },
        });

        const result = await repository.removeAgent('starship-123', 'agent-123');

        expect(result).toBe(false);
      });

      it('should throw error when starshipId is empty', async () => {
        await expect(repository.removeAgent('', 'agent-123')).rejects.toThrow(
          'Starship ID is required'
        );
      });

      it('should throw error when agentId is empty', async () => {
        await expect(repository.removeAgent('starship-123', '')).rejects.toThrow(
          'Agent ID is required'
        );
      });
    });

    describe('getAvailableSlots()', () => {
      it('should return available slots', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ maxAgents: 3, deployedCount: 1 }]);

        const result = await repository.getAvailableSlots('starship-123');

        expect(result).toBe(2);
      });

      it('should handle no deployed agents', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ maxAgents: 3, deployedCount: 0 }]);

        const result = await repository.getAvailableSlots('starship-123');

        expect(result).toBe(3);
      });

      it('should handle no result', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.getAvailableSlots('starship-123');

        expect(result).toBe(0);
      });

      it('should throw error when starshipId is empty', async () => {
        await expect(repository.getAvailableSlots('')).rejects.toThrow('Starship ID is required');
      });
    });
  });

  describe('Slug Management', () => {
    describe('generateUniqueSlug()', () => {
      it('should return base slug when available', async () => {
        jest.spyOn(repository, 'createSlugFromName').mockReturnValue('test-name');
        jest.spyOn(repository, 'isSlugAvailable').mockResolvedValue(true);

        const result = await repository.generateUniqueSlug('Test Name', 'user-123');

        expect(result).toBe('test-name');
      });

      it('should generate optimized slug when base slug not available', async () => {
        jest.spyOn(repository, 'createSlugFromName').mockReturnValue('test-name');
        jest
          .spyOn(repository, 'isSlugAvailable')
          .mockResolvedValueOnce(false) // base slug not available
          .mockResolvedValueOnce(true); // optimized slug available

        const result = await repository.generateUniqueSlug('Test Name', 'user-123');

        expect(result).toMatch(/^test-name-[a-z0-9]+-[a-z0-9]+$/);
      });

      it('should use fallback slug when optimized slug not available', async () => {
        jest.spyOn(repository, 'createSlugFromName').mockReturnValue('test-name');
        jest
          .spyOn(repository, 'isSlugAvailable')
          .mockResolvedValueOnce(false) // base slug not available
          .mockResolvedValueOnce(false) // optimized slug not available
          .mockResolvedValueOnce(true); // fallback slug available

        const result = await repository.generateUniqueSlug('Test Name', 'user-123');

        expect(result).toMatch(/^test-name-[a-z0-9-]+$/);
      });

      it('should throw error when name is empty', async () => {
        await expect(repository.generateUniqueSlug('', 'user-123')).rejects.toThrow(
          'Name parameter is required'
        );
      });

      it('should throw error when ownerId is empty', async () => {
        await expect(repository.generateUniqueSlug('Test Name', '')).rejects.toThrow(
          'Owner ID parameter is required'
        );
      });
    });

    describe('isSlugAvailable()', () => {
      it('should return true when slug is available', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 0 }]);

        const result = await repository.isSlugAvailable('available-slug', 'user-123');

        expect(result).toBe(true);
      });

      it('should return false when slug is taken', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 1 }]);

        const result = await repository.isSlugAvailable('taken-slug', 'user-123');

        expect(result).toBe(false);
      });

      it('should exclude specific ID when provided', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ count: 0 }]);

        await repository.isSlugAvailable('test-slug', 'user-123', 'exclude-id');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('AND s.id <> $excludeId'),
          expect.objectContaining({ excludeId: 'exclude-id' })
        );
      });

      it('should throw error when slug is empty', async () => {
        await expect(repository.isSlugAvailable('', 'user-123')).rejects.toThrow(
          'Slug parameter is required'
        );
      });

      it('should throw error when ownerId is empty', async () => {
        await expect(repository.isSlugAvailable('test-slug', '')).rejects.toThrow(
          'Owner ID parameter is required'
        );
      });
    });

    describe('createSlugFromName()', () => {
      const testCases = [
        { input: 'Test Name', expected: 'test-name' },
        { input: 'My Awesome Starship!', expected: 'my-awesome-starship' },
        { input: 'Special@Characters#Here', expected: 'specialcharactershere' },
        { input: 'Multiple   Spaces', expected: 'multiple-spaces' },
        { input: '123 Numbers', expected: '123-numbers' },
      ];

      testCases.forEach(({ input, expected }) => {
        it(`should convert "${input}" to "${expected}"`, () => {
          const result = repository.createSlugFromName(input);
          expect(result).toBe(expected);
        });
      });

      it('should remove leading and trailing hyphens', () => {
        const result = repository.createSlugFromName('---Test Name---');

        expect(result).toBe('test-name');
      });

      it('should not throw error when name is empty', () => {
        // Based on implementation, it returns empty string for empty input
        const result = repository.createSlugFromName('');
        expect(result).toBe('');
      });
    });
  });

  describe('Connector Instance Methods', () => {
    describe('getConnectorInstances()', () => {
      it('should return connector instances for a starship', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]); // Mock findById
        mockMCPConnectorRepo.findByStarship.mockResolvedValue([mockConnectorInstance]);

        const result = await repository.getConnectorInstances(
          '12345678-1234-1234-1234-123456789012'
        );

        expect(mockMCPConnectorRepo.findByStarship).toHaveBeenCalledWith(
          '12345678-1234-1234-1234-123456789012'
        );
        expect(result).toEqual([mockConnectorInstance]);
      });

      it('should throw error when starship does not exist', async () => {
        mockConnection.executeQuery.mockResolvedValue([]); // Mock findById returns null

        await expect(
          repository.getConnectorInstances('12345678-1234-1234-1234-123456789012')
        ).rejects.toThrow('Starship with ID 12345678-1234-1234-1234-123456789012 not found');
      });

      it('should throw error when starshipId is empty', async () => {
        await expect(repository.getConnectorInstances('')).rejects.toThrow(
          'Starship ID parameter is required'
        );
      });

      it('should throw error when starshipId is not a valid UUID', async () => {
        await expect(repository.getConnectorInstances('invalid-uuid')).rejects.toThrow(
          'starshipId must be a valid UUID format'
        );
      });
    });

    describe('createConnectorInstance()', () => {
      it('should create a new connector instance', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]); // Mock findById
        mockMCPConnectorRepo.findByStarshipAndTemplate.mockResolvedValue(null);
        mockMCPConnectorRepo.createFromTemplate.mockResolvedValue(mockConnectorInstance);

        const result = await repository.createConnectorInstance(
          '12345678-1234-1234-1234-123456789012',
          '12345678-1234-1234-1234-123456789013'
        );

        expect(mockMCPConnectorRepo.findByStarshipAndTemplate).toHaveBeenCalledWith(
          '12345678-1234-1234-1234-123456789012',
          '12345678-1234-1234-1234-123456789013'
        );
        expect(mockMCPConnectorRepo.createFromTemplate).toHaveBeenCalledWith(
          '12345678-1234-1234-1234-123456789012',
          '12345678-1234-1234-1234-123456789013'
        );
        expect(result).toEqual(mockConnectorInstance);
      });

      it('should throw error when connector instance already exists', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]); // Mock findById
        mockMCPConnectorRepo.findByStarshipAndTemplate.mockResolvedValue(mockConnectorInstance);

        await expect(
          repository.createConnectorInstance(
            '12345678-1234-1234-1234-123456789012',
            '12345678-1234-1234-1234-123456789013'
          )
        ).rejects.toThrow('Connector instance already exists for this template');
      });

      it('should throw error when starship does not exist', async () => {
        mockConnection.executeQuery.mockResolvedValue([]); // Mock findById returns null

        await expect(
          repository.createConnectorInstance(
            '12345678-1234-1234-1234-123456789012',
            '12345678-1234-1234-1234-123456789013'
          )
        ).rejects.toThrow('Starship with ID 12345678-1234-1234-1234-123456789012 not found');
      });

      it('should throw error when starshipId is empty', async () => {
        await expect(
          repository.createConnectorInstance('', '12345678-1234-1234-1234-123456789013')
        ).rejects.toThrow('starshipId is required and must be a string');
      });

      it('should throw error when templateId is empty', async () => {
        await expect(
          repository.createConnectorInstance('12345678-1234-1234-1234-123456789012', '')
        ).rejects.toThrow('templateId is required and must be a string');
      });

      it('should validate UUID format for templateId', async () => {
        await expect(
          repository.createConnectorInstance('12345678-1234-1234-1234-123456789012', 'invalid-uuid')
        ).rejects.toThrow('templateId must be a valid UUID format');
      });
    });

    describe('removeConnectorInstance()', () => {
      it('should remove a connector instance', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]); // Mock findById
        mockMCPConnectorRepo.findById.mockResolvedValue(mockConnectorInstance);
        mockMCPConnectorRepo.delete.mockResolvedValue(true);

        const result = await repository.removeConnectorInstance(
          '12345678-1234-1234-1234-123456789012',
          'connector-123'
        );

        expect(mockMCPConnectorRepo.findById).toHaveBeenCalledWith('connector-123');
        expect(mockMCPConnectorRepo.delete).toHaveBeenCalledWith('connector-123');
        expect(result).toBe(true);
      });

      it('should return false when connector does not exist', async () => {
        mockConnection.executeQuery.mockResolvedValue([{ s: mockStarship }]); // Mock findById
        mockMCPConnectorRepo.findById.mockResolvedValue(null);

        const result = await repository.removeConnectorInstance(
          '12345678-1234-1234-1234-123456789012',
          'nonexistent-connector'
        );

        expect(result).toBe(false);
      });

      it('should throw error when starship does not exist', async () => {
        mockConnection.executeQuery.mockResolvedValue([]); // Mock findById returns null

        await expect(
          repository.removeConnectorInstance(
            '12345678-1234-1234-1234-123456789012',
            'connector-123'
          )
        ).rejects.toThrow('Starship with ID 12345678-1234-1234-1234-123456789012 not found');
      });

      it('should throw error when starshipId is empty', async () => {
        await expect(repository.removeConnectorInstance('', 'connector-123')).rejects.toThrow(
          'starshipId is required and must be a string'
        );
      });

      it('should throw error when connectorId is empty', async () => {
        await expect(
          repository.removeConnectorInstance('12345678-1234-1234-1234-123456789012', '')
        ).rejects.toThrow('connectorId is required and must be a string');
      });
    });
  });
});
