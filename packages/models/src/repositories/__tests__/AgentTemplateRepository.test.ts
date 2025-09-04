/**
 * AgentTemplateRepository Unit Tests
 */

import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { Neo4jConnection } from '@/helpers/database';
import { ValidationError, DatabaseError } from '@starships/errors';
import type { AgentTemplateModel } from '@starships/protocol';

// Mock dependencies
jest.mock('../../helpers/database/connection');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-template-id'),
}));

describe('AgentTemplateRepository', () => {
  let repository: AgentTemplateRepository;
  let mockConnection: jest.Mocked<Neo4jConnection>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      getSession: jest.fn().mockReturnValue({} as any),
      executeQuery: jest.fn().mockResolvedValue([]),
      executeWrite: jest.fn().mockResolvedValue([]),
      initializeSchema: jest.fn().mockResolvedValue(undefined),
      driver: null,
      config: {},
      sanitizeParameters: jest.fn((params) => params),
    } as any;

    repository = new AgentTemplateRepository(mockConnection);
  });

  const createMockTemplate = (overrides: Partial<AgentTemplateModel> = {}): AgentTemplateModel => ({
    id: 'template-123',
    name: 'Test Template',
    description: 'A test agent template',
    category: 'general',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
    timeout: 30000,
    authorId: 'user-123',
    isPublic: true,
    rating: 4.5,
    usageCount: 10,
    icon: '🤖',
    previewPrompts: ['Hello', 'How can I help?'],
    tags: ['ai', 'assistant'],
    memory: {
      identity: { name: 'Assistant', role: 'helper', personality: 'friendly' },
      purpose: { primary: 'assist users', constraints: [] },
      space: { description: 'helpful environment' },
    },
    blueprint: {
      nodes: [{ ref: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} }],
      edges: [],
      metadata: {},
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  // Helper to create mock template as it would be stored in Neo4j (serialized)
  const createMockRawTemplate = (overrides: any = {}): any => {
    const template = createMockTemplate(overrides);
    return {
      ...template,
      memory: template.memory ? JSON.stringify(template.memory) : null,
      blueprint: template.blueprint ? JSON.stringify(template.blueprint) : null,
    };
  };

  const createMockCreateInput = (overrides: any = {}) => ({
    name: 'Test Template',
    description: 'A test agent template',
    category: 'general',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
    timeout: 30000,
    authorId: 'user-123',
    isPublic: true,
    rating: 4.5,
    icon: '🤖',
    previewPrompts: ['Hello'],
    tags: ['ai'],
    memory: {
      identity: { name: 'Assistant', role: 'helper', personality: 'friendly' },
      purpose: { primary: 'assist users', constraints: [] },
      space: { description: 'helpful environment' },
    },
    blueprint: {
      nodes: [{ ref: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} }],
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
      const customConnection = {} as Neo4jConnection;
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

    it('should throw ValidationError for missing id', async () => {
      await expect(repository.findById('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findById('template-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    it('should create template successfully', async () => {
      const createInput = createMockCreateInput();
      const mockCreatedRaw = createMockRawTemplate();
      // Fix: createEntityWithAutoId expects result[0].n, not result[0].t
      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreatedRaw }]);

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
      // The actual query uses CREATE (n:AgentTemplate) with randomUUID(), not CREATE (t:AgentTemplate $template)
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

      await expect(repository.create(invalidInput as any)).rejects.toThrow(ValidationError);
    });

    it('should handle missing optional fields', async () => {
      const minimalInput = {
        name: 'Minimal Template',
        description: 'Basic template',
      };
      const mockCreatedRaw = createMockRawTemplate(minimalInput);
      // Fix: createEntityWithAutoId expects result[0].n, not result[0].t
      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreatedRaw }]);

      const result = await repository.create(minimalInput);

      expect(result.name).toBe('Minimal Template');
      expect(result.timeout).toBe(30000); // Should use default
    });

    it('should serialize complex objects', async () => {
      const inputWithComplexObjects = createMockCreateInput();
      const mockCreatedRaw = createMockRawTemplate();
      // Fix: createEntityWithAutoId expects result[0].n, not result[0].t
      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreatedRaw }]);

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
      const updates = { name: 'Updated Template', rating: 5 };
      const mockUpdatedRaw = createMockRawTemplate(updates);

      mockConnection.executeWrite.mockResolvedValue([{ t: mockUpdatedRaw }]);

      const result = await repository.update('template-123', updates);

      expect(result).toMatchObject(updates);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET'),
        expect.objectContaining({
          id: 'template-123',
          updates: expect.objectContaining(updates),
        })
      );
    });

    it('should return null when template not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('non-existent', { name: 'New Name' });

      expect(result).toBeNull();
    });

    it('should handle empty updates by calling findById', async () => {
      const mockRawTemplate = createMockRawTemplate();

      // Mock the database call that will be made by findById when no updates are provided
      mockConnection.executeQuery.mockResolvedValue([{ t: mockRawTemplate }]);

      const result = await repository.update('template-123', {});

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

      // Verify executeQuery was called (indicating findById path was taken)
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('MATCH (t:AgentTemplate {id: $id})'), {
        id: 'template-123',
      });
    });

    it('should validate id parameter', async () => {
      await expect(repository.update('', { name: 'New Name' })).rejects.toThrow(ValidationError);
    });

    it('should serialize complex objects in updates', async () => {
      const complexUpdates = {
        memory: { identity: { name: 'Updated' } },
        blueprint: { nodes: [], edges: [] },
      };
      const mockUpdatedRaw = createMockRawTemplate(complexUpdates);

      mockConnection.executeWrite.mockResolvedValue([{ t: mockUpdatedRaw }]);

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
      await expect(repository.delete('')).rejects.toThrow(ValidationError);
    });
  });

  describe('findByAuthor', () => {
    it('should return templates by author', async () => {
      const mockRawTemplates = [createMockRawTemplate(), createMockRawTemplate({ id: 'template-456' })];
      mockConnection.executeQuery.mockResolvedValue(mockRawTemplates.map((t) => ({ t })));

      const result = await repository.findByAuthor('user-123');

      expect(result).toHaveLength(2);
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
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('MATCH (t:AgentTemplate {authorId: $authorId})'), {
        authorId: 'user-123',
      });
    });

    it('should validate authorId parameter', async () => {
      await expect(repository.findByAuthor('')).rejects.toThrow(ValidationError);
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
      await expect(repository.findByCategory('')).rejects.toThrow(ValidationError);
    });
  });

  describe('findByTags', () => {
    it('should return templates matching tags', async () => {
      const mockRawTemplates = [createMockRawTemplate({ tags: ['ai', 'assistant'] })];
      mockConnection.executeQuery.mockResolvedValue(mockRawTemplates.map((t) => ({ t })));

      const result = await repository.findByTags(['ai', 'assistant']);

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
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('ANY(tag IN $tags WHERE tag IN t.tags)'), {
        tags: ['ai', 'assistant'],
      });
    });

    it('should validate tags parameter', async () => {
      await expect(repository.findByTags([])).rejects.toThrow(ValidationError);
      await expect(repository.findByTags(null as any)).rejects.toThrow(ValidationError);
    });

    it('should reject non-array tags', async () => {
      await expect(repository.findByTags('invalid' as any)).rejects.toThrow(ValidationError);
    });
  });

  describe('findPublic', () => {
    it('should return public templates with default pagination', async () => {
      const mockRawTemplates = [createMockRawTemplate()];
      mockConnection.executeQuery.mockResolvedValue(mockRawTemplates.map((t) => ({ t })));

      const result = await repository.findPublic();

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
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (t:AgentTemplate {isPublic: true})'),
        expect.objectContaining({
          limit: expect.any(Object), // Neo4j int
          offset: expect.any(Object), // Neo4j int
        })
      );
    });

    it('should respect pagination parameters', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      await repository.findPublic(25, 10);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SKIP $offset'),
        expect.objectContaining({
          limit: expect.any(Object),
          offset: expect.any(Object),
        })
      );
    });

    it('should validate limit boundaries', async () => {
      await expect(repository.findPublic(0)).rejects.toThrow(ValidationError);
      await expect(repository.findPublic(101)).rejects.toThrow(ValidationError);
    });

    it('should validate offset is non-negative', async () => {
      await expect(repository.findPublic(50, -1)).rejects.toThrow(ValidationError);
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
      await expect(repository.searchTemplates('')).rejects.toThrow(ValidationError);
    });

    it('should validate query length', async () => {
      const longQuery = 'a'.repeat(201);
      await expect(repository.searchTemplates(longQuery)).rejects.toThrow(ValidationError);
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
      await expect(repository.incrementUsageCount('')).rejects.toThrow(ValidationError);
    });
  });

  describe('updateRating', () => {
    it('should update rating successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.updateRating('template-123', 4.5);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET t.rating = $rating'),
        expect.objectContaining({
          id: 'template-123',
          rating: 4.5,
          now: expect.any(String),
        })
      );
    });

    it('should validate id and rating parameters', async () => {
      await expect(repository.updateRating('', 4.5)).rejects.toThrow(ValidationError);
      await expect(repository.updateRating('template-123', 6)).rejects.toThrow(ValidationError);
      await expect(repository.updateRating('template-123', -1)).rejects.toThrow(ValidationError);
      await expect(repository.updateRating('template-123', 'invalid' as any)).rejects.toThrow(ValidationError);
    });
  });

  describe('createAgentFromTemplate', () => {
    it('should create agent from template successfully', async () => {
      const mockTemplate = createMockTemplate();
      const mockAgent = {
        id: 'agent-123',
        name: 'Test Agent',
        starshipId: 'starship-123',
        templateId: 'template-123',
        memory: JSON.stringify(mockTemplate.memory),
        blueprint: JSON.stringify(mockTemplate.blueprint),
      };

      jest.spyOn(repository, 'findById').mockResolvedValue(mockTemplate);
      jest.spyOn(repository, 'incrementUsageCount').mockResolvedValue();
      // Fix: createEntityWithAutoId expects result[0].n, not result[0].a
      mockConnection.executeWrite.mockResolvedValueOnce([{ n: mockAgent }]).mockResolvedValueOnce([]); // For the relationship creation

      const result = await repository.createAgentFromTemplate('template-123', 'Test Agent', 'user-123', 'starship-123');

      expect(result).toMatchObject({
        name: 'Test Agent',
        starshipId: 'starship-123',
      });
      expect(repository.incrementUsageCount).toHaveBeenCalledWith('template-123');
    });

    it('should throw error when template not found', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(null);

      await expect(repository.createAgentFromTemplate('non-existent', 'Agent', 'user-123', 'starship-123')).rejects.toThrow(
        'Template with id non-existent not found'
      );
    });
  });

  describe('createTemplateFromAgent', () => {
    it('should create template from public agent', async () => {
      const mockAgent = {
        id: 'agent-123',
        name: 'Test Agent',
        description: 'Agent description',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000,
        category: 'general',
      };
      const mockRawTemplate = createMockRawTemplate();

      mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);
      mockConnection.executeWrite
        .mockResolvedValueOnce([{ n: mockRawTemplate }]) // Fix: Template creation expects result[0].n
        .mockResolvedValueOnce([]); // Relationship creation

      const result = await repository.createTemplateFromAgent('agent-123');

      expect(result).toMatchObject({
        name: expect.stringContaining('Template'),
        memory: expect.objectContaining({
          identity: expect.objectContaining({ name: expect.any(String) }),
        }),
        blueprint: expect.objectContaining({
          nodes: expect.any(Array),
        }),
      });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE a.isPublic = true'), {
        agentId: 'agent-123',
      });
    });

    it('should return null when agent not found or not public', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.createTemplateFromAgent('non-existent');

      expect(result).toBeNull();
    });

    it('should validate agentId parameter', async () => {
      await expect(repository.createTemplateFromAgent('')).rejects.toThrow(ValidationError);
    });
  });

  describe('private helper methods', () => {
    it('should safely get values with defaults', () => {
      const repo = repository as any;

      expect(repo.getSafeValue(null, 'default')).toBe('default');
      expect(repo.getSafeValue(undefined, 'default')).toBe('default');
      expect(repo.getSafeValue({}, 'default')).toBe('default');
      expect(repo.getSafeValue('actual', 'default')).toBe('actual');
    });

    it('should serialize templates correctly', () => {
      const repo = repository as any;
      const template = {
        name: 'Test',
        memory: { test: 'data' },
        blueprint: { nodes: [] },
      };

      const serialized = repo.serializeTemplate(template);

      expect(serialized).toEqual({
        name: 'Test',
        memory: JSON.stringify({ test: 'data' }),
        blueprint: JSON.stringify({ nodes: [] }),
      });
    });

    it('should deserialize templates correctly', () => {
      const repo = repository as any;
      const rawTemplate = {
        name: 'Test',
        memory: JSON.stringify({ test: 'data' }),
        blueprint: JSON.stringify({ nodes: [] }),
      };

      const deserialized = repo.deserializeTemplate(rawTemplate);

      expect(deserialized).toEqual({
        name: 'Test',
        memory: { test: 'data' },
        blueprint: { nodes: [] },
      });
    });

    it('should handle null memory and blueprint in deserialization', () => {
      const repo = repository as any;
      const rawTemplate = {
        name: 'Test',
        memory: null,
        blueprint: undefined,
      };

      const deserialized = repo.deserializeTemplate(rawTemplate);

      expect(deserialized).toEqual({
        name: 'Test',
        memory: undefined,
        blueprint: undefined,
      });
    });
  });
});
