import { ConnectorConfigTemplateRepository } from '../../src/repositories/ConnectorConfigTemplateRepository';
import { ConnectorConfigTemplate, ConnectorInstanceConfig } from '../../src/types';
import { getConnection } from '../../src/connection';

// Mock dependencies
jest.mock('../../src/connection');
// Use the global UUID mock

const mockConnection = {
  executeQuery: jest.fn(),
  executeWrite: jest.fn(),
};

const mockGetConnection = getConnection as jest.MockedFunction<typeof getConnection>;

describe('ConnectorConfigTemplateRepository', () => {
  let repository: ConnectorConfigTemplateRepository;

  const mockConfig: ConnectorInstanceConfig = {
    customName: 'test-server',
    customDescription: 'Test connector configuration',
    environmentVariables: '{"TEST": "value"}',
    timeouts: {
      connection: 30000,
      request: 60000,
      idle: 300000
    },
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      exponentialBackoff: true
    },
    logging: {
      level: 'info',
      enableDebug: false,
      logRequests: false
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnection.mockReturnValue(mockConnection as any);
    repository = new ConnectorConfigTemplateRepository();
  });

  describe('create', () => {
    it('should create a configuration template', async () => {
      const templateData = {
        name: 'Test Template',
        description: 'Test description',
        category: 'development',
        isPublic: true,
        authorId: 'user-1',
        config: mockConfig,
        tags: ['test'],
        usageCount: 5
      };

      mockConnection.executeWrite.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await repository.create(templateData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'CREATE (t:ConnectorConfigTemplate $props) RETURN t',
        expect.objectContaining({
          props: expect.objectContaining({
            id: expect.any(String),
            name: 'Test Template',
            config: JSON.stringify(mockConfig),
            usageCount: 5,
            createdAt: expect.any(String),
            updatedAt: expect.any(String)
          })
        })
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: 'Test Template',
          config: mockConfig,
          usageCount: 5
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Created configuration template: Test Template')
      );

      consoleSpy.mockRestore();
    });

    it('should set default usageCount to 0', async () => {
      const templateData = {
        name: 'Test Template',
        description: 'Test description',
        category: 'development' as const,
        tags: ['test'],
        isPublic: false,
        config: mockConfig,
        authorId: 'user-1',
        usageCount: 0
      };

      mockConnection.executeWrite.mockResolvedValue(undefined);

      const result = await repository.create(templateData);

      expect(result.usageCount).toBe(0);
    });

    it('should throw error when required fields are missing', async () => {
      await expect(repository.create({} as any))
        .rejects.toThrow('Name, category, and config are required fields');

      await expect(repository.create({ name: 'Test' } as any))
        .rejects.toThrow('Name, category, and config are required fields');

      await expect(repository.create({ name: 'Test', category: 'dev' } as any))
        .rejects.toThrow('Name, category, and config are required fields');
    });

    it('should handle database errors', async () => {
      const templateData = {
        name: 'Test Template',
        description: 'Test description',
        category: 'development' as const,
        tags: ['test'],
        isPublic: false,
        config: mockConfig,
        authorId: 'user-1',
        usageCount: 0
      };

      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(repository.create(templateData))
        .rejects.toThrow('Failed to create configuration template: Database error');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in create:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('findAll', () => {
    it('should return all templates ordered by category and name', async () => {
      const mockTemplateData = [
        {
          id: '1',
          name: 'Template A',
          category: 'development',
          config: '{"test": "config"}',
          authorId: 'user-1',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplateData.map(t => ({ t }))
      );

      const result = await repository.findAll();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (t:ConnectorConfigTemplate) RETURN t ORDER BY t.category, t.name'
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: '1',
          name: 'Template A',
          config: { test: 'config' }
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(repository.findAll())
        .rejects.toThrow('Failed to retrieve configuration templates: Database error');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in findAll:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('findByCategory', () => {
    it('should return templates by category', async () => {
      const mockTemplateData = [
        {
          id: '1',
          name: 'Dev Template',
          category: 'development',
          config: '{"test": "config"}',
          authorId: 'user-1',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplateData.map(t => ({ t }))
      );

      const result = await repository.findByCategory('development');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.category = $category RETURN t ORDER BY t.name',
        { category: 'development' }
      );
      expect(result).toHaveLength(1);
    });

    it('should throw error when category is missing', async () => {
      await expect(repository.findByCategory(''))
        .rejects.toThrow('Category parameter is required');
    });
  });

  describe('findPublic', () => {
    it('should return public templates', async () => {
      const mockTemplateData = [
        {
          id: '1',
          name: 'Public Template',
          category: 'development',
          config: '{"test": "config"}',
          isPublic: true,
          authorId: 'user-1',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplateData.map(t => ({ t }))
      );

      const result = await repository.findPublic();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.isPublic = true RETURN t ORDER BY t.category, t.name'
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('findByAuthor', () => {
    it('should return templates by author', async () => {
      const mockTemplateData = [
        {
          id: '1',
          name: 'Author Template',
          category: 'development',
          config: '{"test": "config"}',
          authorId: 'user-1',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplateData.map(t => ({ t }))
      );

      const result = await repository.findByAuthor('user-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.authorId = $authorId RETURN t ORDER BY t.updatedAt DESC',
        { authorId: 'user-1' }
      );
      expect(result).toHaveLength(1);
    });

    it('should throw error when authorId is missing', async () => {
      await expect(repository.findByAuthor(''))
        .rejects.toThrow('Author ID parameter is required');
    });
  });

  describe('findById', () => {
    it('should return template by id', async () => {
      const mockTemplateData = {
        id: '1',
        name: 'Test Template',
        category: 'development',
        config: '{"test": "config"}',
        authorId: 'user-1',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01'
      };
      mockConnection.executeQuery.mockResolvedValue([{ t: mockTemplateData }]);

      const result = await repository.findById('1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.id = $id RETURN t',
        { id: '1' }
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: '1',
          name: 'Test Template',
          config: { test: 'config' }
        })
      );
    });

    it('should return null when template not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error when id is missing', async () => {
      await expect(repository.findById(''))
        .rejects.toThrow('ID parameter is required');
    });
  });

  describe('update', () => {
    it('should update template', async () => {
      const mockUpdatedTemplate = {
        id: '1',
        name: 'Updated Template',
        category: 'development',
        config: '{"updated": "config"}',
        authorId: 'user-1',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-02'
      };
      mockConnection.executeWrite.mockResolvedValue([{ t: mockUpdatedTemplate }]);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const updates = {
        name: 'Updated Template',
        config: { customName: 'updated-server', customDescription: 'Updated config' } as ConnectorInstanceConfig
      };

      const result = await repository.update('1', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.id = $id SET t += $updates RETURN t',
        expect.objectContaining({
          id: '1',
          updates: expect.objectContaining({
            name: 'Updated Template',
            config: JSON.stringify({ customName: 'updated-server', customDescription: 'Updated config' }),
            updatedAt: expect.any(String)
          })
        })
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: '1',
          name: 'Updated Template'
        })
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Updated configuration template: Updated Template')
      );

      consoleSpy.mockRestore();
    });

    it('should return null when template not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('nonexistent', { name: 'Updated' });

      expect(result).toBeNull();
    });

    it('should throw error when id is missing', async () => {
      await expect(repository.update('', {}))
        .rejects.toThrow('ID parameter is required');
    });
  });

  describe('delete', () => {
    it('should delete template and return true', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await repository.delete('1');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.id = $id DETACH DELETE t RETURN count(t) as deletedCount',
        { id: '1' }
      );
      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deleted configuration template with id: 1')
      );

      consoleSpy.mockRestore();
    });

    it('should return false when template not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });

    it('should throw error when id is missing', async () => {
      await expect(repository.delete(''))
        .rejects.toThrow('ID parameter is required');
    });
  });

  describe('incrementUsage', () => {
    it('should increment template usage count', async () => {
      mockConnection.executeWrite.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await repository.incrementUsage('template-1');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.id = $id SET t.usageCount = t.usageCount + 1, t.updatedAt = $updatedAt',
        { id: 'template-1', updatedAt: expect.any(String) }
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Incremented usage count for template: template-1')
      );

      consoleSpy.mockRestore();
    });

    it('should throw error when id is missing', async () => {
      await expect(repository.incrementUsage(''))
        .rejects.toThrow('ID parameter is required');
    });
  });

  describe('search', () => {
    it('should search templates by query without category filter', async () => {
      const mockTemplateData = [
        {
          id: '1',
          name: 'Matching Template',
          category: 'development',
          config: '{"test": "config"}',
          authorId: 'user-1',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplateData.map(t => ({ t }))
      );

      const result = await repository.search('test query');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('toLower(t.name) CONTAINS toLower($query)'),
        { query: 'test query' }
      );
      expect(result).toHaveLength(1);
    });

    it('should search templates by query with category filter', async () => {
      const mockTemplateData = [
        {
          id: '1',
          name: 'Matching Template',
          category: 'development',
          config: '{"test": "config"}',
          authorId: 'user-1',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01'
        }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplateData.map(t => ({ t }))
      );

      const result = await repository.search('test query', 'development');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND t.category = $category'),
        { query: 'test query', category: 'development' }
      );
      expect(result).toHaveLength(1);
    });

    it('should throw error when query is missing', async () => {
      await expect(repository.search(''))
        .rejects.toThrow('Search query parameter is required');
    });
  });

  describe('nodeToTemplate', () => {
    it('should convert node to template with all fields', () => {
      const node = {
        id: '1',
        name: 'Test Template',
        description: 'Test description',
        category: 'development',
        isPublic: true,
        authorId: 'user-1',
        config: '{"test": "config"}',
        tags: ['tag1', 'tag2'],
        usageCount: 5,
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01'
      };

      // Access private method through type assertion
      const result = (repository as any).nodeToTemplate(node);

      expect(result).toEqual({
        id: '1',
        name: 'Test Template',
        description: 'Test description',
        category: 'development',
        isPublic: true,
        authorId: 'user-1',
        config: { test: 'config' },
        tags: ['tag1', 'tag2'],
        usageCount: 5,
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01'
      });
    });

    it('should convert node to template with default values', () => {
      const node = {
        id: '1',
        name: 'Test Template',
        category: 'development',
        authorId: 'user-1',
        config: '{"test": "config"}',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01'
      };

      const result = (repository as any).nodeToTemplate(node);

      expect(result).toEqual({
        id: '1',
        name: 'Test Template',
        description: undefined,
        category: 'development',
        isPublic: false,
        authorId: 'user-1',
        config: { test: 'config' },
        tags: [],
        usageCount: 0,
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01'
      });
    });
  });
});