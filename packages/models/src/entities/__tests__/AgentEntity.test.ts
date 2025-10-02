/**
 * AgentEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the AgentEntity class.
 */

import { AgentEntity } from '@/entities/AgentEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

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
      agent.model = 'gpt-4';
      agent.temperature = 0.7;
      agent.maxTokens = 4000;
      agent.timeout = 30000;
      agent.state = { messages: [], tools: [] };
      agent.blueprint = { nodes: [], edges: [] };
      agent.createdAt = '2024-01-01T00:00:00.000Z';
      agent.updatedAt = '2024-01-02T12:00:00.000Z';

      const serialized = toDatabase(agent);

      expect(serialized).toEqual({
        id: 'agent-123',
        name: 'Test Agent',
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 4000,
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should handle optional fields', async () => {
      const agent = new AgentEntity();
      agent.id = 'agent-123';
      agent.name = 'Test Agent';
      agent.model = 'gpt-4';
      agent.timeout = 30000;
      agent.state = { messages: [], tools: [] };
      agent.blueprint = { nodes: [], edges: [] };
      agent.createdAt = '2024-01-01T00:00:00.000Z';
      agent.updatedAt = '2024-01-02T12:00:00.000Z';
      agent.starshipId = 'starship-123';
      agent.templateId = 'template-456';
      agent.description = 'Test Description';
      agent.systemPrompt = 'You are a helpful assistant';

      const serialized = toDatabase(agent);

      expect(serialized.starship_id).toBe('starship-123');
      expect(serialized.template_id).toBe('template-456');
      expect(serialized.description).toBe('Test Description');
      expect(serialized.system_prompt).toBe('You are a helpful assistant');
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'agent-123',
        name: 'Test Agent',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(AgentEntity, databaseRecord);

      expect(entity).toBeInstanceOf(AgentEntity);
      expect(entity.id).toBe('agent-123');
      expect(entity.name).toBe('Test Agent');
      expect(entity.model).toBe('gpt-4');
      expect(entity.temperature).toBe(0.7);
      expect(entity.maxTokens).toBe(4000);
      expect(entity.timeout).toBe(30000);
    });

    it('should handle optional foreign key fields', async () => {
      const databaseRecord = {
        id: 'agent-123',
        name: 'Test Agent',
        model: 'gpt-4',
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        starshipId: 'starship-123',
        templateId: 'template-456',
      };

      const entity = fromDatabase(AgentEntity, databaseRecord);

      expect(entity.starshipId).toBe('starship-123');
      expect(entity.templateId).toBe('template-456');
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          model: 'claude-3',
          timeout: 45000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(AgentEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(AgentEntity);
      expect(entities[1]).toBeInstanceOf(AgentEntity);
      expect(entities[0].name).toBe('Agent 1');
      expect(entities[1].name).toBe('Agent 2');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        name: 'Test Agent',
        model: 'gpt-4',
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
      };

      await expect(AgentEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {
        name: 'Test Agent',
        // model is missing
      };

      await expect(AgentEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate name length constraints', async () => {
      await expect(
        AgentEntity.validate({
          name: '',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        AgentEntity.validate({
          name: 'a'.repeat(101),
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        AgentEntity.validate({
          name: 'Valid Name',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).resolves.not.toThrow();
    });

    it('should validate temperature constraints', async () => {
      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          temperature: -0.1,
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          temperature: 2.1,
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          temperature: 0.7,
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).resolves.not.toThrow();
    });

    it('should validate maxTokens constraints', async () => {
      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          maxTokens: 0,
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          maxTokens: 100001,
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          maxTokens: 4000,
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).resolves.not.toThrow();
    });

    it('should validate timeout constraints', async () => {
      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          timeout: 999,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          timeout: 300001,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).rejects.toThrow();

      await expect(
        AgentEntity.validate({
          name: 'Test Agent',
          model: 'gpt-4',
          timeout: 30000,
          state: { messages: [], tools: [] },
          blueprint: { nodes: [], edges: [] },
        })
      ).resolves.not.toThrow();
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

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'agent-123',
        name: 'Test Agent',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        timeout: 30000,
        systemPrompt: 'You are a helpful assistant',
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complete agent data' }]);

      expect(results[0].success).toBe(true);

      const entity = results[0].entity as AgentEntity;
      expect(entity.name).toBe('Test Agent');
      expect(entity.model).toBe('gpt-4');
      expect(entity.temperature).toBe(0.7);
      expect(entity.maxTokens).toBe(4000);
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(AgentEntity, null)).toThrow();
      expect(() => fromDatabase(AgentEntity, undefined)).toThrow();
      expect(() => fromDatabase(AgentEntity, 'not an object')).toThrow();
    });

    it('should handle empty array deserialization', async () => {
      const emptyArray: never[] = [];
      const entities = fromDatabaseArray(AgentEntity, emptyArray);

      expect(entities).toHaveLength(0);
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle edge case names', async () => {
      const shortNameRecord = {
        id: 'agent-123',
        name: 'A',
        model: 'gpt-4',
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const shortEntity = fromDatabase(AgentEntity, shortNameRecord);
      expect(shortEntity.name).toBe('A');

      const longName = 'a'.repeat(100);
      const longNameRecord = {
        ...shortNameRecord,
        name: longName,
      };

      const longEntity = fromDatabase(AgentEntity, longNameRecord);
      expect(longEntity.name).toBe(longName);
      expect(longEntity.name.length).toBe(100);
    });

    it('should handle special characters in fields', async () => {
      const specialData = {
        id: 'agent-123',
        name: 'Agent with émojis 🤖',
        description: 'Description with "quotes" and \'apostrophes\'',
        model: 'gpt-4',
        timeout: 30000,
        state: { messages: [], tools: [] },
        blueprint: { nodes: [], edges: [] },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      };

      const entity = fromDatabase(AgentEntity, specialData);
      expect(entity.name).toBe('Agent with émojis 🤖');
      expect(entity.description).toBe('Description with "quotes" and \'apostrophes\'');

      const serialized = toDatabase(entity);
      const deserialized = fromDatabase(AgentEntity, serialized);
      expect(deserialized.name).toBe(entity.name);
    });
  });
});
