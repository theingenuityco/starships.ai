/**
 * ToolEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the ToolEntity class.
 */

import { ToolEntity } from '@/entities/ToolEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('ToolEntity', () => {
  let testHelper: EntityTestHelper<ToolEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(ToolEntity, 'ToolEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const tool = new ToolEntity();
      tool.id = 'tool-123';
      tool.slug = 'test-tool';
      tool.starshipId = 'starship-456';
      tool.name = 'Test Tool';
      tool.description = 'A test tool';
      tool.parameters = {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Input parameter',
          },
        },
        required: ['input'],
      };
      tool.blueprint = { nodes: [], edges: [] };
      tool.isEnabled = true;
      tool.createdAt = '2024-01-01T00:00:00.000Z';
      tool.updatedAt = '2024-01-02T12:00:00.000Z';

      const serialized = toDatabase(tool);

      expect(serialized.id).toBe('tool-123');
      expect(serialized.slug).toBe('test-tool');
      expect(serialized.starship_id).toBe('starship-456');
      expect(serialized.name).toBe('Test Tool');
      expect(serialized.description).toBe('A test tool');
      expect(serialized.is_enabled).toBe(true);
    });

    it('should handle optional fields', async () => {
      const tool = new ToolEntity();
      tool.id = 'tool-123';
      tool.slug = 'test-tool';
      tool.starshipId = 'starship-456';
      tool.name = 'Test Tool';
      tool.description = 'A test tool';
      tool.parameters = { type: 'object', properties: {} };
      tool.blueprint = { nodes: [], edges: [] };
      tool.createdAt = '2024-01-01T00:00:00.000Z';
      tool.updatedAt = '2024-01-02T12:00:00.000Z';
      tool.templateId = 'template-789';
      tool.transforms = [{ path: 'input', operation: 'replace', value: 'transformed' }];
      tool.mutations = [{ path: 'output', operation: 'replace', value: 'mutated' }];
      tool.condition = 'state.ready === true';
      tool.configuration = { apiKey: 'test-key' };

      const serialized = toDatabase(tool);

      expect(serialized.template_id).toBe('template-789');
      expect(serialized.transforms).toEqual([{ path: 'input', operation: 'replace', value: 'transformed' }]);
      expect(serialized.mutations).toEqual([{ path: 'output', operation: 'replace', value: 'mutated' }]);
      expect(serialized.condition).toBe('state.ready === true');
      expect(serialized.configuration).toEqual({ apiKey: 'test-key' });
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'tool-123',
        slug: 'test-tool',
        starshipId: 'starship-456',
        name: 'Test Tool',
        description: 'A test tool',
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
        isEnabled: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(ToolEntity, databaseRecord);

      expect(entity).toBeInstanceOf(ToolEntity);
      expect(entity.id).toBe('tool-123');
      expect(entity.slug).toBe('test-tool');
      expect(entity.name).toBe('Test Tool');
      expect(entity.description).toBe('A test tool');
      expect(entity.isEnabled).toBe(true);
    });

    it('should handle optional transform and mutation fields', async () => {
      const databaseRecord = {
        id: 'tool-123',
        slug: 'complex-tool',
        starshipId: 'starship-456',
        templateId: 'template-789',
        name: 'Complex Tool',
        description: 'A complex tool',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [], edges: [] },
        transforms: [{ path: 'input', operation: 'replace', value: 'transformed' }],
        mutations: [{ path: 'output', operation: 'replace', value: 'mutated' }],
        condition: 'state.ready === true',
        configuration: { timeout: 5000 },
        isEnabled: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(ToolEntity, databaseRecord);

      expect(entity.templateId).toBe('template-789');
      expect(entity.transforms).toEqual([{ path: 'input', operation: 'replace', value: 'transformed' }]);
      expect(entity.mutations).toEqual([{ path: 'output', operation: 'replace', value: 'mutated' }]);
      expect(entity.condition).toBe('state.ready === true');
      expect(entity.configuration).toEqual({ timeout: 5000 });
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'tool-1',
          slug: 'tool-1',
          starshipId: 'starship-456',
          name: 'Tool 1',
          description: 'First tool',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          isEnabled: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          id: 'tool-2',
          slug: 'tool-2',
          starshipId: 'starship-456',
          name: 'Tool 2',
          description: 'Second tool',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          isEnabled: false,
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(ToolEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(ToolEntity);
      expect(entities[1]).toBeInstanceOf(ToolEntity);
      expect(entities[0].isEnabled).toBe(true);
      expect(entities[1].isEnabled).toBe(false);
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        slug: 'test-tool',
        starshipId: 'starship-456',
        name: 'Test Tool',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [], edges: [] },
      };

      await expect(ToolEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        slug: 'test-tool',
        starshipId: 'starship-456',
        // name is missing
        description: 'A test tool',
      };

      await expect(ToolEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate name length constraints', async () => {
      await expect(
        ToolEntity.validate({
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: '',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        ToolEntity.validate({
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: 'a'.repeat(101),
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        ToolEntity.validate({
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: 'Valid Tool Name',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
        })
      ).resolves.not.toThrow();
    });

    it('should validate description length constraints', async () => {
      await expect(
        ToolEntity.validate({
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: 'Test Tool',
          description: 'a'.repeat(4001),
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        ToolEntity.validate({
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: 'Test Tool',
          description: 'Valid description',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
        })
      ).resolves.not.toThrow();
    });

    it('should validate parameters is an object', async () => {
      await expect(
        ToolEntity.validate({
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: 'Test Tool',
          description: 'A test tool',
          parameters: 'not-an-object',
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        ToolEntity.validate({
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: 'Test Tool',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
        })
      ).resolves.not.toThrow();
    });

    it('should validate blueprint is an object', async () => {
      await expect(
        ToolEntity.validate({
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: 'Test Tool',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          blueprint: 'not-an-object',
        })
      ).rejects.toThrow();

      await expect(
        ToolEntity.validate({
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: 'Test Tool',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
        })
      ).resolves.not.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        name: 'Updated Tool Name',
      };

      await expect(ToolEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(ToolEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(ToolEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(ToolEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'tool-123',
        slug: 'complex-tool',
        starshipId: 'starship-456',
        templateId: 'template-789',
        name: 'Complex Tool',
        description: 'A tool with all features',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input' },
            count: { type: 'number', description: 'Count' },
          },
          required: ['input'],
        },
        blueprint: { nodes: [{ id: 'node1', type: 'start' }], edges: [] },
        transforms: [{ path: 'input', operation: 'replace', value: 'transformed' }],
        mutations: [{ path: 'output', operation: 'replace', value: 'mutated' }],
        condition: 'state.ready === true',
        configuration: { timeout: 5000, retries: 3 },
        isEnabled: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete tool data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as ToolEntity;
      expect(entity.name).toBe('Complex Tool');
      expect(entity.slug).toBe('complex-tool');
      expect(entity.isEnabled).toBe(true);
    });

    it('should handle round-trip with minimal data', async () => {
      const minimalData = {
        id: 'tool-123',
        slug: 'simple-tool',
        starshipId: 'starship-456',
        name: 'Simple Tool',
        description: 'A simple tool',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [], edges: [] },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: minimalData, description: 'minimal tool data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as ToolEntity;
      expect(entity.transforms).toBeUndefined();
      expect(entity.mutations).toBeUndefined();
      expect(entity.condition).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(ToolEntity, null)).toThrow();
      expect(() => fromDatabase(ToolEntity, undefined)).toThrow();
      expect(() => fromDatabase(ToolEntity, 'not an object')).toThrow();
    });

    it('should handle empty array deserialization', async () => {
      const emptyArray: never[] = [];
      const entities = fromDatabaseArray(ToolEntity, emptyArray);

      expect(entities).toHaveLength(0);
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle complex parameter schemas', async () => {
      const complexParameters = {
        type: 'object',
        properties: {
          simpleString: { type: 'string', description: 'Simple string' },
          numberWithRange: { type: 'number', minimum: 0, maximum: 100 },
          enumValue: { type: 'string', enum: ['option1', 'option2', 'option3'] },
          nestedObject: {
            type: 'object',
            properties: {
              nested1: { type: 'string' },
              nested2: { type: 'number' },
            },
          },
          arrayOfStrings: { type: 'array', items: { type: 'string' } },
        },
        required: ['simpleString', 'numberWithRange'],
      };

      const record = {
        id: 'tool-123',
        slug: 'complex-tool',
        starshipId: 'starship-456',
        name: 'Complex Tool',
        description: 'A tool with complex parameters',
        parameters: complexParameters,
        blueprint: { nodes: [], edges: [] },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(ToolEntity, record);
      expect(entity.parameters).toEqual(complexParameters);

      const serialized = toDatabase(entity);
      const deserialized = fromDatabase(ToolEntity, serialized);
      expect(deserialized.parameters).toEqual(complexParameters);
    });

    it('should handle special characters in description', async () => {
      const specialDescriptions = [
        'Description with "quotes"',
        "Description with 'apostrophes'",
        'Description with émojis 🔧',
        'Unicode test: αβγδε',
        'Code example: const x = { y: "z" };',
      ];

      for (const description of specialDescriptions) {
        const record = {
          id: 'tool-123',
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: 'Test Tool',
          description,
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(ToolEntity, record);
        expect(entity.description).toBe(description);
      }
    });

    it('should handle empty and populated configuration objects', async () => {
      const configurations = [
        {},
        { key: 'value' },
        { nested: { key: 'value' }, array: [1, 2, 3] },
        { apiKey: 'test', timeout: 5000, retries: 3, debug: true },
      ];

      for (const configuration of configurations) {
        const record = {
          id: 'tool-123',
          slug: 'test-tool',
          starshipId: 'starship-456',
          name: 'Test Tool',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          blueprint: { nodes: [], edges: [] },
          configuration,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        const entity = fromDatabase(ToolEntity, record);
        expect(entity.configuration).toEqual(configuration);
      }
    });

    it('should handle multiple transforms and mutations', async () => {
      const record = {
        id: 'tool-123',
        slug: 'transform-tool',
        starshipId: 'starship-456',
        name: 'Transform Tool',
        description: 'A tool with transforms',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [], edges: [] },
        transforms: [
          { path: 'input.name', operation: 'replace', value: 'transformed' },
          { path: 'input.email', operation: 'add', value: 'test@example.com' },
          { path: 'input.age', operation: 'replace', value: 25 },
        ],
        mutations: [
          { path: 'output.result', operation: 'replace', value: 'mutated' },
          { path: 'output.timestamp', operation: 'add', value: new Date().toISOString() },
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(ToolEntity, record);
      expect(entity.transforms).toHaveLength(3);
      expect(entity.mutations).toHaveLength(2);
    });
  });
});
