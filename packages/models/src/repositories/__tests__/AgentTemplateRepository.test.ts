/**
 * AgentTemplateRepository Unit Tests
 */

import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { DatabaseError } from '@starships/errors';
import type { AgentTemplateModel } from '@starships/protocol';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';

// Mock only database connection and nanoid
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(),
}));

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-template-id'),
}));

describe('AgentTemplateRepository', () => {
  let repository: AgentTemplateRepository;
  let testHelper: RepositoryTestHelper;
  let mockConnection: {
    query: jest.Mock;
    queryOne: jest.Mock;
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
    systemPrompt: 'You are a helpful assistant.',
    previewPrompts: ['Hello', 'How can I help?'],
    state: {
      messages: [],
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

  // Helper to create mock template as it would be stored in PostgreSQL (serialized)
  const createMockRawTemplate = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
    const template = createMockTemplate(overrides as Partial<AgentTemplateModel>);
    return {
      ...template,
      systemPrompt: template.systemPrompt || null,
      state: template.state ? JSON.stringify(template.state) : null,
      blueprint: template.blueprint ? JSON.stringify(template.blueprint) : null,
      ...overrides,
    };
  };

  const createMockCreateInput = (overrides: Record<string, unknown> = {}) => ({
    name: 'Test Template',
    slug: 'test-template', // Add slug for validation
    description: 'A test agent template',
    category: 'general' as const,
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
    timeout: 30000,
    icon: '🤖',
    systemPrompt: 'You are a helpful assistant.',
    previewPrompts: ['Hello'],
    state: {
      messages: [],
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
      const repo = new AgentTemplateRepository();
      expect(repo).toBeInstanceOf(AgentTemplateRepository);
    });
  });

  describe('findAll', () => {
    it('should return all agent templates', async () => {
      const mockRawTemplates = [createMockRawTemplate(), createMockRawTemplate({ id: 'template-456' })];
      mockConnection.query.mockResolvedValue(mockRawTemplates);

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'template-123',
        name: 'Test Template',
      });
      expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM agent_templates'));
    });

    it('should return empty array when no templates found', async () => {
      mockConnection.query.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });
  });

  describe('findById', () => {
    it('should return template when found', async () => {
      const mockRawTemplate = createMockRawTemplate();
      mockConnection.query.mockResolvedValue([mockRawTemplate]);

      const result = await repository.findById('template-123');

      expect(result).toMatchObject({
        id: 'template-123',
        name: 'Test Template',
      });
      expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM agent_templates WHERE id = $1', ['template-123']);
    });

    it('should return null when template not found', async () => {
      mockConnection.query.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should throw DatabaseError for missing id', async () => {
      await expect(repository.findById('')).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.findById('template-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findBySlug', () => {
    it('should return template when found by slug', async () => {
      const mockRawTemplate = createMockRawTemplate();
      mockConnection.query.mockResolvedValue([mockRawTemplate]);

      const result = await repository.findBySlug('test-template');

      expect(result).toMatchObject({
        id: 'template-123',
        slug: 'test-template',
        name: 'Test Template',
      });
      expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM agent_templates WHERE slug = $1', ['test-template']);
    });

    it('should return null when template not found by slug', async () => {
      mockConnection.query.mockResolvedValue([]);

      const result = await repository.findBySlug('non-existent-slug');

      expect(result).toBeNull();
    });

    it('should throw DatabaseError for missing slug', async () => {
      await expect(repository.findBySlug('')).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.findBySlug('test-template')).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    it('should create template successfully', async () => {
      const createInput = createMockCreateInput();
      const mockCreatedRaw = createMockRawTemplate();
      mockConnection.query.mockResolvedValueOnce([mockCreatedRaw]);

      const result = await repository.create(createInput);

      expect(result).toMatchObject({
        name: 'Test Template',
        description: 'A test agent template',
      });
      expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO agent_templates'), expect.any(Array));
    });

    it('should validate required fields', async () => {
      const invalidInput = { description: 'Missing name' };

      await expect(repository.create(invalidInput as unknown as Parameters<typeof repository.create>[0])).rejects.toThrow(DatabaseError);
    });

    it('should handle missing optional fields', async () => {
      const minimalInput = {
        name: 'Minimal Template',
        slug: 'minimal-template', // Add slug for validation
        description: 'Basic template',
        category: 'general' as const,
        blueprint: { type: 'test', nodes: [], edges: [] },
        model: 'gpt-4',
        state: { messages: [], tools: [] },
      };
      const mockCreatedRaw = createMockRawTemplate(minimalInput);
      mockConnection.query.mockResolvedValueOnce([mockCreatedRaw]);

      const result = await repository.create(minimalInput);

      expect(result.name).toBe('Minimal Template');
      expect(result.timeout).toBe(30000); // Should use default
    });

    it('should serialize complex objects', async () => {
      const inputWithComplexObjects = createMockCreateInput();
      const mockCreatedRaw = createMockRawTemplate();
      mockConnection.query.mockResolvedValueOnce([mockCreatedRaw]);

      await repository.create(inputWithComplexObjects);

      expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO agent_templates'), expect.any(Array));
    });

    it('should handle database errors', async () => {
      const createInput = createMockCreateInput();
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.create(createInput)).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should update template successfully', async () => {
      const updates = { name: 'Updated Template' };
      const mockUpdatedRaw = createMockRawTemplate(updates);

      mockConnection.query.mockResolvedValue([mockUpdatedRaw]);

      const result = await repository.update('template-123', updates);

      expect(result).toMatchObject({
        name: 'Updated Template',
      });
      expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE agent_templates'), expect.any(Array));
    });

    it('should return null when template not found', async () => {
      mockConnection.query.mockResolvedValue([]);

      const result = await repository.update('non-existent', { name: 'New Name' });

      expect(result).toBeNull();
    });

    it('should serialize complex objects in updates', async () => {
      const complexUpdates = {
        systemPrompt: 'You are an updated assistant.',
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
      };
      const mockUpdatedRaw = createMockRawTemplate(complexUpdates);

      mockConnection.query.mockResolvedValueOnce([mockUpdatedRaw]);

      const result = await repository.update('template-123', complexUpdates);

      expect(result).toMatchObject({
        id: 'template-123',
      });
      expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE agent_templates'), expect.any(Array));
    });
  });

  describe('delete', () => {
    it('should delete template successfully', async () => {
      mockConnection.query.mockResolvedValue({ rowCount: 1 } as unknown as unknown[]);

      const result = await repository.delete('template-123');

      expect(result).toBe(true);
      expect(mockConnection.query).toHaveBeenCalledWith('DELETE FROM agent_templates WHERE id = $1', ['template-123']);
    });

    it('should return false when template not found', async () => {
      mockConnection.query.mockResolvedValue({ rowCount: 0 } as unknown as unknown[]);

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
      mockConnection.query.mockResolvedValue(mockRawTemplates);

      const result = await repository.findByCategory('general');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        category: 'general',
      });
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM agent_templates'),
        expect.arrayContaining(['general'])
      );
    });

    it('should validate category parameter', async () => {
      await expect(repository.findByCategory('')).rejects.toThrow(DatabaseError);
    });
  });

  describe('searchTemplates', () => {
    it('should search templates by query', async () => {
      const mockRawTemplates = [createMockRawTemplate()];
      mockConnection.query.mockResolvedValue(mockRawTemplates);

      const result = await repository.searchTemplates('assistant');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'template-123',
        name: 'Test Template',
      });
      expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM agent_templates'), expect.any(Array));
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
      mockConnection.query.mockResolvedValue([]);

      await repository.incrementUsageCount('template-123');

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE agent_templates'),
        expect.arrayContaining(['template-123'])
      );
    });

    it('should validate id parameter', async () => {
      await expect(repository.incrementUsageCount('')).rejects.toThrow(DatabaseError);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle connection errors', async () => {
      const connectionError = new Error('connection failed');
      mockConnection.query.mockRejectedValue(connectionError);

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('operation timeout');
      mockConnection.query.mockRejectedValue(timeoutError);

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });
  });
});
