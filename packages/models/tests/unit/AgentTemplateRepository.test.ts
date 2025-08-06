import { Neo4jAgentTemplateRepository } from '../../src/repositories/AgentTemplateRepository';
import { AgentTemplate, Agent } from '../../src/types';
import { Neo4jConnection } from '../../src/connection';
import { convertNeo4jIntsInObject, convertNeo4jIntsInArray } from '../../src/utils/neo4j-helpers';

// Mock dependencies
jest.mock('../../src/utils/neo4j-helpers');
// Use the global UUID mock

const mockConnection = {
  executeQuery: jest.fn(),
  executeWrite: jest.fn(),
};

const mockConvertNeo4jIntsInObject = convertNeo4jIntsInObject as jest.MockedFunction<typeof convertNeo4jIntsInObject>;
const mockConvertNeo4jIntsInArray = convertNeo4jIntsInArray as jest.MockedFunction<typeof convertNeo4jIntsInArray>;

describe('Neo4jAgentTemplateRepository', () => {
  let repository: Neo4jAgentTemplateRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConvertNeo4jIntsInObject.mockImplementation((obj) => obj);
    mockConvertNeo4jIntsInArray.mockImplementation((arr) => arr);
    repository = new Neo4jAgentTemplateRepository(mockConnection as unknown as Neo4jConnection);
  });

  describe('findAll', () => {
    it('should return all templates ordered by creation date', async () => {
      const mockTemplates = [
        { id: '1', name: 'Template 1', createdAt: '2023-01-01' },
        { id: '2', name: 'Template 2', createdAt: '2023-01-02' }
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplates.map(t => ({ t }))
      );

      const result = await repository.findAll();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (t:AgentTemplate)')
      );
      expect(mockConvertNeo4jIntsInArray).toHaveBeenCalledWith(mockTemplates);
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('findById', () => {
    it('should return template by id', async () => {
      const mockTemplate = { id: '1', name: 'Test Template' };
      mockConnection.executeQuery.mockResolvedValue([{ t: mockTemplate }]);

      const result = await repository.findById('1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (t:AgentTemplate {id: $id})'),
        { id: '1' }
      );
      expect(mockConvertNeo4jIntsInObject).toHaveBeenCalledWith(mockTemplate);
      expect(result).toEqual(mockTemplate);
    });

    it('should return null when template not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new template with required fields', async () => {
      const templateData = {
        name: 'Test Template',
        description: 'Test description',
        category: 'general' as const,
        tags: ['tag1'],
        systemPrompt: 'Test prompt',
        model: 'gpt-4',
        authorId: 'user-1',
        isPublic: true,
        icon: '🤖',
        previewPrompts: ['test'],
        updatedAt: '2023-01-01T00:00:00Z',
        usageCount: 0,
        temperature: 0.7,
        maxTokens: 1000
      };

      const mockTemplate = {
        ...templateData,
        id: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        usageCount: 0
      };

      mockConnection.executeWrite.mockResolvedValue([{ t: mockTemplate }]);

      const result = await repository.create(templateData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (t:AgentTemplate $template)'),
        expect.objectContaining({
          template: expect.objectContaining({
            ...templateData,
            id: expect.any(String),
            usageCount: 0
          })
        })
      );
      expect(mockConvertNeo4jIntsInObject).toHaveBeenCalledWith(mockTemplate);
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('update', () => {
    it('should update template with new data', async () => {
      const mockTemplate = { id: '1', name: 'Updated Template' };
      mockConnection.executeWrite.mockResolvedValue([{ t: mockTemplate }]);

      const result = await repository.update('1', { name: 'Updated Template' });

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET'),
        expect.objectContaining({
          id: '1',
          updates: { name: 'Updated Template' }
        })
      );
      expect(result).toEqual(mockTemplate);
    });

    it('should return existing template when no updates provided', async () => {
      const mockTemplate = { id: '1', name: 'Template' };
      mockConnection.executeQuery.mockResolvedValue([{ t: mockTemplate }]);

      const result = await repository.update('1', {});

      expect(result).toEqual(mockTemplate);
    });

    it('should return null when template not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('nonexistent', { name: 'Updated' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete template and return true', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('1');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DELETE t'),
        { id: '1' }
      );
      expect(result).toBe(true);
    });

    it('should return false when template not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('findByAuthor', () => {
    it('should return templates by author', async () => {
      const mockTemplates = [{ id: '1', name: 'Template 1', authorId: 'user-1' }];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplates.map(t => ({ t }))
      );

      const result = await repository.findByAuthor('user-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('authorId: $authorId'),
        { authorId: 'user-1' }
      );
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('findByCategory', () => {
    it('should return public templates by category', async () => {
      const mockTemplates = [{ id: '1', name: 'Template 1', category: 'assistant', isPublic: true }];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplates.map(t => ({ t }))
      );

      const result = await repository.findByCategory('assistant');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('category: $category'),
        { category: 'assistant' }
      );
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('findByTags', () => {
    it('should return templates matching any of the tags', async () => {
      const mockTemplates = [{ id: '1', name: 'Template 1', tags: ['tag1', 'tag2'] }];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplates.map(t => ({ t }))
      );

      const result = await repository.findByTags(['tag1', 'tag3']);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ANY(tag IN $tags WHERE tag IN t.tags)'),
        { tags: ['tag1', 'tag3'] }
      );
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('findPublic', () => {
    it('should return public templates with default pagination', async () => {
      const mockTemplates = [{ id: '1', name: 'Public Template', isPublic: true }];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplates.map(t => ({ t }))
      );

      const result = await repository.findPublic();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('isPublic: true'),
        expect.objectContaining({
          limit: expect.any(Object), // neo4j int
          offset: expect.any(Object) // neo4j int
        })
      );
      expect(result).toEqual(mockTemplates);
    });

    it('should return public templates with custom pagination', async () => {
      const mockTemplates = [{ id: '1', name: 'Public Template', isPublic: true }];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplates.map(t => ({ t }))
      );

      const result = await repository.findPublic(10, 20);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $limit'),
        expect.objectContaining({
          limit: expect.any(Object), // neo4j int(10)
          offset: expect.any(Object) // neo4j int(20)
        })
      );
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('searchTemplates', () => {
    it('should search templates by query string', async () => {
      const mockTemplates = [{ id: '1', name: 'Matching Template' }];
      mockConnection.executeQuery.mockResolvedValue(
        mockTemplates.map(t => ({ t }))
      );

      const result = await repository.searchTemplates('test query');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('toLower(t.name) CONTAINS toLower($query)'),
        { query: 'test query' }
      );
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('incrementUsageCount', () => {
    it('should increment template usage count', async () => {
      mockConnection.executeWrite.mockResolvedValue(undefined);

      await repository.incrementUsageCount('template-1');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET t.usageCount = t.usageCount + 1'),
        { id: 'template-1', now: expect.any(String) }
      );
    });
  });

  describe('updateRating', () => {
    it('should update template rating', async () => {
      mockConnection.executeWrite.mockResolvedValue(undefined);

      await repository.updateRating('template-1', 4.5);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET t.rating = $rating'),
        { id: 'template-1', rating: 4.5, now: expect.any(String) }
      );
    });
  });

  describe('createAgentFromTemplate', () => {
    it('should create agent from template', async () => {
      const mockTemplate: AgentTemplate = {
        id: 'template-1',
        name: 'Test Template',
        description: 'Test description',
        category: 'general' as const,
        tags: ['tag1'],
        systemPrompt: 'Test prompt',
        model: 'gpt-4',
        authorId: 'user-1',
        isPublic: true,
        usageCount: 0,
        icon: '🤖',
        previewPrompts: [],
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01',
        temperature: 0.7,
        maxTokens: 1000
      };

      const mockAgent = {
        id: expect.any(String),
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-1'
      };

      mockConnection.executeQuery.mockResolvedValue([{ t: mockTemplate }]);
      mockConnection.executeWrite
        .mockResolvedValueOnce(undefined) // incrementUsageCount
        .mockResolvedValueOnce([{ a: mockAgent }]); // create agent

      const result = await repository.createAgentFromTemplate(
        'template-1',
        'Test Agent',
        'user-1',
        'starship-1'
      );

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (t:AgentTemplate {id: $id})'),
        { id: 'template-1' }
      );
      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockAgent);
    });

    it('should throw error when template not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      await expect(repository.createAgentFromTemplate('nonexistent', 'Test Agent', 'user-1', 'starship-1'))
        .rejects.toThrow('Template with id nonexistent not found');
    });
  });

  describe('createTemplateFromAgent', () => {
    it('should create template from public agent', async () => {
      const mockAgent: Agent = {
        id: 'agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        systemPrompt: 'Test prompt',
        description: 'Test description',
        tags: ['tag1'],
        category: 'general' as const,
        version: '1.0.0',
        isPublic: true,
        authorId: 'user-1',
        starshipId: 'starship-1',
        usageCount: 10,
        rating: 4.5,
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01',
        temperature: 0.7,
        maxTokens: 1000
      };

      const mockTemplate = {
        id: expect.any(String),
        name: 'Test Agent Template',
        description: 'Test description'
      };

      mockConnection.executeQuery.mockResolvedValue([{ a: mockAgent }]);
      mockConnection.executeWrite.mockResolvedValue([{ t: mockTemplate }]);

      const result = await repository.createTemplateFromAgent('agent-1');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.isPublic = true'),
        { agentId: 'agent-1' }
      );
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (t:AgentTemplate $template)'),
        expect.objectContaining({
          template: expect.objectContaining({
            name: 'Test Agent Template',
            systemPrompt: 'Test prompt',
            model: 'gpt-4'
          })
        })
      );
      expect(result).toEqual(mockTemplate);
    });

    it('should return null when agent not found or not public', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.createTemplateFromAgent('nonexistent');

      expect(result).toBeNull();
    });
  });
});