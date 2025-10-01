/**
 * AgentTemplateEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the AgentTemplateEntity class.
 */

import { AgentTemplateEntity } from '@/entities/AgentTemplateEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('AgentTemplateEntity', () => {
  let testHelper: EntityTestHelper<AgentTemplateEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(AgentTemplateEntity, 'AgentTemplateEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const template = new AgentTemplateEntity();
      template.id = 'template-123';
      template.slug = 'test-template';
      template.name = 'Test Template';
      template.model = 'gpt-4';
      template.temperature = 0.7;
      template.maxTokens = 4000;
      template.timeout = 30000;
      template.state = { messages: [], tools: [] };
      template.blueprint = { nodes: [], edges: [] };
      template.category = 'general';
      template.usageCount = 0;
      template.createdAt = '2024-01-01T00:00:00.000Z';
      template.updatedAt = '2024-01-02T12:00:00.000Z';

      const serialized = toDatabase(template);

      expect(serialized).toEqual({
        id: 'template-123',
        slug: 'test-template',
        name: 'Test Template',
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 4000,
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        category: 'general',
        usage_count: 0,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should handle optional fields', async () => {
      const template = new AgentTemplateEntity();
      template.id = 'template-123';
      template.slug = 'test-template';
      template.name = 'Test Template';
      template.model = 'gpt-4';
      template.timeout = 30000;
      template.state = { messages: [], tools: [] };
      template.blueprint = { nodes: [], edges: [] };
      template.category = 'coding';
      template.usageCount = 10;
      template.createdAt = '2024-01-01T00:00:00.000Z';
      template.updatedAt = '2024-01-02T12:00:00.000Z';
      template.description = 'Test Description';
      template.systemPrompt = 'You are a coding assistant';
      template.icon = '🤖';
      template.previewPrompts = ['Example 1', 'Example 2'];
      template.assignedToolSlugs = ['tool-1', 'tool-2'];

      const serialized = toDatabase(template);

      expect(serialized.description).toBe('Test Description');
      expect(serialized.system_prompt).toBe('You are a coding assistant');
      expect(serialized.icon).toBe('🤖');
      expect(serialized.preview_prompts).toEqual(['Example 1', 'Example 2']);
      expect(serialized.assigned_tool_slugs).toEqual(['tool-1', 'tool-2']);
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'template-123',
        slug: 'test-template',
        name: 'Test Template',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        category: 'general',
        usageCount: 5,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(AgentTemplateEntity, databaseRecord);

      expect(entity).toBeInstanceOf(AgentTemplateEntity);
      expect(entity.id).toBe('template-123');
      expect(entity.slug).toBe('test-template');
      expect(entity.name).toBe('Test Template');
      expect(entity.category).toBe('general');
      expect(entity.usageCount).toBe(5);
    });

    it('should handle optional template metadata fields', async () => {
      const databaseRecord = {
        id: 'template-123',
        slug: 'coding-assistant',
        name: 'Coding Assistant',
        model: 'gpt-4',
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        category: 'coding',
        usageCount: 100,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        icon: '💻',
        previewPrompts: ['Write a function', 'Debug this code'],
        assignedToolSlugs: ['github', 'terminal'],
      };

      const entity = fromDatabase(AgentTemplateEntity, databaseRecord);

      expect(entity.icon).toBe('💻');
      expect(entity.previewPrompts).toEqual(['Write a function', 'Debug this code']);
      expect(entity.assignedToolSlugs).toEqual(['github', 'terminal']);
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'template-1',
          slug: 'template-1',
          name: 'Template 1',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 10,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          id: 'template-2',
          slug: 'template-2',
          name: 'Template 2',
          model: 'claude-3',
          timeout: 45000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'coding',
          usageCount: 50,
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(AgentTemplateEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(AgentTemplateEntity);
      expect(entities[1]).toBeInstanceOf(AgentTemplateEntity);
      expect(entities[0].category).toBe('general');
      expect(entities[1].category).toBe('coding');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        slug: 'test-template',
        name: 'Test Template',
        model: 'gpt-4',
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        category: 'general',
        usageCount: 0,
      };

      await expect(AgentTemplateEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        slug: 'test-template',
        name: 'Test Template',
        // model is missing
      };

      await expect(AgentTemplateEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate slug length constraints', async () => {
      await expect(
        AgentTemplateEntity.validate({
          slug: '',
          name: 'Test Template',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
        })
      ).rejects.toThrow();

      await expect(
        AgentTemplateEntity.validate({
          slug: 'a'.repeat(101),
          name: 'Test Template',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
        })
      ).rejects.toThrow();

      await expect(
        AgentTemplateEntity.validate({
          slug: 'valid-slug',
          name: 'Test Template',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
        })
      ).resolves.not.toThrow();
    });

    it('should validate category enum constraints', async () => {
      const validCategories = ['general', 'coding', 'creative', 'analysis', 'support', 'utility', 'data', 'communication', 'automation'];

      for (const category of validCategories) {
        await expect(
          AgentTemplateEntity.validate({
            slug: 'test-template',
            name: 'Test Template',
            model: 'gpt-4',
            timeout: 30000,
            state: { messages: [], tools: [] },
            blueprint: { nodes: [], edges: [] },
            category,
            usageCount: 0,
          })
        ).resolves.not.toThrow();
      }

      await expect(
        AgentTemplateEntity.validate({
          slug: 'test-template',
          name: 'Test Template',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'invalid-category',
          usageCount: 0,
        })
      ).rejects.toThrow();
    });

    it('should validate icon length constraints', async () => {
      await expect(
        AgentTemplateEntity.validate({
          slug: 'test-template',
          name: 'Test Template',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
          icon: '',
        })
      ).rejects.toThrow();

      await expect(
        AgentTemplateEntity.validate({
          slug: 'test-template',
          name: 'Test Template',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
          icon: 'a'.repeat(11),
        })
      ).rejects.toThrow();

      await expect(
        AgentTemplateEntity.validate({
          slug: 'test-template',
          name: 'Test Template',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
          icon: '🤖',
        })
      ).resolves.not.toThrow();
    });

    it('should validate assignedToolSlugs as array of strings', async () => {
      await expect(
        AgentTemplateEntity.validate({
          slug: 'test-template',
          name: 'Test Template',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
          assignedToolSlugs: ['tool-1', 'tool-2'],
        })
      ).resolves.not.toThrow();

      await expect(
        AgentTemplateEntity.validate({
          slug: 'test-template',
          name: 'Test Template',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
          assignedToolSlugs: 'not-an-array',
        })
      ).rejects.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        name: 'Updated Template Name',
      };

      await expect(AgentTemplateEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(AgentTemplateEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(AgentTemplateEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(AgentTemplateEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'template-123',
        slug: 'coding-assistant',
        name: 'Coding Assistant',
        description: 'A helpful coding assistant',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        timeout: 30000,
        systemPrompt: 'You are a coding assistant',
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        category: 'coding',
        usageCount: 100,
        icon: '💻',
        previewPrompts: ['Write a function', 'Debug code'],
        assignedToolSlugs: ['github', 'terminal'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete template data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as AgentTemplateEntity;
      expect(entity.slug).toBe('coding-assistant');
      expect(entity.name).toBe('Coding Assistant');
      expect(entity.category).toBe('coding');
      expect(entity.usageCount).toBe(100);
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(AgentTemplateEntity, null)).toThrow();
      expect(() => fromDatabase(AgentTemplateEntity, undefined)).toThrow();
      expect(() => fromDatabase(AgentTemplateEntity, 'not an object')).toThrow();
    });

    it('should handle empty array deserialization', async () => {
      const emptyArray: never[] = [];
      const entities = fromDatabaseArray(AgentTemplateEntity, emptyArray);

      expect(entities).toHaveLength(0);
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle all valid categories', async () => {
      const categories = ['general', 'coding', 'creative', 'analysis', 'support', 'utility', 'data', 'communication', 'automation'];

      for (const category of categories) {
        const record = {
          id: 'template-123',
          slug: `template-${category}`,
          name: `Template for ${category}`,
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          category,
          usageCount: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(AgentTemplateEntity, record);
        expect(entity.category).toBe(category);
      }
    });

    it('should handle special characters in fields', async () => {
      const specialData = {
        id: 'template-123',
        slug: 'special-template',
        name: 'Template with émojis 🚀',
        description: 'Description with "quotes" and \'apostrophes\'',
        model: 'gpt-4',
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        category: 'general',
        usageCount: 0,
        icon: '🤖',
        previewPrompts: ['Prompt with émojis 🎨', 'Another "quoted" prompt'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(AgentTemplateEntity, specialData);
      expect(entity.name).toBe('Template with émojis 🚀');
      expect(entity.icon).toBe('🤖');

      const serialized = toDatabase(entity);
      const deserialized = fromDatabase(AgentTemplateEntity, serialized);
      expect(deserialized.name).toBe(entity.name);
    });

    it('should handle empty arrays for optional array fields', async () => {
      const dataWithEmptyArrays = {
        id: 'template-123',
        slug: 'test-template',
        name: 'Test Template',
        model: 'gpt-4',
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        category: 'general',
        usageCount: 0,
        previewPrompts: [],
        assignedToolSlugs: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(AgentTemplateEntity, dataWithEmptyArrays);
      expect(entity.previewPrompts).toEqual([]);
      expect(entity.assignedToolSlugs).toEqual([]);
    });
  });
});
