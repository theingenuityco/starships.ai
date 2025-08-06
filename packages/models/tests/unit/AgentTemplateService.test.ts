import { AgentTemplateService } from '../../src/services/AgentTemplateService';
import { Neo4jAgentTemplateRepository } from '../../src/repositories/AgentTemplateRepository';
import { Neo4jConnection } from '../../src/connection';
import { AgentTemplate, Agent } from '../../src/types';

// Mock dependencies
jest.mock('../../src/repositories/AgentTemplateRepository');

const mockTemplateRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findPublic: jest.fn(),
  findByCategory: jest.fn(),
  findByAuthor: jest.fn(),
  searchTemplates: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  createAgentFromTemplate: jest.fn(),
  createTemplateFromAgent: jest.fn(),
  updateRating: jest.fn(),
};

const MockNeo4jAgentTemplateRepository = Neo4jAgentTemplateRepository as jest.MockedClass<typeof Neo4jAgentTemplateRepository>;

describe('AgentTemplateService', () => {
  let service: AgentTemplateService;
  let mockConnection: Neo4jConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {} as Neo4jConnection;
    MockNeo4jAgentTemplateRepository.mockImplementation(() => mockTemplateRepository as any);
    service = new AgentTemplateService(mockConnection);
  });

  describe('constructor', () => {
    it('should initialize with repository', () => {
      expect(MockNeo4jAgentTemplateRepository).toHaveBeenCalledWith(mockConnection);
    });
  });

  describe('getAllTemplates', () => {
    it('should return all templates', async () => {
      const mockTemplates = [{ id: '1', name: 'Template 1' }] as AgentTemplate[];
      mockTemplateRepository.findAll.mockResolvedValue(mockTemplates);

      const result = await service.getAllTemplates();

      expect(mockTemplateRepository.findAll).toHaveBeenCalled();
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('getTemplateById', () => {
    it('should return template by id', async () => {
      const mockTemplate = { id: '1', name: 'Template 1' } as AgentTemplate;
      mockTemplateRepository.findById.mockResolvedValue(mockTemplate);

      const result = await service.getTemplateById('1');

      expect(mockTemplateRepository.findById).toHaveBeenCalledWith('1');
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('getPublicTemplates', () => {
    it('should return public templates with default parameters', async () => {
      const mockTemplates = [{ id: '1', name: 'Public Template' }] as AgentTemplate[];
      mockTemplateRepository.findPublic.mockResolvedValue(mockTemplates);

      const result = await service.getPublicTemplates();

      expect(mockTemplateRepository.findPublic).toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual(mockTemplates);
    });

    it('should return public templates with custom parameters', async () => {
      const mockTemplates = [{ id: '1', name: 'Public Template' }] as AgentTemplate[];
      mockTemplateRepository.findPublic.mockResolvedValue(mockTemplates);

      const result = await service.getPublicTemplates(10, 20);

      expect(mockTemplateRepository.findPublic).toHaveBeenCalledWith(10, 20);
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('getTemplatesByCategory', () => {
    it('should return templates by category', async () => {
      const mockTemplates = [{ id: '1', name: 'Category Template' }] as AgentTemplate[];
      mockTemplateRepository.findByCategory.mockResolvedValue(mockTemplates);

      const result = await service.getTemplatesByCategory('coding');

      expect(mockTemplateRepository.findByCategory).toHaveBeenCalledWith('coding');
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('getTemplatesByAuthor', () => {
    it('should return templates by author', async () => {
      const mockTemplates = [{ id: '1', name: 'Author Template' }] as AgentTemplate[];
      mockTemplateRepository.findByAuthor.mockResolvedValue(mockTemplates);

      const result = await service.getTemplatesByAuthor('user-1');

      expect(mockTemplateRepository.findByAuthor).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('searchTemplates', () => {
    it('should search templates', async () => {
      const mockTemplates = [{ id: '1', name: 'Search Result' }] as AgentTemplate[];
      mockTemplateRepository.searchTemplates.mockResolvedValue(mockTemplates);

      const result = await service.searchTemplates('test query');

      expect(mockTemplateRepository.searchTemplates).toHaveBeenCalledWith('test query');
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('createTemplate', () => {
    const validTemplateData = {
      name: 'Test Template',
      description: 'Test description',
      category: 'general' as const,
      tags: ['test'],
      systemPrompt: 'Test prompt',
      model: 'gpt-4',
      authorId: 'user-1',
      isPublic: true,
      icon: '🤖',
      previewPrompts: ['test'],
      temperature: 0.7,
      maxTokens: 1000,
      rating: 4.5,
      updatedAt: '2023-01-01T00:00:00Z',
      usageCount: 0
    };

    it('should create template with valid data', async () => {
      const mockCreatedTemplate = { ...validTemplateData, id: '1' } as AgentTemplate;
      mockTemplateRepository.create.mockResolvedValue(mockCreatedTemplate);

      const result = await service.createTemplate(validTemplateData);

      expect(mockTemplateRepository.create).toHaveBeenCalledWith({
        ...validTemplateData,
        usageCount: 0,
        updatedAt: expect.any(String)
      });
      expect(result).toEqual(mockCreatedTemplate);
    });

    it('should throw error when name is missing', async () => {
      const invalidData = { ...validTemplateData, name: '' };

      await expect(service.createTemplate(invalidData))
        .rejects.toThrow('Template name, systemPrompt, and model are required');
    });

    it('should throw error when systemPrompt is missing', async () => {
      const invalidData = { ...validTemplateData, systemPrompt: '' };

      await expect(service.createTemplate(invalidData))
        .rejects.toThrow('Template name, systemPrompt, and model are required');
    });

    it('should throw error when model is missing', async () => {
      const invalidData = { ...validTemplateData, model: '' };

      await expect(service.createTemplate(invalidData))
        .rejects.toThrow('Template name, systemPrompt, and model are required');
    });

    it('should throw error when tags is not an array', async () => {
      const invalidData = { ...validTemplateData, tags: 'not-an-array' as any };

      await expect(service.createTemplate(invalidData))
        .rejects.toThrow('Tags must be an array');
    });
  });

  describe('updateTemplate', () => {
    it('should update template with allowed fields', async () => {
      const updates = {
        name: 'Updated Template',
        description: 'Updated description',
        systemPrompt: 'Updated prompt'
      };
      const mockUpdatedTemplate = { id: '1', ...updates } as AgentTemplate;
      mockTemplateRepository.update.mockResolvedValue(mockUpdatedTemplate);

      const result = await service.updateTemplate('1', updates);

      expect(mockTemplateRepository.update).toHaveBeenCalledWith('1', {
        ...updates,
        updatedAt: expect.any(String)
      });
      expect(result).toEqual(mockUpdatedTemplate);
    });

    it('should filter out restricted fields', async () => {
      const updates = {
        id: 'new-id',
        createdAt: '2023-01-01',
        usageCount: 100,
        name: 'Updated Template'
      };
      const mockUpdatedTemplate = { id: '1', name: 'Updated Template' } as AgentTemplate;
      mockTemplateRepository.update.mockResolvedValue(mockUpdatedTemplate);

      const result = await service.updateTemplate('1', updates);

      expect(mockTemplateRepository.update).toHaveBeenCalledWith('1', {
        name: 'Updated Template',
        updatedAt: expect.any(String)
      });
      expect(result).toEqual(mockUpdatedTemplate);
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template', async () => {
      mockTemplateRepository.delete.mockResolvedValue(true);

      const result = await service.deleteTemplate('1');

      expect(mockTemplateRepository.delete).toHaveBeenCalledWith('1');
      expect(result).toBe(true);
    });
  });

  describe('createAgentFromTemplate', () => {
    it('should create agent from template', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent' } as Agent;
      mockTemplateRepository.createAgentFromTemplate.mockResolvedValue(mockAgent);

      const result = await service.createAgentFromTemplate('template-1', 'Test Agent', 'user-1', 'starship-1');

      expect(mockTemplateRepository.createAgentFromTemplate).toHaveBeenCalledWith(
        'template-1',
        'Test Agent',
        'user-1',
        'starship-1'
      );
      expect(result).toEqual(mockAgent);
    });

    it('should trim agent name', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent' } as Agent;
      mockTemplateRepository.createAgentFromTemplate.mockResolvedValue(mockAgent);

      await service.createAgentFromTemplate('template-1', '  Test Agent  ', 'user-1', 'starship-1');

      expect(mockTemplateRepository.createAgentFromTemplate).toHaveBeenCalledWith(
        'template-1',
        'Test Agent',
        'user-1',
        'starship-1'
      );
    });

    it('should throw error when agent name is empty', async () => {
      await expect(service.createAgentFromTemplate('template-1', '', 'user-1', 'starship-1'))
        .rejects.toThrow('Agent name is required');

      await expect(service.createAgentFromTemplate('template-1', '   ', 'user-1', 'starship-1'))
        .rejects.toThrow('Agent name is required');
    });
  });

  describe('createTemplateFromAgent', () => {
    it('should create template from agent', async () => {
      const mockTemplate = { id: 'template-1', name: 'Agent Template' } as AgentTemplate;
      mockTemplateRepository.createTemplateFromAgent.mockResolvedValue(mockTemplate);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await service.createTemplateFromAgent('agent-1');

      expect(mockTemplateRepository.createTemplateFromAgent).toHaveBeenCalledWith('agent-1');
      expect(result).toEqual(mockTemplate);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Creating template from agent:'),
        'agent-1'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Template creation result:'),
        'Success'
      );

      consoleSpy.mockRestore();
    });

    it('should handle failed template creation', async () => {
      mockTemplateRepository.createTemplateFromAgent.mockResolvedValue(null);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await service.createTemplateFromAgent('agent-1');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Template creation result:'),
        'Failed'
      );

      consoleSpy.mockRestore();
    });

    it('should throw error when agent ID is missing', async () => {
      await expect(service.createTemplateFromAgent(''))
        .rejects.toThrow('Agent ID is required');
    });
  });

  describe('rateTemplate', () => {
    it('should rate template with valid rating', async () => {
      mockTemplateRepository.updateRating.mockResolvedValue(undefined);

      await service.rateTemplate('template-1', 4.5);

      expect(mockTemplateRepository.updateRating).toHaveBeenCalledWith('template-1', 4.5);
    });

    it('should throw error for rating below 1', async () => {
      await expect(service.rateTemplate('template-1', 0.5))
        .rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should throw error for rating above 5', async () => {
      await expect(service.rateTemplate('template-1', 5.5))
        .rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should accept boundary values', async () => {
      mockTemplateRepository.updateRating.mockResolvedValue(undefined);

      await service.rateTemplate('template-1', 1);
      await service.rateTemplate('template-1', 5);

      expect(mockTemplateRepository.updateRating).toHaveBeenCalledWith('template-1', 1);
      expect(mockTemplateRepository.updateRating).toHaveBeenCalledWith('template-1', 5);
    });
  });

  describe('seedDefaultTemplates', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should seed default templates when they do not exist', async () => {
      // Mock search to return empty results (templates don't exist)
      mockTemplateRepository.searchTemplates.mockResolvedValue([]);
      mockTemplateRepository.create.mockResolvedValue({} as AgentTemplate);

      await service.seedDefaultTemplates();

      // Should search for each template
      expect(mockTemplateRepository.searchTemplates).toHaveBeenCalledTimes(5);
      expect(mockTemplateRepository.searchTemplates).toHaveBeenCalledWith('General Assistant');
      expect(mockTemplateRepository.searchTemplates).toHaveBeenCalledWith('Code Reviewer');
      expect(mockTemplateRepository.searchTemplates).toHaveBeenCalledWith('Creative Writer');
      expect(mockTemplateRepository.searchTemplates).toHaveBeenCalledWith('Data Analyst');
      expect(mockTemplateRepository.searchTemplates).toHaveBeenCalledWith('Customer Support');

      // Should create each template
      expect(mockTemplateRepository.create).toHaveBeenCalledTimes(5);

      // Should log success messages
      expect(console.log).toHaveBeenCalledWith('🌱 Seeding default agent templates...');
      expect(console.log).toHaveBeenCalledWith('✅ Created template: General Assistant');
      expect(console.log).toHaveBeenCalledWith('✅ Created template: Code Reviewer');
      expect(console.log).toHaveBeenCalledWith('✅ Created template: Creative Writer');
      expect(console.log).toHaveBeenCalledWith('✅ Created template: Data Analyst');
      expect(console.log).toHaveBeenCalledWith('✅ Created template: Customer Support');
      expect(console.log).toHaveBeenCalledWith('🎉 Default agent templates seeding completed!');
    });

    it('should skip existing templates', async () => {
      // Mock search to return existing template for General Assistant
      mockTemplateRepository.searchTemplates.mockImplementation((name: string) => {
        if (name === 'General Assistant') {
          return Promise.resolve([{ name: 'General Assistant', authorId: 'system' } as AgentTemplate]);
        }
        return Promise.resolve([]);
      });
      mockTemplateRepository.create.mockResolvedValue({} as AgentTemplate);

      await service.seedDefaultTemplates();

      // Should create 4 templates (skipping General Assistant)
      expect(mockTemplateRepository.create).toHaveBeenCalledTimes(4);

      // Should log skip message for existing template
      expect(console.log).toHaveBeenCalledWith('⏭️  Template already exists: General Assistant');
      // Should log creation messages for new templates
      expect(console.log).toHaveBeenCalledWith('✅ Created template: Code Reviewer');
    });

    it('should handle template creation errors', async () => {
      mockTemplateRepository.searchTemplates.mockResolvedValue([]);
      mockTemplateRepository.create.mockImplementation((template: any) => {
        if (template.name === 'General Assistant') {
          throw new Error('Creation failed');
        }
        return Promise.resolve({} as AgentTemplate);
      });

      await service.seedDefaultTemplates();

      // Should still try to create all templates
      expect(mockTemplateRepository.create).toHaveBeenCalledTimes(5);

      // Should log error for failed template
      expect(console.error).toHaveBeenCalledWith(
        '❌ Failed to create template General Assistant:',
        expect.any(Error)
      );

      // Should still log success for other templates
      expect(console.log).toHaveBeenCalledWith('✅ Created template: Code Reviewer');
      expect(console.log).toHaveBeenCalledWith('🎉 Default agent templates seeding completed!');
    });

    it('should create templates with correct structure', async () => {
      mockTemplateRepository.searchTemplates.mockResolvedValue([]);
      mockTemplateRepository.create.mockResolvedValue({} as AgentTemplate);

      await service.seedDefaultTemplates();

      // Check General Assistant template structure
      expect(mockTemplateRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'General Assistant',
          description: expect.stringContaining('helpful general-purpose assistant'),
          category: 'general',
          tags: ['general', 'helpful', 'assistant', 'versatile'],
          systemPrompt: expect.stringContaining('You are a helpful, knowledgeable'),
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          authorId: 'system',
          isPublic: true,
          rating: 4.5,
          icon: '🤖',
          previewPrompts: expect.arrayContaining(['Help me plan my day'])
        })
      );

      // Check Code Reviewer template structure
      expect(mockTemplateRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Code Reviewer',
          category: 'coding',
          temperature: 0.3,
          maxTokens: 3000,
          icon: '🔍'
        })
      );
    });
  });
});