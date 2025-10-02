/**
 * ToolTemplateEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the ToolTemplateEntity class.
 */

import { ToolTemplateEntity } from '@/entities/ToolTemplateEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('ToolTemplateEntity', () => {
  let testHelper: EntityTestHelper<ToolTemplateEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(ToolTemplateEntity, 'ToolTemplateEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const template = new ToolTemplateEntity();
      template.id = 'template-123';
      template.slug = 'test-template';
      template.name = 'Test Template';
      template.description = 'A test tool template';
      template.parameters = {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Input parameter',
          },
        },
        required: ['input'],
      };
      template.blueprint = { nodes: [], edges: [] };
      template.category = 'general';
      template.usageCount = 0;
      template.createdAt = '2024-01-01T00:00:00.000Z';
      template.updatedAt = '2024-01-02T12:00:00.000Z';

      const serialized = toDatabase(template);

      expect(serialized.id).toBe('template-123');
      expect(serialized.slug).toBe('test-template');
      expect(serialized.name).toBe('Test Template');
      expect(serialized.description).toBe('A test tool template');
      expect(serialized.category).toBe('general');
      expect(serialized.usage_count).toBe(0);
    });

    it('should handle optional fields', async () => {
      const template = new ToolTemplateEntity();
      template.id = 'template-123';
      template.slug = 'test-template';
      template.name = 'Test Template';
      template.description = 'A test tool template';
      template.parameters = { type: 'object', properties: {} };
      template.blueprint = { nodes: [], edges: [] };
      template.category = 'utility';
      template.usageCount = 10;
      template.createdAt = '2024-01-01T00:00:00.000Z';
      template.updatedAt = '2024-01-02T12:00:00.000Z';
      template.transforms = [{ path: 'input', operation: 'replace', value: 'transformed' }];
      template.mutations = [{ path: 'output', operation: 'replace', value: 'mutated' }];
      template.condition = 'state.ready === true';
      template.exampleUsage = 'Example of how to use this tool';
      template.requiresApiKey = true;
      template.configurationFields = [{ name: 'apiKey', type: 'string', description: 'API Key', required: true }];

      const serialized = toDatabase(template);

      expect(serialized.transforms).toBeDefined();
      expect(serialized.mutations).toBeDefined();
      expect(serialized.condition).toBe('state.ready === true');
      expect(serialized.example_usage).toBe('Example of how to use this tool');
      expect(serialized.requires_api_key).toBe(true);
      expect(serialized.configuration_fields).toHaveLength(1);
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'template-123',
        slug: 'test-template',
        name: 'Test Template',
        description: 'A test tool template',
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Input parameter',
            },
          },
        },
        blueprint: { nodes: [], edges: [] },
        category: 'general',
        usageCount: 5,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(ToolTemplateEntity, databaseRecord);

      expect(entity).toBeInstanceOf(ToolTemplateEntity);
      expect(entity.id).toBe('template-123');
      expect(entity.slug).toBe('test-template');
      expect(entity.name).toBe('Test Template');
      expect(entity.category).toBe('general');
      expect(entity.usageCount).toBe(5);
    });

    it('should handle optional configuration fields', async () => {
      const databaseRecord = {
        id: 'template-123',
        slug: 'api-tool',
        name: 'API Tool',
        description: 'A tool that requires API configuration',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [], edges: [] },
        category: 'utility',
        usageCount: 50,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        exampleUsage: 'Call the API with your key',
        requiresApiKey: true,
        configurationFields: [
          { name: 'apiKey', type: 'string', description: 'API Key', required: true },
          { name: 'timeout', type: 'number', description: 'Timeout in ms', required: false },
        ],
      };

      const entity = fromDatabase(ToolTemplateEntity, databaseRecord);

      expect(entity.exampleUsage).toBe('Call the API with your key');
      expect(entity.requiresApiKey).toBe(true);
      expect(entity.configurationFields).toHaveLength(2);
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'template-1',
          slug: 'template-1',
          name: 'Template 1',
          description: 'First template',
          parameters: { type: 'object', properties: {} },
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
          description: 'Second template',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          category: 'utility',
          usageCount: 25,
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(ToolTemplateEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(ToolTemplateEntity);
      expect(entities[1]).toBeInstanceOf(ToolTemplateEntity);
      expect(entities[0].category).toBe('general');
      expect(entities[1].category).toBe('utility');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        slug: 'test-template',
        name: 'Test Template',
        description: 'A test tool template',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [], edges: [] },
        category: 'general',
        usageCount: 0,
      };

      await expect(ToolTemplateEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        // slug is missing
        name: 'Test Template',
        description: 'A test tool template',
      };

      await expect(ToolTemplateEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate name length constraints', async () => {
      await expect(
        ToolTemplateEntity.validate({
          slug: 'test-template',
          name: '',
          description: 'A test tool template',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
        })
      ).rejects.toThrow();

      await expect(
        ToolTemplateEntity.validate({
          slug: 'test-template',
          name: 'a'.repeat(101),
          description: 'A test tool template',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
        })
      ).rejects.toThrow();

      await expect(
        ToolTemplateEntity.validate({
          slug: 'test-template',
          name: 'Valid Template Name',
          description: 'A test tool template',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
        })
      ).resolves.not.toThrow();
    });

    it('should validate description length constraints', async () => {
      await expect(
        ToolTemplateEntity.validate({
          slug: 'test-template',
          name: 'Test Template',
          description: 'a'.repeat(4001),
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
        })
      ).rejects.toThrow();

      await expect(
        ToolTemplateEntity.validate({
          slug: 'test-template',
          name: 'Test Template',
          description: 'Valid description',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
        })
      ).resolves.not.toThrow();
    });

    it('should validate category is a valid string', async () => {
      const validCategories = ['general', 'coding', 'creative', 'analysis', 'support', 'utility', 'data', 'communication', 'automation'];

      for (const category of validCategories) {
        await expect(
          ToolTemplateEntity.validate({
            slug: 'test-template',
            name: 'Test Template',
            description: 'A test tool template',
            parameters: { type: 'object', properties: {} },
            blueprint: { nodes: [], edges: [] },
            category,
            usageCount: 0,
          })
        ).resolves.not.toThrow();
      }
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        name: 'Updated Template Name',
      };

      await expect(ToolTemplateEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(ToolTemplateEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(ToolTemplateEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(ToolTemplateEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'template-123',
        slug: 'complex-template',
        name: 'Complex Template',
        description: 'A template with all features',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input' },
            count: { type: 'number', description: 'Count' },
          },
          required: ['input'],
        },
        blueprint: { nodes: [{ id: 'node1', type: 'start' }], edges: [] },
        category: 'utility',
        usageCount: 100,
        transforms: [{ path: 'input', operation: 'replace', value: 'transformed' }],
        mutations: [{ path: 'output', operation: 'replace', value: 'mutated' }],
        condition: 'state.ready === true',
        exampleUsage: 'Example usage text',
        requiresApiKey: true,
        configurationFields: [{ name: 'apiKey', type: 'string', description: 'API Key', required: true }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete template data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as ToolTemplateEntity;
      expect(entity.name).toBe('Complex Template');
      expect(entity.slug).toBe('complex-template');
      expect(entity.usageCount).toBe(100);
    });

    it('should handle round-trip with minimal data', async () => {
      const minimalData = {
        id: 'template-123',
        slug: 'simple-template',
        name: 'Simple Template',
        description: 'A simple template',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [], edges: [] },
        category: 'general',
        usageCount: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: minimalData, description: 'minimal template data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as ToolTemplateEntity;
      expect(entity.exampleUsage).toBeUndefined();
      expect(entity.requiresApiKey).toBeUndefined();
      expect(entity.configurationFields).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(ToolTemplateEntity, null)).toThrow();
      expect(() => fromDatabase(ToolTemplateEntity, undefined)).toThrow();
      expect(() => fromDatabase(ToolTemplateEntity, 'not an object')).toThrow();
    });

    it('should handle empty array deserialization', async () => {
      const emptyArray: never[] = [];
      const entities = fromDatabaseArray(ToolTemplateEntity, emptyArray);

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
          description: 'A test template',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          category,
          usageCount: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(ToolTemplateEntity, record);
        expect(entity.category).toBe(category);
      }
    });

    it('should handle configuration fields with different types', async () => {
      const configurationFields = [
        { name: 'stringField', type: 'string', description: 'String field', required: true },
        { name: 'numberField', type: 'number', description: 'Number field', required: false },
        { name: 'booleanField', type: 'boolean', description: 'Boolean field', required: true },
      ];

      const record = {
        id: 'template-123',
        slug: 'config-template',
        name: 'Config Template',
        description: 'A template with configuration',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [], edges: [] },
        category: 'utility',
        usageCount: 0,
        configurationFields,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(ToolTemplateEntity, record);
      expect(entity.configurationFields).toEqual(configurationFields);
    });

    it('should handle special characters in description and example usage', async () => {
      const specialTexts = ['Text with "quotes"', "Text with 'apostrophes'", 'Text with émojis 🛠️', 'Code example: const x = { y: "z" };'];

      for (const text of specialTexts) {
        const record = {
          id: 'template-123',
          slug: 'test-template',
          name: 'Test Template',
          description: text,
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount: 0,
          exampleUsage: text,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(ToolTemplateEntity, record);
        expect(entity.description).toBe(text);
        expect(entity.exampleUsage).toBe(text);
      }
    });

    it('should handle templates with and without API key requirements', async () => {
      const withApiKey = {
        id: 'template-123',
        slug: 'api-template',
        name: 'API Template',
        description: 'Requires API key',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [], edges: [] },
        category: 'utility',
        usageCount: 0,
        requiresApiKey: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const withoutApiKey = {
        ...withApiKey,
        id: 'template-456',
        slug: 'no-api-template',
        requiresApiKey: false,
      };

      const entityWith = fromDatabase(ToolTemplateEntity, withApiKey);
      const entityWithout = fromDatabase(ToolTemplateEntity, withoutApiKey);

      expect(entityWith.requiresApiKey).toBe(true);
      expect(entityWithout.requiresApiKey).toBe(false);
    });

    it('should handle varying usage counts', async () => {
      const usageCounts = [0, 1, 100, 1000, 999999];

      for (const usageCount of usageCounts) {
        const record = {
          id: 'template-123',
          slug: 'test-template',
          name: 'Test Template',
          description: 'A test template',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          category: 'general',
          usageCount,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(ToolTemplateEntity, record);
        expect(entity.usageCount).toBe(usageCount);
      }
    });
  });
});
