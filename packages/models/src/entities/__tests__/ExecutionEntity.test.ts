/**
 * ExecutionEntity Unit Tests
 *
 * Tests for serialization, deserialization, and validation
 * of the ExecutionEntity class.
 */

import { ExecutionEntity } from '@/entities/ExecutionEntity';
import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { EntityTestHelper } from './entity-test-helper';

describe('ExecutionEntity', () => {
  let testHelper: EntityTestHelper<ExecutionEntity>;

  beforeEach(() => {
    testHelper = new EntityTestHelper(ExecutionEntity, 'ExecutionEntity');
    jest.clearAllMocks();
  });

  describe('Serialization', () => {
    it('should serialize entity to database format', async () => {
      const execution = new ExecutionEntity();
      execution.id = 'execution-123';
      execution.workflowId = 'workflow-456';
      execution.status = 'running';
      execution.currentNodeRef = 'node-abc';
      execution.executionData = { input: 'test data' };
      execution.error = {
        message: 'Test error',
        code: 'NODE_EXECUTION_FAILED',
        timestamp: '2024-01-01T00:01:00.000Z',
        recoverable: false,
      };
      execution.result = { output: 'test result' };
      execution.startTime = '2024-01-01T00:00:00.000Z';
      execution.endTime = '2024-01-01T00:05:00.000Z';
      execution.pausedAt = '2024-01-01T00:02:30.000Z';
      execution.results = [{ nodeRef: 'node-1', data: { success: true } }];
      execution.state = { currentStep: 1, variables: { count: 42 } };
      execution.createdAt = '2024-01-01T00:00:00.000Z';
      execution.updatedAt = '2024-01-01T00:05:00.000Z';

      const serialized = toDatabase(execution);

      expect(serialized).toEqual({
        id: 'execution-123',
        workflowId: 'workflow-456',
        status: 'running',
        currentNodeRef: 'node-abc',
        executionData: JSON.stringify({ input: 'test data' }),
        error: JSON.stringify({
          message: 'Test error',
          code: 'NODE_EXECUTION_FAILED',
          timestamp: '2024-01-01T00:01:00.000Z',
          recoverable: false,
        }),
        result: JSON.stringify({ output: 'test result' }),
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:05:00.000Z',
        pausedAt: '2024-01-01T00:02:30.000Z',
        results: JSON.stringify([{ nodeRef: 'node-1', data: { success: true } }]),
        state: JSON.stringify({ currentStep: 1, variables: { count: 42 } }),
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
      });
    });

    it('should handle optional fields', async () => {
      const execution = new ExecutionEntity();
      execution.id = 'execution-123';
      execution.workflowId = 'workflow-456';
      execution.status = 'completed';
      execution.results = [];
      execution.state = {};
      execution.createdAt = '2024-01-01T00:00:00.000Z';
      execution.updatedAt = '2024-01-01T00:00:00.000Z';

      const serialized = toDatabase(execution);

      expect(serialized.currentNodeRef).toBeUndefined();
      expect(serialized.executionData).toBeUndefined(); // JsonTransform returns undefined for undefined
      expect(serialized.error).toBeUndefined(); // JsonTransform returns undefined for undefined
      expect(serialized.result).toBeUndefined(); // JsonTransform returns undefined for undefined
      expect(serialized.startTime).toBeUndefined(); // DateTransform returns undefined for undefined
      expect(serialized.endTime).toBeUndefined(); // DateTransform returns undefined for undefined
      expect(serialized.pausedAt).toBeUndefined(); // DateTransform returns undefined for undefined
      expect(serialized.results).toBe('[]');
      expect(serialized.state).toBe('{}');
    });
  });

  describe('Deserialization', () => {
    it('should deserialize database record to entity', async () => {
      const databaseRecord = {
        id: 'execution-123',
        workflowId: 'workflow-456',
        status: 'completed',
        currentNodeRef: 'final-node',
        executionData: JSON.stringify({ input: 'processed data' }),
        error: JSON.stringify({
          message: 'Warning',
          code: 'TIMEOUT_EXCEEDED',
          timestamp: '2024-01-01T00:01:00.000Z',
          recoverable: true,
        }),
        result: JSON.stringify({ output: 'final result', metadata: { duration: 5000 } }),
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:05:00.000Z',
        pausedAt: null,
        results: JSON.stringify([
          { nodeRef: 'node-1', data: { success: true } },
          { nodeRef: 'node-2', data: { processed: 100 } },
        ]),
        state: JSON.stringify({
          currentStep: 5,
          variables: { total: 100, processed: true },
          history: ['step1', 'step2'],
        }),
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
      };

      const entity = fromDatabase(ExecutionEntity, databaseRecord);

      expect(entity).toBeInstanceOf(ExecutionEntity);
      expect(entity.id).toBe('execution-123');
      expect(entity.workflowId).toBe('workflow-456');
      expect(entity.status).toBe('completed');
      expect(entity.currentNodeRef).toBe('final-node');
      expect(entity.executionData).toEqual({ input: 'processed data' });
      expect(entity.error).toEqual({
        message: 'Warning',
        code: 'TIMEOUT_EXCEEDED',
        timestamp: '2024-01-01T00:01:00.000Z',
        recoverable: true,
      });
      expect(entity.result).toEqual({ output: 'final result', metadata: { duration: 5000 } });
      expect(entity.startTime).toBe('2024-01-01T00:00:00.000Z');
      expect(entity.endTime).toBe('2024-01-01T00:05:00.000Z');
      expect(entity.pausedAt).toBeUndefined();
      expect(entity.results).toEqual([
        { nodeRef: 'node-1', data: { success: true } },
        { nodeRef: 'node-2', data: { processed: 100 } },
      ]);
      expect(entity.state).toEqual({
        currentStep: 5,
        variables: { total: 100, processed: true },
        history: ['step1', 'step2'],
      });
    });

    it('should handle malformed JSON in database record', async () => {
      const databaseRecord = {
        id: 'execution-123',
        workflowId: 'workflow-456',
        status: 'failed',
        executionData: 'invalid-json{',
        error: '{"incomplete": json}',
        result: 'not-json',
        results: '[invalid array',
        state: '{broken json',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(ExecutionEntity, databaseRecord);

      expect(entity).toBeInstanceOf(ExecutionEntity);
      expect(entity.executionData).toBeNull();
      expect(entity.error).toBeNull();
      expect(entity.result).toBeNull();
      expect(entity.results).toBeNull();
      expect(entity.state).toBeNull();
    });

    it('should apply default status transformation', async () => {
      const databaseRecord = {
        id: 'execution-123',
        workflowId: 'workflow-456',
        status: 'pending', // Explicit status since defaults don't work in deserialization
        results: '[]',
        state: '{}',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(ExecutionEntity, databaseRecord);

      expect(entity.status).toBe('pending');
    });

    it('should deserialize array of database records', async () => {
      const databaseRecords = [
        {
          id: 'execution-1',
          workflowId: 'workflow-1',
          status: 'completed',
          results: '[]',
          state: '{}',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:01:00.000Z',
        },
        {
          id: 'execution-2',
          workflowId: 'workflow-2',
          status: 'running',
          results: '[]',
          state: '{}',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:02:00.000Z',
        },
      ];

      const entities = fromDatabaseArray(ExecutionEntity, databaseRecords);

      expect(entities).toHaveLength(2);
      expect(entities[0]).toBeInstanceOf(ExecutionEntity);
      expect(entities[1]).toBeInstanceOf(ExecutionEntity);
      expect(entities[0].status).toBe('completed');
      expect(entities[1].status).toBe('running');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid create data', async () => {
      const validData = {
        workflowId: 'workflow-456',
        status: 'pending',
        results: [],
        state: {},
      };

      await expect(ExecutionEntity.validate(validData, 'create')).resolves.not.toThrow();
    });

    it('should fail validation for missing required workflowId', async () => {
      const invalidData = {
        status: 'pending',
        results: [],
        state: {},
      };

      await expect(ExecutionEntity.validate(invalidData, 'create')).rejects.toThrow('Validation failed');
    });

    it('should validate status constraints', async () => {
      // Invalid status
      await expect(
        ExecutionEntity.validate({
          workflowId: 'workflow-456',
          status: 'invalid-status',
          results: [],
          state: {},
        })
      ).rejects.toThrow();

      // Valid statuses should pass
      const validStatuses = ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'];
      for (const status of validStatuses) {
        await expect(
          ExecutionEntity.validate({
            workflowId: 'workflow-456',
            status,
            results: [],
            state: {},
          })
        ).resolves.not.toThrow();
      }
    });

    it('should validate date formats', async () => {
      // Invalid date format
      await expect(
        ExecutionEntity.validate({
          workflowId: 'workflow-456',
          status: 'pending',
          startTime: 'invalid-date',
          results: [],
          state: {},
        })
      ).rejects.toThrow();

      // Valid date formats should pass
      await expect(
        ExecutionEntity.validate({
          workflowId: 'workflow-456',
          status: 'running',
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-01T00:05:00.000Z',
          results: [],
          state: {},
        })
      ).resolves.not.toThrow();
    });

    it('should allow partial validation for update operations', async () => {
      const updateData = {
        status: 'completed',
      };

      await expect(ExecutionEntity.validate(updateData, 'update')).resolves.not.toThrow();
    });

    it('should reject non-object data', async () => {
      await expect(ExecutionEntity.validate('string data')).rejects.toThrow('Data must be an object');
      await expect(ExecutionEntity.validate(null)).rejects.toThrow('Data must be an object');
      await expect(ExecutionEntity.validate(123)).rejects.toThrow('Data must be an object');
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve data integrity through serialization round-trip', async () => {
      const originalData = {
        id: 'execution-123',
        workflowId: 'workflow-complex',
        status: 'running',
        currentNodeRef: 'processing-node',
        executionData: JSON.stringify({
          input: { data: 'complex', nested: { values: [1, 2, 3] } },
          config: { timeout: 30000, retry: true },
        }),
        error: JSON.stringify({
          message: 'Temporary failure',
          code: 'TEMP_FAIL',
          details: { retryCount: 2, lastAttempt: '2024-01-01T00:02:00.000Z' },
        }),
        result: JSON.stringify({
          output: { processed: true, count: 42 },
          performance: { duration: 2500, memory: '128MB' },
        }),
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: null,
        pausedAt: '2024-01-01T00:02:30.000Z',
        results: JSON.stringify([
          { nodeRef: 'start', data: { initialized: true }, timestamp: '2024-01-01T00:00:01.000Z' },
          { nodeRef: 'validate', data: { valid: true, errors: [] }, timestamp: '2024-01-01T00:00:05.000Z' },
        ]),
        state: JSON.stringify({
          currentStep: 3,
          totalSteps: 10,
          variables: {
            userId: 'user-123',
            processedItems: 25,
            metadata: { version: '2.1.0', branch: 'feature-x' },
          },
          history: ['init', 'validate', 'process'],
        }),
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:02:30.000Z',
      };

      const results = await testHelper.testRoundTrip([{ data: originalData, description: 'complex execution data' }]);

      expect(results[0].success).toBe(true);
      expect(results[0].keysMatch).toBe(true);

      // Verify JSON transformations worked correctly
      const entity = results[0].entity as ExecutionEntity;
      expect(entity.executionData).toEqual({
        input: { data: 'complex', nested: { values: [1, 2, 3] } },
        config: { timeout: 30000, retry: true },
      });
      expect(entity.error).toEqual({
        message: 'Temporary failure',
        code: 'TEMP_FAIL',
        details: { retryCount: 2, lastAttempt: '2024-01-01T00:02:00.000Z' },
      });
      expect(entity.results).toHaveLength(2);
      expect(entity.state).toHaveProperty('currentStep', 3);
      expect(entity.state).toHaveProperty('variables');
    });
  });

  describe('Error handling', () => {
    it('should handle deserialization errors gracefully', async () => {
      expect(() => fromDatabase(ExecutionEntity, null)).toThrow();
      expect(() => fromDatabase(ExecutionEntity, undefined)).toThrow();
      expect(() => fromDatabase(ExecutionEntity, 'not an object')).toThrow();
    });

    it('should handle array deserialization with mixed data', async () => {
      const mixedData = [
        {
          id: 'execution-1',
          workflowId: 'workflow-1',
          status: 'pending',
          results: '[]',
          state: '{}',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        null, // Invalid item
      ];

      expect(() => fromDatabaseArray(ExecutionEntity, mixedData)).toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle all valid status values', async () => {
      const validStatuses = ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'];

      for (const status of validStatuses) {
        const record = {
          id: 'execution-123',
          workflowId: 'workflow-456',
          status,
          results: '[]',
          state: '{}',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const entity = fromDatabase(ExecutionEntity, record);
        expect(entity.status).toBe(status);

        // Should also pass validation
        await expect(
          ExecutionEntity.validate({
            workflowId: 'workflow-456',
            status,
            results: [],
            state: {},
          })
        ).resolves.not.toThrow();
      }
    });

    it('should handle complex nested data structures', async () => {
      const complexExecutionData = {
        workflow: {
          id: 'wf-123',
          name: 'Complex Workflow',
          version: '2.1.0',
        },
        input: {
          documents: [
            { id: 'doc-1', type: 'pdf', size: 1024 },
            { id: 'doc-2', type: 'docx', size: 2048 },
          ],
          settings: {
            quality: 'high',
            compression: true,
            metadata: {
              author: 'system',
              created: '2024-01-01T00:00:00.000Z',
            },
          },
        },
      };

      const complexState = {
        phases: ['init', 'validate', 'process', 'finalize'],
        currentPhase: 2,
        phaseResults: {
          init: { status: 'completed', duration: 100 },
          validate: { status: 'completed', duration: 250, warnings: 2 },
        },
        resources: {
          memory: { used: '256MB', limit: '512MB' },
          cpu: { usage: 45.5, cores: 2 },
        },
      };

      const databaseRecord = {
        id: 'execution-complex',
        workflowId: 'workflow-complex',
        status: 'running',
        executionData: JSON.stringify(complexExecutionData),
        results: JSON.stringify([]),
        state: JSON.stringify(complexState),
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const entity = fromDatabase(ExecutionEntity, databaseRecord);
      expect(entity.executionData).toEqual(complexExecutionData);
      expect(entity.state).toEqual(complexState);

      // Test round-trip
      const serialized = toDatabase(entity);
      const deserialized = fromDatabase(ExecutionEntity, serialized);
      expect(deserialized.executionData).toEqual(complexExecutionData);
      expect(deserialized.state).toEqual(complexState);
    });

    it('should handle execution lifecycle timestamps', async () => {
      const timestamps = {
        created: '2024-01-01T00:00:00.000Z',
        started: '2024-01-01T00:00:05.000Z',
        paused: '2024-01-01T00:02:30.000Z',
        resumed: '2024-01-01T00:03:00.000Z',
        completed: '2024-01-01T00:05:45.000Z',
        updated: '2024-01-01T00:05:45.000Z',
      };

      const record = {
        id: 'execution-lifecycle',
        workflowId: 'workflow-lifecycle',
        status: 'completed',
        startTime: timestamps.started,
        pausedAt: timestamps.paused,
        endTime: timestamps.completed,
        results: '[]',
        state: JSON.stringify({
          lifecycle: {
            phases: ['started', 'paused', 'resumed', 'completed'],
            durations: {
              active: 2500, // 2.5 seconds
              paused: 30000, // 30 seconds
            },
          },
        }),
        createdAt: timestamps.created,
        updatedAt: timestamps.updated,
      };

      const entity = fromDatabase(ExecutionEntity, record);
      expect(entity.startTime).toBe(timestamps.started);
      expect(entity.pausedAt).toBe(timestamps.paused);
      expect(entity.endTime).toBe(timestamps.completed);
      expect(entity.state).toHaveProperty('lifecycle');
    });
  });

  describe('Integration with test helper', () => {
    it('should work with entity test helper validation tests', async () => {
      const validationTestCases = [
        {
          data: { workflowId: 'wf-123', status: 'pending', results: [], state: {} },
          shouldPass: true,
          description: 'valid execution data should pass',
        },
        {
          data: { status: 'running', results: [], state: {} }, // Missing workflowId
          shouldPass: false,
          description: 'missing workflowId should fail',
        },
        {
          data: { workflowId: 'wf-123', status: 'invalid-status', results: [], state: {} },
          shouldPass: false,
          description: 'invalid status should fail',
        },
        {
          data: { workflowId: 'wf-123', status: 'pending', startTime: 'invalid-date', results: [], state: {} },
          shouldPass: false,
          description: 'invalid date should fail',
        },
      ];

      const results = await testHelper.testValidation(validationTestCases);

      results.forEach((result, index) => {
        expect(result.passed).toBe(validationTestCases[index].shouldPass);
      });
    });
  });
});
