/**
 * ToolTemplateRepository Unit Tests
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import 'reflect-metadata';
import { ToolTemplateRepository } from '../ToolTemplateRepository';
import { ToolTemplateEntity } from '@/entities/ToolTemplateEntity';
import { DatabaseError } from '@starships/errors';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';

// Mock nanoid for predictable IDs
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-template-id-123'),
}));

// Mock the database connection
jest.mock('@/helpers/database', () => ({
  getConnection: jest.fn(),
}));

// Mock entity validation
jest.spyOn(ToolTemplateEntity, 'validate').mockResolvedValue(undefined);

describe('ToolTemplateRepository', () => {
  let repository: ToolTemplateRepository;
  let testHelper: RepositoryTestHelper;

  beforeEach(() => {
    testHelper = new RepositoryTestHelper();
    repository = new ToolTemplateRepository();
    testHelper.reset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as unknown as { serviceName: string }).serviceName).toBe('ToolTemplateRepository');
    });
  });

  describe('findAll', () => {
    it('should return all tool templates ordered by creation date', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          name: 'Template 1',
          slug: 'template-1',
          category: 'api',
          usage_count: 5,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'template-2',
          name: 'Template 2',
          slug: 'template-2',
          category: 'database',
          usage_count: 10,
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockTemplates);

      const result = await repository.findAll();

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM tool_templates ORDER BY created_at DESC');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Template 1');
      expect(result[1].name).toBe('Template 2');
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
    it('should return tool template by id', async () => {
      const mockTemplate = {
        id: 'template-1',
        name: 'Test Template',
        slug: 'test-template',
        category: 'api',
        usage_count: 0,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockTemplate]);

      const result = await repository.findById('template-1');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith('SELECT * FROM tool_templates WHERE id = $1', ['template-1']);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Test Template');
    });

    it('should return null when template not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error for missing id', async () => {
      await expect(repository.findById('')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findBySlug', () => {
    it('should find template by slug', async () => {
      const mockTemplate = {
        id: 'template-1',
        name: 'Test Template',
        slug: 'test-template',
        category: 'api',
        usage_count: 0,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockTemplate);

      const result = await repository.findBySlug('test-template');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith('SELECT * FROM tool_templates WHERE slug = $1', ['test-template']);
      expect(result).not.toBeNull();
      expect(result!.slug).toBe('test-template');
    });

    it('should return null when not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.findBySlug('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error for missing slug', async () => {
      await expect(repository.findBySlug('')).rejects.toThrow(DatabaseError);
    });
  });

  describe('search', () => {
    it('should search templates by category', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          name: 'API Template',
          slug: 'api-template',
          category: 'api',
          usage_count: 5,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockTemplates);

      const result = await repository.search({ category: 'api' as any });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('api');
    });

    it('should search by query string', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      await repository.search({ query: 'search term' });

      expect(testHelper.mockConnection.query).toHaveBeenCalled();
    });

    it('should filter by requiresApiKey', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      await repository.search({ requiresApiKey: true });

      expect(testHelper.mockConnection.query).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create tool template successfully', async () => {
      const createData = {
        name: 'New Template',
        description: 'Template description',
        parameters: { type: 'object' as const, properties: {} },
        blueprint: { nodes: [], edges: [] },
        category: 'api' as any,
      };

      const mockCreatedTemplate = {
        id: 'test-template-id-123',
        name: 'New Template',
        slug: 'new-template',
        description: 'Template description',
        category: 'api',
        usage_count: 0,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreatedTemplate]);

      const result = await repository.create(createData);

      expect(ToolTemplateEntity.validate).toHaveBeenCalled();
      expect(result.name).toBe('New Template');
      expect(result.slug).toBe('new-template');
    });

    it('should use provided slug if given', async () => {
      const createData = {
        name: 'New Template',
        slug: 'custom-slug',
        description: 'Template description',
        parameters: { type: 'object' as const, properties: {} },
        blueprint: { nodes: [], edges: [] },
        category: 'api' as any,
      };

      const mockCreatedTemplate = {
        id: 'test-template-id-123',
        name: 'New Template',
        slug: 'custom-slug',
        category: 'api',
        usage_count: 0,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreatedTemplate]);

      const result = await repository.create(createData);

      expect(result.slug).toBe('custom-slug');
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();

      await expect(
        repository.create({
          name: 'Template',
          description: 'Description',
          parameters: { type: 'object' as const, properties: {} },
          blueprint: { nodes: [], edges: [] },
          category: 'api' as any,
        })
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should update tool template successfully', async () => {
      const updates = { name: 'Updated Template' };
      const mockUpdated = {
        id: 'template-1',
        name: 'Updated Template',
        slug: 'template-1',
        category: 'api',
        usage_count: 5,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockUpdated]);

      const result = await repository.update('template-1', updates);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated Template');
    });

    it('should return null when template not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.update('nonexistent', { name: 'Updated' });

      expect(result).toBeNull();
    });

    it('should throw error for missing id', async () => {
      await expect(repository.update('', { name: 'Updated' })).rejects.toThrow(DatabaseError);
    });
  });

  describe('delete', () => {
    it('should delete tool template successfully', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 1 } as unknown as unknown[]);

      const result = await repository.delete('template-1');

      expect(result).toBe(true);
    });

    it('should return false when template not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue({ rowCount: 0 } as unknown as unknown[]);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });

    it('should throw error for missing id', async () => {
      await expect(repository.delete('')).rejects.toThrow(DatabaseError);
    });
  });

  describe('incrementUsageCount', () => {
    it('should increment usage count successfully', async () => {
      const mockUpdated = {
        id: 'template-1',
        name: 'Template',
        slug: 'template',
        category: 'api',
        usage_count: 6,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockUpdated);

      const result = await repository.incrementUsageCount('template-1');

      expect(result).not.toBeNull();
      expect(result!.usageCount).toBe(6);
    });

    it('should return null when template not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.incrementUsageCount('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error for missing id', async () => {
      await expect(repository.incrementUsageCount('')).rejects.toThrow(DatabaseError);
    });
  });

  describe('relationship methods', () => {
    describe('getUsedByAgentTemplates', () => {
      it('should get agent templates using this tool template', async () => {
        const mockAgentTemplates = [
          {
            id: 'agent-template-1',
            name: 'Agent Template 1',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ];

        testHelper.mockConnection.query.mockResolvedValue(mockAgentTemplates);

        const result = await repository.getUsedByAgentTemplates('template-1');

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Agent Template 1');
      });

      it('should throw error for missing toolTemplateId', async () => {
        await expect(repository.getUsedByAgentTemplates('')).rejects.toThrow(DatabaseError);
      });
    });

    describe('isUsedByAgentTemplates', () => {
      it('should return true when used by agent templates', async () => {
        testHelper.mockConnection.queryCount.mockResolvedValue(2);

        const result = await repository.isUsedByAgentTemplates('template-1');

        expect(result).toBe(true);
      });

      it('should return false when not used', async () => {
        testHelper.mockConnection.queryCount.mockResolvedValue(0);

        const result = await repository.isUsedByAgentTemplates('template-1');

        expect(result).toBe(false);
      });

      it('should throw error for missing toolTemplateId', async () => {
        await expect(repository.isUsedByAgentTemplates('')).rejects.toThrow(DatabaseError);
      });
    });
  });
});
