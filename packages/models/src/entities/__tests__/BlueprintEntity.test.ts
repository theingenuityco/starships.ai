/**
 * BlueprintEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the BlueprintEntity class.
 */

import { BlueprintEntity } from '@/entities/BlueprintEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('BlueprintEntity', () => {
  let testHelper: EntityTestHelper<BlueprintEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(BlueprintEntity, 'BlueprintEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const blueprint = new BlueprintEntity();
      blueprint.id = 'blueprint-123';
      blueprint.name = 'Test Blueprint';
      blueprint.description = 'A test blueprint';
      blueprint.category = 'workflow';
      blueprint.usageCount = 5;
      blueprint.metadata = { version: '1.0', tags: ['test'] };
      blueprint.nodes = [
        {
          ref: 'node1',
          type: 'start',
          name: 'Start Node',
          description: 'Starting node',
          parameters: {},
        },
      ];
      blueprint.edges = [
        {
          ref: 'edge1',
          from: 'node1',
          to: 'node2',
        },
      ];
      blueprint.createdAt = '2024-01-01T00:00:00.000Z';
      blueprint.updatedAt = '2024-01-01T00:05:00.000Z';

      const serialized = toDatabase(blueprint);

      expect(serialized).toEqual({
        id: 'blueprint-123',
        name: 'Test Blueprint',
        description: 'A test blueprint',
        category: 'workflow',
        usageCount: 5,
        metadata: JSON.stringify({ version: '1.0', tags: ['test'] }),
        nodes: JSON.stringify([{ ref: 'node1', type: 'start', name: 'Start Node', description: 'Starting node', parameters: {} }]),
        edges: JSON.stringify([{ ref: 'edge1', from: 'node1', to: 'node2' }]),
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
      });
    });

    it('should handle optional fields', async () => {
      const blueprint = new BlueprintEntity();
      blueprint.id = 'blueprint-123';
      blueprint.nodes = [];
      blueprint.edges = [];

      const serialized = toDatabase(blueprint);

      expect(serialized.name).toBeUndefined();
      expect(serialized.description).toBeUndefined();
      expect(serialized.category).toBeUndefined();
      expect(serialized.usageCount).toBeUndefined();
      expect(serialized.metadata).toBeUndefined();
      expect(serialized.createdAt).toBeUndefined();
      expect(serialized.updatedAt).toBeUndefined();
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'blueprint-123',
        name: 'Test Blueprint',
        description: 'A test blueprint',
        category: 'automation',
        usageCount: 10,
        metadata: JSON.stringify({ version: '2.0', author: 'test-user' }),
        nodes: JSON.stringify([
          { id: 'start', type: 'start', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'end', type: 'end', position: { x: 200, y: 0 }, parameters: {} },
        ]),
        edges: JSON.stringify([{ id: 'edge1', source: 'start', target: 'end' }]),
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
      };

      const entity = fromDatabase(BlueprintEntity, databaseRecord);

      expect(entity).toBeInstanceOf(BlueprintEntity);
      expect(entity.id).toBe('blueprint-123');
      expect(entity.name).toBe('Test Blueprint');
      expect(entity.description).toBe('A test blueprint');
      expect(entity.category).toBe('automation');
      expect(entity.usageCount).toBe(10);
      expect(entity.metadata).toEqual({ version: '2.0', author: 'test-user' });
      expect(entity.nodes).toEqual([
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'end', type: 'end', position: { x: 200, y: 0 }, parameters: {} },
      ]);
      expect(entity.edges).toEqual([{ id: 'edge1', source: 'start', target: 'end' }]);
    });

    it('should throw on malformed JSON in database record', async () => {
      const databaseRecord = {
        id: 'blueprint-123',
        nodes: 'invalid-json',
        edges: '{"invalid": json}',
        metadata: 'not-json',
      };

      expect(() => fromDatabase(BlueprintEntity, databaseRecord)).toThrow('Unexpected token');
    });

    it('should apply default transformations', async () => {
      const databaseRecord = {
        id: 'blueprint-123',
        // Missing optional fields should get defaults
        nodes: '[]',
        edges: '[]',
      };

      const entity = fromDatabase(BlueprintEntity, databaseRecord);

      expect(entity.name).toBe(''); // Default from transform
      expect(entity.description).toBe(''); // Default from transform
      expect(entity.category).toBe('general'); // Default from transform
      expect(entity.usageCount).toBe(0); // Default from NumberTransform
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'blueprint-1',
          name: 'Blueprint 1',
          category: 'workflow',
          nodes: '[]',
          edges: '[]',
        },
        {
          id: 'blueprint-2',
          name: 'Blueprint 2',
          category: 'automation',
          nodes: '[]',
          edges: '[]',
        },
      ];

      const entities = fromDatabaseArray(BlueprintEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(BlueprintEntity);
      expect(entities[1]).toBeInstanceOf(BlueprintEntity);
      expect(entities[0].name).toBe('Blueprint 1');
      expect(entities[1].name).toBe('Blueprint 2');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        name: 'Test Blueprint',
        description: 'A test blueprint',
        category: 'workflow',
        nodes: [],
        edges: [],
      };

      await expect(BlueprintEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should pass validation with minimal data', async () => {
      const validData = {
        nodes: [],
        edges: [],
      };

      await expect(BlueprintEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should validate name length constraints', async () => {
      // Too long name
      await expect(
        BlueprintEntity.validate({
          name: 'a'.repeat(256),
          nodes: [],
          edges: [],
        })
      ).rejects.toThrow();

      // Valid name lengths should pass
      await expect(
        BlueprintEntity.validate({
          name: 'a', // Minimum length
          nodes: [],
          edges: [],
        })
      ).resolves.not.toThrow();

      await expect(
        BlueprintEntity.validate({
          name: 'a'.repeat(255), // Maximum length
          nodes: [],
          edges: [],
        })
      ).resolves.not.toThrow();
    });

    it('should validate category constraints', async () => {
      // Invalid category
      await expect(
        BlueprintEntity.validate({
          category: 'invalid-category',
          nodes: [],
          edges: [],
        })
      ).rejects.toThrow();

      // Valid categories should pass
      const validCategories = ['general', 'workflow', 'automation', 'integration', 'analysis'];
      for (const category of validCategories) {
        await expect(
          BlueprintEntity.validate({
            category,
            nodes: [],
            edges: [],
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate usageCount constraints', async () => {
      // Negative usage count
      await expect(
        BlueprintEntity.validate({
          usageCount: -1,
          nodes: [],
          edges: [],
        })
      ).rejects.toThrow();

      // Valid usage counts should pass
      await expect(
        BlueprintEntity.validate({
          usageCount: 0,
          nodes: [],
          edges: [],
        })
      ).resolves.not.toThrow();

      await expect(
        BlueprintEntity.validate({
          usageCount: 1000,
          nodes: [],
          edges: [],
        })
      ).resolves.not.toThrow();
    });

    it('should validate required arrays', async () => {
      // Missing nodes array
      await expect(
        BlueprintEntity.validate({
          edges: [],
        })
      ).rejects.toThrow();

      // Missing edges array
      await expect(
        BlueprintEntity.validate({
          nodes: [],
        })
      ).rejects.toThrow();

      // Non-array values
      await expect(
        BlueprintEntity.validate({
          nodes: 'not-an-array',
          edges: [],
        })
      ).rejects.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        name: 'Updated Blueprint Name',
      };

      await expect(BlueprintEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(BlueprintEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(BlueprintEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(BlueprintEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Complex Blueprint Structures', () => {
    it('should handle complex blueprint with multiple nodes and edges', async () => {
      const complexBlueprint = {
        id: 'complex-blueprint-123',
        name: 'Complex Workflow',
        description: 'A complex multi-step workflow',
        category: 'workflow',
        usageCount: 15,
        metadata: {
          version: '2.1.0',
          author: 'workflow-designer',
          tags: ['complex', 'multi-step'],
          lastModified: '2024-01-01T00:00:00.000Z',
        },
        nodes: [
          {
            id: 'start',
            type: 'start',
            position: { x: 0, y: 0 },
            parameters: { message: 'Starting workflow' },
          },
          {
            id: 'condition',
            type: 'conditional',
            position: { x: 200, y: 0 },
            parameters: { condition: 'input.value > 10' },
          },
          {
            id: 'process-a',
            type: 'llm',
            position: { x: 400, y: -100 },
            parameters: { model: 'gpt-4', temperature: 0.7 },
          },
          {
            id: 'process-b',
            type: 'http',
            position: { x: 400, y: 100 },
            parameters: { url: 'https://api.example.com/process', method: 'POST' },
          },
          {
            id: 'end',
            type: 'end',
            position: { x: 600, y: 0 },
            parameters: {},
          },
        ],
        edges: [
          { id: 'edge-1', source: 'start', target: 'condition' },
          { id: 'edge-2', source: 'condition', target: 'process-a', condition: 'true' },
          { id: 'edge-3', source: 'condition', target: 'process-b', condition: 'false' },
          { id: 'edge-4', source: 'process-a', target: 'end' },
          { id: 'edge-5', source: 'process-b', target: 'end' },
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T12:00:00.000Z',
      };

      // Test serialization
      const entity = fromDatabase(BlueprintEntity, {
        ...complexBlueprint,
        metadata: JSON.stringify(complexBlueprint.metadata),
        nodes: JSON.stringify(complexBlueprint.nodes),
        edges: JSON.stringify(complexBlueprint.edges),
      });

      expect(entity).toBeInstanceOf(BlueprintEntity);
      expect(entity.nodes).toHaveLength(5);
      expect(entity.edges).toHaveLength(5);
      expect(entity.metadata).toEqual(complexBlueprint.metadata);

      // Test round-trip
      const serialized = toDatabase(entity);
      const deserialized = fromDatabase(BlueprintEntity, serialized);

      expect(deserialized.nodes).toEqual(complexBlueprint.nodes);
      expect(deserialized.edges).toEqual(complexBlueprint.edges);
      expect(deserialized.metadata).toEqual(complexBlueprint.metadata);
    });

    it('should handle empty blueprint', async () => {
      const emptyBlueprint = {
        id: 'empty-blueprint-123',
        name: 'Empty Blueprint',
        nodes: [],
        edges: [],
      };

      const entity = fromDatabase(BlueprintEntity, {
        ...emptyBlueprint,
        nodes: JSON.stringify(emptyBlueprint.nodes),
        edges: JSON.stringify(emptyBlueprint.edges),
      });

      expect(entity.nodes).toEqual([]);
      expect(entity.edges).toEqual([]);
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'blueprint-123',
        name: 'Test Blueprint with Special Characters éñ',
        description: 'Description with unicode: αβγ',
        category: 'integration',
        usageCount: 42,
        metadata: JSON.stringify({
          version: '1.0.0',
          complexity: 'medium',
          estimatedTime: 300,
          tags: ['test', 'integration', 'api'],
        }),
        nodes: JSON.stringify([
          { id: 'n1', type: 'start', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n2', type: 'end', position: { x: 100, y: 0 }, parameters: {} },
        ]),
        edges: JSON.stringify([{ id: 'e1', source: 'n1', target: 'n2' }]),
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:30:45.123Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete blueprint data' }]);

      expect(results[0].success).toBe(true);
      expect(results[0].keysMatch).toBe(true);

      // Verify JSON transformations worked correctly
      const entity = results[0].entity as BlueprintEntity;
      expect(entity.metadata).toEqual({
        version: '1.0.0',
        complexity: 'medium',
        estimatedTime: 300,
        tags: ['test', 'integration', 'api'],
      });
      expect(entity.nodes).toHaveLength(2);
      expect(entity.edges).toHaveLength(1);
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(BlueprintEntity, null)).toThrow();
      expect(() => fromDatabase(BlueprintEntity, undefined)).toThrow();
      expect(() => fromDatabase(BlueprintEntity, 'not an object')).toThrow();
    });

    it('should throw on invalid JSON', async () => {
      const invalidRecord = {
        id: 'blueprint-123',
        nodes: 'invalid json {',
        edges: 'also invalid }',
        metadata: '{incomplete json',
      };

      expect(() => fromDatabase(BlueprintEntity, invalidRecord)).toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle all valid categories', async () => {
      const validCategories = ['general', 'workflow', 'automation', 'integration', 'analysis'];

      for (const category of validCategories) {
        const record = {
          id: 'blueprint-123',
          category,
          nodes: '[]',
          edges: '[]',
        };

        const entity = fromDatabase(BlueprintEntity, record);
        expect(entity.category).toBe(category);

        // Should also pass validation
        await expect(
          BlueprintEntity.validate({
            category,
            nodes: [],
            edges: [],
          })
        ).resolves.not.toThrow();
      }
    });

    it('should handle very large blueprints', async () => {
      const largeNodes = Array.from({ length: 100 }, (_, i) => ({
        id: `node-${i}`,
        type: 'llm',
        position: { x: i * 50, y: Math.floor(i / 10) * 50 },
        parameters: { model: 'gpt-4', temperature: 0.5 + (i % 5) * 0.1 },
      }));

      const largeEdges = Array.from({ length: 99 }, (_, i) => ({
        id: `edge-${i}`,
        source: `node-${i}`,
        target: `node-${i + 1}`,
      }));

      const record = {
        id: 'large-blueprint',
        name: 'Large Blueprint',
        nodes: JSON.stringify(largeNodes),
        edges: JSON.stringify(largeEdges),
      };

      const entity = fromDatabase(BlueprintEntity, record);
      expect(entity.nodes).toHaveLength(100);
      expect(entity.edges).toHaveLength(99);

      // Should serialize back correctly
      const serialized = toDatabase(entity);
      const deserialized = fromDatabase(BlueprintEntity, serialized);
      expect(deserialized.nodes).toHaveLength(100);
      expect(deserialized.edges).toHaveLength(99);
    });
  });

  describe('Integration with test helper', () => {
    it('should work with entity test helper validation tests', async () => {
      const validationTestCases = [
        {
          data: { name: 'Valid Blueprint', nodes: [], edges: [] },
          shouldPass: true,
          description: 'valid blueprint data should pass',
        },
        {
          data: { name: 'a'.repeat(256), nodes: [], edges: [] },
          shouldPass: false,
          description: 'name too long should fail',
        },
        {
          data: { category: 'invalid-category', nodes: [], edges: [] },
          shouldPass: false,
          description: 'invalid category should fail',
        },
        {
          data: { usageCount: -1, nodes: [], edges: [] },
          shouldPass: false,
          description: 'negative usage count should fail',
        },
      ];

      const results = await testHelper.testValidation(validationTestCases);

      results.forEach((result, index) => {
        expect(result.passed).toBe(validationTestCases[index].shouldPass);
      });
    });
  });
});
