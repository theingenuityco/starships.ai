/**
 * ToolRepository Unit Tests
 */

import 'reflect-metadata';
import { ToolRepository } from '../ToolRepository';
import { ToolEntity } from '@/entities/ToolEntity';
import { DatabaseError, NotFoundError } from '@starships/errors';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';

// Mock nanoid for predictable IDs
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-tool-id-123'),
}));

// Mock the database connection
jest.mock('@/helpers/database', () => ({
  getConnection: jest.fn(),
}));

// Mock entity validation
jest.spyOn(ToolEntity, 'validate').mockResolvedValue(undefined);

describe('ToolRepository', () => {
  let repository: ToolRepository;
  let testHelper: RepositoryTestHelper;

  beforeEach(() => {
    testHelper = new RepositoryTestHelper();
    repository = new ToolRepository();
    testHelper.reset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as unknown as { serviceName: string }).serviceName).toBe('ToolRepository');
    });
  });

  describe('findAll', () => {
    it('should return all tools ordered by creation date', async () => {
      const mockTools = [
        {
          id: 'tool-1',
          name: 'Tool 1',
          slug: 'tool-1',
          starship_id: 'starship-123',
          is_enabled: true,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'tool-2',
          name: 'Tool 2',
          slug: 'tool-2',
          starship_id: 'starship-123',
          is_enabled: true,
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockTools);

      const result = await repository.findAll();

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM tools ORDER BY created_at DESC');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Tool 1');
      expect(result[1].name).toBe('Tool 2');
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
    it('should return tool by id', async () => {
      const mockTool = {
        id: 'tool-1',
        name: 'Test Tool',
        slug: 'test-tool',
        starship_id: 'starship-123',
        is_enabled: true,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockTool]);

      const result = await repository.findById('tool-1');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM tools WHERE id = $1', ['tool-1']);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Test Tool');
    });

    it('should return null when tool not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByStarship', () => {
    it('should return tools for a starship', async () => {
      const mockTools = [
        {
          id: 'tool-1',
          name: 'Tool 1',
          slug: 'tool-1',
          starship_id: 'starship-123',
          is_enabled: true,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockTools);

      const result = await repository.findByStarship('starship-123');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM tools WHERE starship_id = $1 ORDER BY created_at DESC', [
        'starship-123',
      ]);
      expect(result).toHaveLength(1);
    });
  });

  describe('findBySlugAndStarship', () => {
    it('should find tool by slug and starship', async () => {
      const mockTool = {
        id: 'tool-1',
        name: 'Test Tool',
        slug: 'test-tool',
        starship_id: 'starship-123',
        is_enabled: true,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockTool);

      const result = await repository.findBySlugAndStarship('test-tool', 'starship-123');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith('SELECT * FROM tools WHERE slug = $1 AND starship_id = $2', [
        'test-tool',
        'starship-123',
      ]);
      expect(result).not.toBeNull();
      expect(result!.slug).toBe('test-tool');
    });

    it('should return null when not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.findBySlugAndStarship('nonexistent', 'starship-123');

      expect(result).toBeNull();
    });
  });

  describe('findBySlugs', () => {
    it('should find tools by multiple slugs', async () => {
      const mockTools = [
        {
          id: 'tool-1',
          name: 'Tool 1',
          slug: 'tool-1',
          starship_id: 'starship-123',
          is_enabled: true,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'tool-2',
          name: 'Tool 2',
          slug: 'tool-2',
          starship_id: 'starship-123',
          is_enabled: true,
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockTools);

      const result = await repository.findBySlugs(['tool-1', 'tool-2'], 'starship-123');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith(
        'SELECT * FROM tools WHERE slug = ANY($1) AND starship_id = $2 ORDER BY created_at DESC',
        [['tool-1', 'tool-2'], 'starship-123']
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('search', () => {
    it('should search tools by query', async () => {
      const mockTools = [
        {
          id: 'tool-1',
          name: 'Search Tool',
          description: 'A tool for searching',
          slug: 'search-tool',
          starship_id: 'starship-123',
          is_enabled: true,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockTools);

      const result = await repository.search({ query: 'search' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Search Tool');
    });

    it('should filter by isEnabled', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      await repository.search({ isEnabled: true });

      expect(testHelper.mockConnection.query).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create tool successfully', async () => {
      const createData = {
        name: 'New Tool',
        description: 'Tool description',
        slug: 'new-tool',
        parameters: { type: 'object' as const, properties: {} },
        blueprint: { nodes: [], edges: [] },
        configuration: {},
      };

      const mockCreatedTool = {
        id: 'test-tool-id-123',
        name: 'New Tool',
        description: 'Tool description',
        slug: 'new-tool',
        starship_id: 'starship-123',
        is_enabled: true,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreatedTool]);

      const result = await repository.create(createData, 'starship-123');

      expect(ToolEntity.validate).toHaveBeenCalled();
      expect(result.name).toBe('New Tool');
      expect(result.slug).toBe('new-tool');
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();

      await expect(
        repository.create(
          {
            name: 'Tool',
            description: 'Tool description',
            slug: 'tool',
            parameters: { type: 'object' as const, properties: {} },
            blueprint: { nodes: [], edges: [] },
            configuration: {},
          },
          'starship-123'
        )
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should update tool successfully', async () => {
      const updates = { name: 'Updated Tool' };
      const mockUpdated = {
        id: 'tool-1',
        name: 'Updated Tool',
        slug: 'tool-1',
        starship_id: 'starship-123',
        is_enabled: true,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockUpdated]);

      const result = await repository.update('tool-1', updates);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated Tool');
    });

    it('should return null when tool not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.update('nonexistent', { name: 'Updated' });

      expect(result).toBeNull();
    });
  });

  describe('updateStarship', () => {
    it('should update tool starship assignment', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({ count: '1' }); // Starship exists
      testHelper.mockConnection.query.mockResolvedValue([
        {
          id: 'tool-1',
          starship_id: 'starship-456',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ]);

      const result = await repository.updateStarship('tool-1', 'starship-456');

      expect(result.id).toBe('tool-1');
    });

    it('should throw error when starship not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({ count: '0' });

      await expect(repository.updateStarship('tool-1', 'nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should throw error when tool not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({ count: '1' });
      testHelper.mockConnection.query.mockResolvedValue([]);

      await expect(repository.updateStarship('nonexistent', 'starship-456')).rejects.toThrow(NotFoundError);
    });
  });

  describe('createFromTemplate', () => {
    it('should create tool from template', async () => {
      const mockTemplate = {
        id: 'template-1',
        slug: 'template-slug',
        name: 'Template Tool',
        description: 'Template description',
        parameters: {},
        blueprint: {},
        transforms: {},
        mutations: {},
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const mockCreatedTool = {
        id: 'tool-1',
        name: 'Template Tool',
        slug: 'template-slug',
        starship_id: 'starship-123',
        is_enabled: true,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockTemplate);
      testHelper.mockConnection.query.mockResolvedValueOnce([mockCreatedTool]).mockResolvedValueOnce([]);

      const result = await repository.createFromTemplate('template-slug', 'starship-123');

      expect(result.name).toBe('Template Tool');
      expect(result.slug).toBe('template-slug');
    });

    it('should throw error when template not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);

      await expect(repository.createFromTemplate('nonexistent', 'starship-123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getSourceTemplate', () => {
    it('should get source template for tool', async () => {
      const mockTemplate = {
        id: 'template-1',
        slug: 'template-slug',
        name: 'Template Tool',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockTemplate);

      const result = await repository.getSourceTemplate('tool-1');

      expect(result).not.toBeNull();
      expect(result!.slug).toBe('template-slug');
    });

    it('should return null when no source template', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.getSourceTemplate('tool-1');

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete tool successfully', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 1 } as unknown as unknown[]);

      const result = await repository.delete('tool-1');

      expect(result).toBe(true);
    });

    it('should return false when tool not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 0 } as unknown as unknown[]);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });
});
