/**
 * Serialization Helper Unit Tests
 *
 * Tests for serialization and deserialization helper functions
 * that provide standardized entity transformation.
 */

import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { AgentEntity } from '@/entities/AgentEntity';
import { UserEntity } from '@/entities/UserEntity';
import { ConversationEntity } from '@/entities/ConversationEntity';
import { Expose, Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import 'reflect-metadata';

// Test entity class for testing
class TestEntity {
  @Expose()
  @Transform(({ value }) => value?.toUpperCase())
  @IsString()
  @Length(1, 50)
  id!: string;

  @Expose()
  @Transform(({ value }) => value || 'default-name')
  @IsString()
  name!: string;

  @Expose()
  @Transform(({ value }) => (value ? new Date(value).toISOString() : undefined))
  date?: string;

  @Expose()
  @Transform(({ value, type }) => {
    if (type === 0 && typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    if (type === 1 && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    }
    return value;
  })
  metadata?: Record<string, unknown>;
}

describe('Serialization Helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fromDatabase', () => {
    it('should deserialize simple database record to entity', () => {
      const databaseRecord = {
        id: 'test-123',
        name: 'Test Entity',
        date: '2024-01-01T00:00:00.000Z',
        metadata: '{"key": "value"}',
      };

      const entity = fromDatabase(TestEntity, databaseRecord);

      expect(entity).toBeInstanceOf(TestEntity);
      expect(entity.id).toBe('TEST-123'); // Transformed to uppercase
      expect(entity.name).toBe('Test Entity');
      expect(entity.date).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.metadata).toEqual({ key: 'value' }); // JSON parsed
    });

    it('should handle missing optional fields', () => {
      const databaseRecord = {
        id: 'test-123',
      };

      const entity = fromDatabase(TestEntity, databaseRecord);

      expect(entity).toBeInstanceOf(TestEntity);
      expect(entity.id).toBe('TEST-123');
      expect(entity.name).toBe('default-name'); // Default transformation
      expect(entity.date).toBeUndefined();
      expect(entity.metadata).toBeUndefined();
    });

    it('should apply transformations correctly', () => {
      const databaseRecord = {
        id: 'lowercase-id',
        name: '', // Should get default
        date: new Date('2024-01-01T00:00:00.000Z'),
        metadata: '{"transformed": true}',
      };

      const entity = fromDatabase(TestEntity, databaseRecord);

      expect(entity.id).toBe('LOWERCASE-ID');
      expect(entity.name).toBe('default-name');
      expect(entity.date).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.metadata).toEqual({ transformed: true });
    });

    it('should handle malformed JSON gracefully', () => {
      const databaseRecord = {
        id: 'test-123',
        metadata: 'invalid-json{',
      };

      const entity = fromDatabase(TestEntity, databaseRecord);

      expect(entity.metadata).toBeNull();
    });

    it('should work with real entities', () => {
      const agentRecord = {
        id: 'agent-123',
        name: 'Test Agent',
        model: 'gpt-4',
        timeout: 30000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        memoryState: '{}',
        blueprint: '{"nodes":[], "edges":[]}',
      };

      const agent = fromDatabase(AgentEntity, agentRecord);

      expect(agent).toBeInstanceOf(AgentEntity);
      expect(agent.name).toBe('Test Agent');
      expect(agent.memoryState).toEqual({});
      expect(agent.blueprint).toEqual({ nodes: [], edges: [] });
    });

    it('should throw error for null or undefined data', () => {
      expect(() => fromDatabase(TestEntity, null)).toThrow('Cannot deserialize null or undefined data');
      expect(() => fromDatabase(TestEntity, undefined)).toThrow('Cannot deserialize null or undefined data');
    });

    it('should throw error for non-object data', () => {
      expect(() => fromDatabase(TestEntity, 'string')).toThrow('Expected object for TestEntity deserialization');
      expect(() => fromDatabase(TestEntity, 123)).toThrow('Expected object for TestEntity deserialization');
      expect(() => fromDatabase(TestEntity, [])).toThrow('Expected object for TestEntity deserialization');
    });

    it('should throw error for invalid entity class', () => {
      expect(() => fromDatabase(null as unknown as new () => TestEntity, {})).toThrow('Invalid entity class provided');
      expect(() => fromDatabase(undefined as unknown as new () => TestEntity, {})).toThrow('Invalid entity class provided');
    });

    it('should work with entities without decorators (fallback behavior)', () => {
      // Mock class that doesn't work with class-transformer (no @Expose decorators)
      class MockEntity {
        id!: string;
        name!: string;
      }

      const data = { id: 'mock-123', name: 'Mock Entity' };

      // Class-transformer still creates instances but properties might not be set properly
      const entity = fromDatabase(MockEntity, data);
      expect(entity).toBeInstanceOf(MockEntity);
      // Properties may or may not be set depending on class-transformer behavior
    });
  });

  describe('fromDatabaseArray', () => {
    it('should deserialize array of database records', () => {
      const databaseRecords = [
        { id: 'test-1', name: 'Entity 1' },
        { id: 'test-2', name: 'Entity 2' },
        { id: 'test-3', name: 'Entity 3' },
      ];

      const entities = fromDatabaseArray(TestEntity, databaseRecords);

      expect(entities).toHaveLength(3);
      expect(entities[0]).toBeInstanceOf(TestEntity);
      expect(entities[1]).toBeInstanceOf(TestEntity);
      expect(entities[2]).toBeInstanceOf(TestEntity);

      expect(entities[0].id).toBe('TEST-1');
      expect(entities[1].id).toBe('TEST-2');
      expect(entities[2].id).toBe('TEST-3');
    });

    it('should handle empty array', () => {
      const entities = fromDatabaseArray(TestEntity, []);
      expect(entities).toEqual([]);
    });

    it('should throw error for non-array input', () => {
      expect(() => fromDatabaseArray(TestEntity, 'not-array' as unknown as unknown[])).toThrow(
        'Expected array for TestEntity array deserialization'
      );
      expect(() => fromDatabaseArray(TestEntity, null as unknown as unknown[])).toThrow(
        'Expected array for TestEntity array deserialization'
      );
    });

    it('should provide detailed error for invalid items', () => {
      const mixedData = [{ id: 'valid-1', name: 'Valid Entity' }, null, { id: 'valid-2', name: 'Another Valid Entity' }];

      expect(() => fromDatabaseArray(TestEntity, mixedData)).toThrow('Array deserialization failed at index 1');
    });

    it('should work with real entities', () => {
      const userRecords = [
        { id: 'user-1', username: 'user1', createdAt: '2024-01-01T00:00:00.000Z' },
        { id: 'user-2', username: 'user2', createdAt: '2024-01-01T00:00:00.000Z' },
      ];

      const users = fromDatabaseArray(UserEntity, userRecords);

      expect(users).toHaveLength(2);
      expect(users[0]).toBeInstanceOf(UserEntity);
      expect(users[1]).toBeInstanceOf(UserEntity);
      expect(users[0].username).toBe('user1');
      expect(users[1].username).toBe('user2');
    });
  });

  describe('toDatabase', () => {
    it('should serialize entity to database format', () => {
      const entity = new TestEntity();
      entity.id = 'test-123';
      entity.name = 'Test Entity';
      entity.date = '2024-01-01T00:00:00.000Z';
      entity.metadata = { key: 'value', nested: { data: true } };

      const serialized = toDatabase(entity);

      expect(serialized).toEqual({
        id: 'TEST-123', // Transformed to uppercase
        name: 'Test Entity',
        date: '2024-01-01T00:00:00.000Z',
        metadata: '{"key":"value","nested":{"data":true}}',
      });
    });

    it('should throw for entities without transformers', () => {
      const plainEntity = { id: 'plain-123', name: 'Plain Entity', value: 42 };

      // Strict serialization should fail for entities without @Expose decorators
      expect(() => toDatabase(plainEntity)).toThrow('No properties exposed for serialization');
    });

    it('should work with real entities', () => {
      const conversation = new ConversationEntity();
      conversation.id = 'conv-123';
      conversation.title = 'Test Conversation';
      conversation.status = 'active';
      conversation.createdAt = '2024-01-01T00:00:00.000Z';

      const serialized = toDatabase(conversation);

      expect(serialized.id).toBe('conv-123');
      expect(serialized.title).toBe('Test Conversation');
      expect(serialized.status).toBe('active');
      expect(serialized.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should handle null and undefined values', () => {
      const entity = new TestEntity();
      entity.id = 'test-123';
      entity.name = 'Test Entity';
      // date and metadata are undefined

      const serialized = toDatabase(entity);

      expect(serialized.id).toBe('TEST-123'); // Transformed to uppercase by TestEntity
      expect(serialized.name).toBe('Test Entity');
      expect(serialized).not.toHaveProperty('date');
      expect(serialized).not.toHaveProperty('metadata');
    });

    it('should throw error for invalid input', () => {
      expect(() => toDatabase(null)).toThrow('Entity must be a valid object');
      expect(() => toDatabase(undefined)).toThrow('Entity must be a valid object');
      expect(() => toDatabase('string')).toThrow('Entity must be a valid object');
    });

    it('should throw for entities without exposed properties', () => {
      const complexEntity: Record<string, unknown> = {
        id: 'complex-123',
        circularRef: {},
      };
      complexEntity.circularRef = complexEntity; // Create circular reference

      // Strict serialization should fail for entities without @Expose decorators
      expect(() => toDatabase(complexEntity)).toThrow('No properties exposed for serialization');
    });
  });

  describe('Complex transformation scenarios', () => {
    it('should handle nested JSON transformations', () => {
      const complexRecord = {
        id: 'complex-123',
        metadata: JSON.stringify({
          settings: { theme: 'dark', lang: 'en' },
          features: ['feature1', 'feature2'],
          counts: { views: 100, likes: 25 },
        }),
      };

      const entity = fromDatabase(TestEntity, complexRecord);

      expect(entity.metadata).toEqual({
        settings: { theme: 'dark', lang: 'en' },
        features: ['feature1', 'feature2'],
        counts: { views: 100, likes: 25 },
      });

      // Test round-trip
      const serialized = toDatabase(entity);
      const deserialized = fromDatabase(TestEntity, serialized);
      expect(deserialized.metadata).toEqual(entity.metadata);
    });

    it('should throw on invalid date transformations', () => {
      const edgeCaseRecord = {
        id: '', // Empty string
        name: null, // null value
        date: 'invalid-date', // This will cause the transformer to throw
        metadata: '[]', // Array instead of object
      };

      // Strict transformation should throw on invalid date
      expect(() => fromDatabase(TestEntity, edgeCaseRecord)).toThrow();
    });

    it('should preserve type information through round-trips', () => {
      const originalData = {
        id: 'type-test-123',
        name: 'Type Test',
        date: '2024-01-01T00:00:00.000Z',
        metadata: {
          number: 42,
          boolean: true,
          array: [1, 2, 3],
          nested: { deep: { value: 'test' } },
          nullValue: null,
        },
      };

      // Database record with JSON serialized metadata
      const databaseRecord = {
        ...originalData,
        metadata: JSON.stringify(originalData.metadata),
      };

      const entity = fromDatabase(TestEntity, databaseRecord);
      const serialized = toDatabase(entity);
      const roundTrip = fromDatabase(TestEntity, serialized);

      expect(roundTrip.metadata).toEqual(originalData.metadata);
      expect(typeof roundTrip.metadata?.number).toBe('number');
      expect(typeof roundTrip.metadata?.boolean).toBe('boolean');
      expect(Array.isArray(roundTrip.metadata?.array)).toBe(true);
      expect(roundTrip.metadata?.nullValue).toBeNull();
    });
  });

  describe('Performance and reliability', () => {
    it('should handle large datasets efficiently', () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`,
        metadata: JSON.stringify({ index: i, category: i % 10 }),
      }));

      const startTime = Date.now();
      const entities = fromDatabaseArray(TestEntity, largeDataset);
      const endTime = Date.now();

      expect(entities).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(entities[0].id).toBe('ITEM-0');
      expect(entities[999].id).toBe('ITEM-999');
    });

    it('should be memory efficient', () => {
      // Test that we don't create unnecessary objects
      const simpleRecord = { id: 'memory-test', name: 'Memory Test' };
      const entity = fromDatabase(TestEntity, simpleRecord);

      expect(Object.getOwnPropertyNames(entity)).toEqual(['id', 'name', 'date', 'metadata']);
    });

    it('should handle concurrent operations safely', async () => {
      const concurrentOperations = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve(fromDatabase(TestEntity, { id: `concurrent-${i}`, name: `Concurrent ${i}` }))
      );

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(100);
      results.forEach((result, i) => {
        expect(result.id).toBe(`CONCURRENT-${i}`);
        expect(result.name).toBe(`Concurrent ${i}`);
      });
    });
  });

  describe('Error recovery and robustness', () => {
    it('should provide helpful error messages', () => {
      try {
        fromDatabase(TestEntity, null);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Cannot deserialize null or undefined data to TestEntity');
      }
    });

    it('should isolate errors to individual items in arrays', () => {
      const mixedArray = [
        { id: 'valid-1', name: 'Valid 1' },
        { id: 'valid-2', name: 'Valid 2' },
        null, // This will cause an error
      ];

      expect(() => fromDatabaseArray(TestEntity, mixedArray)).toThrow('Array deserialization failed at index 2');
    });

    it('should handle class-transformer failures gracefully', () => {
      // Simulate a scenario where class-transformer might fail
      const problematicData = {
        id: Symbol('test'), // Symbol type that might cause issues
        name: 'Test',
      };

      // Should now throw due to stricter type checking
      expect(() => fromDatabase(TestEntity, problematicData as unknown as { id: string; name: string })).toThrow();
    });
  });
});
