/**
 * AgentTemplateRepository Unit Tests
 */

import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { DatabaseError } from '@starships/errors';
import type { AgentTemplateModel } from '@starships/protocol';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';

// Mock dependencies
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(),
  convertNeo4jIntsInObject: jest.fn((obj) => obj),
  convertNeo4jIntsInArray: jest.fn((arr) => arr),
}));

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-template-id'),
}));

jest.mock('../../helpers/slugUtils', () => ({
  generateSlug: jest.fn((name) => name.toLowerCase().replace(/\s+/g, '-')),
}));

// Mock AgentTemplateEntity validation to avoid validation issues in tests
jest.mock('../../entities/AgentTemplateEntity', () => ({
  AgentTemplateEntity: {
    validate: jest.fn().mockResolvedValue(undefined),
    deserialize: jest.fn().mockImplementation((data) => {
      // Simulate JSON parsing for memory and blueprint like the real entity does
      const result = { ...data };
      if (typeof data.memory === 'string') {
        try {
          result.memory = JSON.parse(data.memory);
        } catch {
          result.memory = null;
        }
      }
      if (typeof data.blueprint === 'string') {
        try {
          result.blueprint = JSON.parse(data.blueprint);
        } catch {
          result.blueprint = null;
        }
      }
      // Add serialize method to the returned object
      result.serialize = jest.fn().mockReturnValue({
        ...result,
        memory: typeof result.memory === 'object' ? JSON.stringify(result.memory) : result.memory,
        blueprint: typeof result.blueprint === 'object' ? JSON.stringify(result.blueprint) : result.blueprint,
      });
      return result;
    }),
  },
}));

describe('AgentTemplateRepository', () => {
  let repository: AgentTemplateRepository;
  let testHelper: RepositoryTestHelper;
  let mockConnection: {
    executeQuery: jest.Mock;
    executeWrite: jest.Mock;
  };

  beforeEach(() => {
    testHelper = new RepositoryTestHelper();
    mockConnection = testHelper.mockConnection;
    repository = new AgentTemplateRepository(); // Use default connection (mocked by RepositoryTestHelper)
    testHelper.reset();
  });

  const createMockTemplate = (overrides: Partial<AgentTemplateModel> = {}): AgentTemplateModel => ({
    id: 'template-123',
    slug: 'test-template',
    name: 'Test Template',
    description: 'A test agent template',
    category: 'general',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
    timeout: 30000,
    usageCount: 10,
    icon: '🤖',
    previewPrompts: ['Hello', 'How can I help?'],
    memory: {
      identity: { name: 'Assistant', role: 'helper', personality: 'friendly' },
      purpose: { primary: 'assist users', constraints: [] },
      space: { description: 'helpful environment' },
    },
    blueprint: {
      nodes: [{ ref: 'start', type: 'start' as const, name: 'Start', description: 'Begin', parameters: {} }],
      edges: [],
      metadata: {},
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  // Helper to create mock template as it would be stored in Neo4j (serialized)
  const createMockRawTemplate = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
    const template = createMockTemplate(overrides as Partial<AgentTemplateModel>);
    return {
      ...template,
      memory: template.memory ? JSON.stringify(template.memory) : null,
      blueprint: template.blueprint ? JSON.stringify(template.blueprint) : null,
      ...overrides,
    };
  };

  const createMockCreateInput = (overrides: Record<string, unknown> = {}) => ({
    name: 'Test Template',
    description: 'A test agent template',
    category: 'general' as const,
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
    timeout: 30000,
    icon: '🤖',
    previewPrompts: ['Hello'],
    memory: {
      identity: { name: 'Assistant', role: 'helper', personality: 'friendly' },
      purpose: { primary: 'assist users', constraints: [] },
      space: { description: 'helpful environment' },
    },
    blueprint: {
      nodes: [{ ref: 'start', type: 'start' as const, name: 'Start', description: 'Begin', parameters: {} }],
      edges: [],
      metadata: {},
    },
    ...overrides,
  });

  describe('constructor', () => {
    it('should create repository with connection', () => {
      expect(repository).toBeInstanceOf(AgentTemplateRepository);
    });

    it('should use provided connection', () => {
      const customConnection = {} as unknown as import('@/helpers/database/connection').Neo4jConnection;
      const repo = new AgentTemplateRepository(customConnection);
      expect(repo).toBeInstanceOf(AgentTemplateRepository);
    });
  });

  describe('findAll', () => {
    it('should return all agent templates', async () => {
      const mockRawTemplates = [createMockRawTemplate(), createMockRawTemplate({ id: 'template-456' })];
      mockConnection.executeQuery.mockResolvedValue(mockRawTemplates.map((t) => ({ t })));

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'template-123',
          name: 'Test Template',
          memory: expect.objectContaining({
            identity: expect.objectContaining({ name: 'Assistant' }),
          }),
          blueprint: expect.objectContaining({
            nodes: expect.any(Array),
          }),
        })
      );
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('MATCH (t:AgentTemplate)'));
    });

    it('should return empty array when no templates found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });
  });

  describe('findById', () => {
    it('should return template when found', async () => {
      const mockRawTemplate = createMockRawTemplate();
      mockConnection.executeQuery.mockResolvedValue([{ t: mockRawTemplate }]);

      const result = await repository.findById('template-123');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'template-123',
          name: 'Test Template',
          memory: expect.objectContaining({
            identity: expect.objectContaining({ name: 'Assistant' }),
          }),
          blueprint: expect.objectContaining({
            nodes: expect.any(Array),
          }),
        })
      );
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('MATCH (t:AgentTemplate {id: $id})'), {
        id: 'template-123',
      });
    });

    it('should return null when template not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should throw DatabaseError for missing id', async () => {
      await expect(repository.findById('')).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findById('template-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findBySlug', () => {
    it('should return template when found by slug', async () => {
      const mockRawTemplate = createMockRawTemplate();
      mockConnection.executeQuery.mockResolvedValue([{ t: mockRawTemplate }]);

      const result = await repository.findBySlug('test-template');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'template-123',
          slug: 'test-template',
          name: 'Test Template',
          memory: expect.objectContaining({
            identity: expect.objectContaining({ name: 'Assistant' }),
          }),
          blueprint: expect.objectContaining({
            nodes: expect.any(Array),
          }),
        })
      );
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('MATCH (t:AgentTemplate {slug: $slug})'), {
        slug: 'test-template',
      });
    });

    it('should return null when template not found by slug', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findBySlug('non-existent-slug');

      expect(result).toBeNull();
    });

    it('should throw DatabaseError for missing slug', async () => {
      await expect(repository.findBySlug('')).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findBySlug('test-template')).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    it('should create template successfully', async () => {
      const createInput = createMockCreateInput();
      const mockCreatedRaw = createMockRawTemplate();
      mockConnection.executeWrite.mockResolvedValueOnce([{ n: mockCreatedRaw }]);

      const result = await repository.create(createInput);

      expect(result).toMatchObject({
        name: 'Test Template',
        description: 'A test agent template',
        memory: expect.objectContaining({
          identity: expect.objectContaining({ name: 'Assistant' }),
        }),
        blueprint: expect.objectContaining({
          nodes: expect.any(Array),
        }),
      });
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (n:AgentTemplate)'),
        expect.objectContaining({
          props: expect.objectContaining({
            name: 'Test Template',
            description: 'A test agent template',
            memory: expect.any(String), // Should be serialized
            blueprint: expect.any(String), // Should be serialized
          }),
        })
      );
    });

    it('should validate required fields', async () => {
      const invalidInput = { description: 'Missing name' };

      await expect(repository.create(invalidInput as unknown as Parameters<typeof repository.create>[0])).rejects.toThrow(DatabaseError);
    });

    it('should handle missing optional fields', async () => {
      const minimalInput = {
        name: 'Minimal Template',
        description: 'Basic template',
        category: 'general' as const,
        blueprint: { type: 'test', nodes: [], edges: [] },
        model: 'gpt-4',
        memory: { data: 'test' },
      };
      const mockCreatedRaw = createMockRawTemplate(minimalInput);
      mockConnection.executeWrite.mockResolvedValueOnce([{ n: mockCreatedRaw }]);

      const result = await repository.create(minimalInput);

      expect(result.name).toBe('Minimal Template');
      expect(result.timeout).toBe(30000); // Should use default
    });

    it('should serialize complex objects', async () => {
      const inputWithComplexObjects = createMockCreateInput();
      const mockCreatedRaw = createMockRawTemplate();
      mockConnection.executeWrite.mockResolvedValueOnce([{ n: mockCreatedRaw }]);

      await repository.create(inputWithComplexObjects);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          props: expect.objectContaining({
            memory: expect.any(String),
            blueprint: expect.any(String),
          }),
        })
      );
    });

    it('should handle database errors', async () => {
      const createInput = createMockCreateInput();
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.create(createInput)).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should update template successfully', async () => {
      const updates = { name: 'Updated Template' };
      const mockUpdatedRaw = createMockRawTemplate(updates);

      mockConnection.executeWrite.mockResolvedValue([{ t: mockUpdatedRaw }]);

      const result = await repository.update('template-123', updates);

      expect(result).toMatchObject({
        name: 'Updated Template',
      });
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET'),
        expect.objectContaining({
          id: 'template-123',
          updates: expect.objectContaining({
            name: 'Updated Template',
          }),
        })
      );
    });

    it('should return null when template not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('non-existent', { name: 'New Name' });

      expect(result).toBeNull();
    });

    it('should serialize complex objects in updates', async () => {
      const complexUpdates = {
        memory: { identity: { name: 'Updated' } },
        blueprint: { nodes: [], edges: [] },
      };
      const mockUpdatedRaw = createMockRawTemplate(complexUpdates);

      mockConnection.executeWrite.mockResolvedValueOnce([{ t: mockUpdatedRaw }]);

      const result = await repository.update('template-123', complexUpdates);

      expect(result).toEqual(
        expect.objectContaining({
          memory: expect.objectContaining({
            identity: expect.objectContaining({ name: 'Updated' }),
          }),
        })
      );
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          updates: expect.objectContaining({
            memory: expect.any(String),
            blueprint: expect.any(String),
          }),
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete template successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('template-123');

      expect(result).toBe(true);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(expect.stringContaining('DETACH DELETE t'), { id: 'template-123' });
    });

    it('should return false when template not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should validate id parameter', async () => {
      await expect(repository.delete('')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findByCategory', () => {
    it('should return public templates by category', async () => {
      const mockRawTemplates = [createMockRawTemplate({ category: 'general' })];
      mockConnection.executeQuery.mockResolvedValue(mockRawTemplates.map((t) => ({ t })));

      const result = await repository.findByCategory('general');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          memory: expect.objectContaining({
            identity: expect.objectContaining({ name: 'Assistant' }),
          }),
          blueprint: expect.objectContaining({
            nodes: expect.any(Array),
          }),
        })
      );
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE t.isPublic = true'), { category: 'general' });
    });

    it('should validate category parameter', async () => {
      await expect(repository.findByCategory('')).rejects.toThrow(DatabaseError);
    });
  });

  describe('searchTemplates', () => {
    it('should search templates by query', async () => {
      const mockRawTemplates = [createMockRawTemplate()];
      mockConnection.executeQuery.mockResolvedValue(mockRawTemplates.map((t) => ({ t })));

      const result = await repository.searchTemplates('assistant');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          memory: expect.objectContaining({
            identity: expect.objectContaining({ name: 'Assistant' }),
          }),
          blueprint: expect.objectContaining({
            nodes: expect.any(Array),
          }),
        })
      );
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('toLower(t.name) CONTAINS toLower($query)'), {
        query: 'assistant',
      });
    });

    it('should validate query parameter', async () => {
      await expect(repository.searchTemplates('')).rejects.toThrow(DatabaseError);
    });

    it('should validate query length', async () => {
      const longQuery = 'a'.repeat(201);
      await expect(repository.searchTemplates(longQuery)).rejects.toThrow(DatabaseError);
    });
  });

  describe('incrementUsageCount', () => {
    it('should increment usage count successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.incrementUsageCount('template-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET t.usageCount = t.usageCount + 1'),
        expect.objectContaining({
          id: 'template-123',
          now: expect.any(String),
        })
      );
    });

    it('should validate id parameter', async () => {
      await expect(repository.incrementUsageCount('')).rejects.toThrow(DatabaseError);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle connection errors', async () => {
      const connectionError = new Error('connection failed');
      mockConnection.executeQuery.mockRejectedValue(connectionError);

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('operation timeout');
      mockConnection.executeQuery.mockRejectedValue(timeoutError);

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });
  });
});
