/**
 * AgentEntity Unit Tests
 *
 * Tests for serialization, deserialization, validation, and transformations
 * of the AgentEntity class using class-transformer and class-validator.
 */

import { AgentEntity } from '@/entities/AgentEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';
import { AgentMemoryState, Blueprint } from '@starships/autopilot';

describe('AgentEntity', () => {
  let testHelper: EntityTestHelper<AgentEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(AgentEntity, 'AgentEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const agent = new AgentEntity();
      agent.id = 'agent-123';
      agent.name = 'Test Agent';
      agent.description = 'A test agent';
      agent.model = 'gpt-4';
      agent.temperature = 0.7;
      agent.maxTokens = 1000;
      agent.timeout = 30000;
      agent.createdAt = '2024-01-01T00:00:00.000Z';
      agent.updatedAt = '2024-01-01T00:00:00.000Z';
      agent.memoryState = { messageHistory: [] } as AgentMemoryState;
      agent.blueprint = { nodes: [], edges: [] } as Blueprint;

      const serialized = toDatabase(agent);

      expect(serialized).toEqual({
        id: 'agent-123',
        name: 'Test Agent',
        description: 'A test agent',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 30000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        memoryState: JSON.stringify({ messageHistory: [] }),
        blueprint: JSON.stringify({ nodes: [], edges: [] }),
      });
    });

    it('should handle null and undefined values during serialization', async () => {
      const agent = new AgentEntity();
      agent.id = 'agent-123';
      agent.name = 'Test Agent';
      agent.model = 'gpt-4';
      agent.timeout = 30000;
      agent.createdAt = '2024-01-01T00:00:00.000Z';
      agent.updatedAt = '2024-01-01T00:00:00.000Z';
      agent.memoryState = {} as AgentMemoryState;
      agent.blueprint = { nodes: [], edges: [] };
      // temperature, maxTokens, description are undefined

      const serialized = toDatabase(agent);

      expect(serialized.temperature).toBeUndefined();
      expect(serialized.maxTokens).toBeUndefined();
      expect(serialized.description).toBeUndefined();
      expect(serialized.memoryState).toBe('{}');
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'agent-123',
        name: 'Test Agent',
        description: 'A test agent',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 30000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        memoryState: '{"messageHistory":[]}',
        blueprint: '{"nodes":[],"edges":[]}',
      };

      const entity = fromDatabase(AgentEntity, databaseRecord);

      expect(entity).toBeInstanceOf(AgentEntity);
      expect(entity.id).toBe('agent-123');
      expect(entity.name).toBe('Test Agent');
      expect(entity.description).toBe('A test agent');
      expect(entity.model).toBe('gpt-4');
      expect(entity.temperature).toBe(0.7);
      expect(entity.maxTokens).toBe(1000);
      expect(entity.timeout).toBe(30000);
      expect(entity.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.updatedAt).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.memoryState).toEqual({ messageHistory: [] });
      expect(entity.blueprint).toEqual({ nodes: [], edges: [] });
    });

    it('should handle malformed JSON in database record', async () => {
      const databaseRecord = {
        id: 'agent-123',
        name: 'Test Agent',
        model: 'gpt-4',
        timeout: 30000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        memoryState: 'invalid-json',
        blueprint: '{"invalid": json}',
      };

      const entity = fromDatabase(AgentEntity, databaseRecord);

      expect(entity).toBeInstanceOf(AgentEntity);
      expect(entity.memoryState).toBeNull();
      expect(entity.blueprint).toBeNull();
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          model: 'gpt-4',
          timeout: 30000,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          memoryState: '{}',
          blueprint: '{"nodes":[],"edges":[]}',
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          model: 'gpt-3.5-turbo',
          timeout: 30000,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          memoryState: '{}',
          blueprint: '{"nodes":[],"edges":[]}',
        },
      ];

      const entities = fromDatabaseArray(AgentEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(AgentEntity);
      expect(entities[1]).toBeInstanceOf(AgentEntity);
      expect(entities[0].id).toBe('agent-1');
      expect(entities[1].id).toBe('agent-2');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        name: 'Test Agent',
        model: 'gpt-4',
        timeout: 30000,
        memoryState: {} as AgentMemoryState,
        blueprint: { nodes: [], edges: [] } as Blueprint,
      };

      await expect(AgentEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields on create', async () => {
      const invalidData = {
        description: 'Missing required fields',
      };

      await expect(AgentEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate name constraints', async () => {
      // Too short name
      await expect(
        AgentEntity.validate({
          name: '',
          model: 'gpt-4',
          timeout: 30000,
          memoryState: {},
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      // Too long name
      await expect(
        AgentEntity.validate({
          name: 'a'.repeat(101),
          model: 'gpt-4',
          timeout: 30000,
          memoryState: {},
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();
    });

    it('should validate temperature constraints', async () => {
      // Temperature below 0
      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          temperature: -1,
          timeout: 30000,
          memoryState: {},
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      // Temperature above 2
      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          temperature: 3,
          timeout: 30000,
          memoryState: {},
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();
    });

    it('should validate maxTokens constraints', async () => {
      // MaxTokens below 1
      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          maxTokens: 0,
          timeout: 30000,
          memoryState: {},
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      // MaxTokens above 100000
      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          maxTokens: 100001,
          timeout: 30000,
          memoryState: {},
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();
    });

    it('should validate timeout constraints', async () => {
      // Timeout below 1000ms
      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          timeout: 500,
          memoryState: {},
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      // Timeout above 300000ms
      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          timeout: 300001,
          memoryState: {},
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        name: 'Updated Name',
      };

      await expect(AgentEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(AgentEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(AgentEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(AgentEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Transformations', () => {
    it('should apply LLM transformations', async () => {
      const testCases = [
        {
          input: {
            id: 'agent-123',
            name: 'Test Agent',
            model: 'gpt-4',
            temperature: '0.7', // String that should be converted to number
            maxTokens: '1000', // String that should be converted to number
            timeout: '30000', // String that should be converted to number
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            memoryState: '{}',
            blueprint: '{"nodes":[],"edges":[]}',
          },
          expected: {
            temperature: 0.7,
            maxTokens: 1000,
            timeout: 30000,
          },
          description: 'should convert string numbers to proper numeric values',
        },
      ];

      const results = await testHelper.testTransformations(testCases);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    it('should clamp temperature values to valid range', async () => {
      const databaseRecord = {
        id: 'agent-123',
        name: 'Test Agent',
        model: 'gpt-4',
        temperature: 5.0, // Above max (2.0)
        timeout: 30000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        memoryState: '{}',
        blueprint: '{"nodes":[],"edges":[]}',
      };

      const entity = fromDatabase(AgentEntity, databaseRecord);
      expect(entity.temperature).toBe(2.0); // Should be clamped to max
    });

    it('should clamp maxTokens to reasonable limits', async () => {
      const databaseRecord = {
        id: 'agent-123',
        name: 'Test Agent',
        model: 'gpt-4',
        maxTokens: 200000, // Above max (100000)
        timeout: 30000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        memoryState: '{}',
        blueprint: '{"nodes":[],"edges":[]}',
      };

      const entity = fromDatabase(AgentEntity, databaseRecord);
      expect(entity.maxTokens).toBe(100000); // Should be clamped to max
    });

    it('should handle date transformations', async () => {
      const databaseRecord = {
        id: 'agent-123',
        name: 'Test Agent',
        model: 'gpt-4',
        timeout: 30000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        memoryState: '{}',
        blueprint: '{"nodes":[],"edges":[]}',
      };

      const entity = fromDatabase(AgentEntity, databaseRecord);

      // Dates should be preserved as ISO strings for entities
      expect(entity.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.updatedAt).toBe('2024-01-02T12:00:00.000Z');
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'agent-123',
        name: 'Test Agent',
        description: 'A comprehensive test agent',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 30000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        memoryState: JSON.stringify({ messages: [{ role: 'system', content: 'Hello' }] }),
        blueprint: JSON.stringify({
          nodes: [{ id: 'node1', type: 'start' }],
          edges: [{ id: 'edge1', source: 'node1', target: 'node2' }],
        }),
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete agent data' }]);

      expect(results[0].success).toBe(true);
      expect(results[0].keysMatch).toBe(true);

      // Verify specific transformations worked correctly
      const entity = results[0].entity as AgentEntity;
      expect(entity.memoryState).toEqual({ messages: [{ role: 'system', content: 'Hello' }] });
      expect(entity.blueprint).toEqual({
        nodes: [{ id: 'node1', type: 'start' }],
        edges: [{ id: 'edge1', source: 'node1', target: 'node2' }],
      });
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(AgentEntity, null)).toThrow();
      expect(() => fromDatabase(AgentEntity, undefined)).toThrow();
      expect(() => fromDatabase(AgentEntity, 'not an object')).toThrow();
    });

    it('should handle array deserialization with mixed data', async () => {
      const mixedData = [
        {
          id: 'agent-1',
          name: 'Valid Agent',
          model: 'gpt-4',
          timeout: 30000,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          memoryState: '{}',
          blueprint: '{"nodes":[],"edges":[]}',
        },
        null, // Invalid item
      ];

      expect(() => fromDatabaseArray(AgentEntity, mixedData)).toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle minimal valid data', async () => {
      const minimalData = {
        id: 'agent-123',
        name: 'Minimal Agent',
        model: 'gpt-3.5-turbo',
        timeout: 30000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        memoryState: '{}',
        blueprint: '{"nodes":[],"edges":[]}',
      };

      const entity = fromDatabase(AgentEntity, minimalData);
      expect(entity).toBeInstanceOf(AgentEntity);
      expect(entity.name).toBe('Minimal Agent');
      expect(entity.description).toBeUndefined();
      expect(entity.temperature).toBeUndefined();
      expect(entity.maxTokens).toBeUndefined();
    });

    it('should handle complex blueprint and memory state', async () => {
      const complexMemoryState = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        context: { userId: 'user-123', sessionId: 'session-456' },
        metadata: { version: '1.0', timestamp: '2024-01-01T00:00:00.000Z' },
      };

      const complexBlueprint = {
        nodes: [
          { id: 'start', type: 'start', position: { x: 0, y: 0 } },
          { id: 'llm', type: 'llm', position: { x: 200, y: 0 }, params: { model: 'gpt-4', temperature: 0.7 } },
          { id: 'end', type: 'end', position: { x: 400, y: 0 } },
        ],
        edges: [
          { id: 'edge1', source: 'start', target: 'llm' },
          { id: 'edge2', source: 'llm', target: 'end' },
        ],
        metadata: { name: 'Complex Workflow', version: '2.0' },
      };

      const databaseRecord = {
        id: 'agent-123',
        name: 'Complex Agent',
        model: 'gpt-4',
        timeout: 30000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        memoryState: JSON.stringify(complexMemoryState),
        blueprint: JSON.stringify(complexBlueprint),
      };

      const entity = fromDatabase(AgentEntity, databaseRecord);
      expect(entity.memoryState).toEqual(complexMemoryState);
      expect(entity.blueprint).toEqual(complexBlueprint);

      // Test round-trip
      const serialized = toDatabase(entity);
      const deserializedAgain = fromDatabase(AgentEntity, serialized);
      expect(deserializedAgain.memoryState).toEqual(complexMemoryState);
      expect(deserializedAgain.blueprint).toEqual(complexBlueprint);
    });
  });
});
