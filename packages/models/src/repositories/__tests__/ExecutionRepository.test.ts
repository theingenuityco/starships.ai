/**
 * ExecutionRepository Unit Tests
 */

import { ExecutionRepository } from '../ExecutionRepository';
import type {
  ExecutionModel,
  CreateExecutionRequest,
  UpdateExecutionRequest,
  ExecutionStatus,
} from '../ExecutionRepository';
import { ValidationError, DatabaseError } from '@starships/errors';

// Mock the database connection and helpers
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(() => ({
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
  })),
  convertNeo4jIntsInArray: jest.fn((arr) => arr),
  convertNeo4jIntsInObject: jest.fn((obj) => obj),
}));

import { getConnection } from '../../helpers/database';

describe('ExecutionRepository', () => {
  let repository: ExecutionRepository;
  let mockConnection: any;

  beforeEach(() => {
    // Create fresh mock connection for each test
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    repository = new ExecutionRepository();

    // Clear all mocks to ensure clean state
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as any).serviceName).toBe('ExecutionRepository');
    });
  });

  describe('serializeComplexFields', () => {
    it('should serialize executionData and result fields', () => {
      const execution: ExecutionModel = {
        id: 'exec-123',
        workflowId: 'workflow-123',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
        executionData: { config: 'test' },
        result: { output: 'success' },
      };

      const serialized = (repository as any).serializeComplexFields(execution);

      expect(serialized).toEqual({
        ...execution,
        executionData: '{"config":"test"}',
        result: '{"output":"success"}',
      });
    });

    it('should handle null values', () => {
      const execution: ExecutionModel = {
        id: 'exec-123',
        workflowId: 'workflow-123',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
        executionData: undefined,
        result: undefined,
      };

      const serialized = (repository as any).serializeComplexFields(execution);

      expect(serialized.executionData).toBeNull();
      expect(serialized.result).toBeNull();
    });
  });

  describe('deserializeComplexFields', () => {
    it('should deserialize executionData and result fields', () => {
      const execution = {
        id: 'exec-123',
        workflowId: 'workflow-123',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
        executionData: '{"config":"test"}',
        result: '{"output":"success"}',
      };

      const deserialized = (repository as any).deserializeComplexFields(execution);

      expect(deserialized).toEqual({
        ...execution,
        executionData: { config: 'test' },
        result: { output: 'success' },
      });
    });

    it('should handle invalid JSON gracefully', () => {
      const execution = {
        id: 'exec-123',
        executionData: 'invalid-json',
        result: 'also-invalid',
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const deserialized = (repository as any).deserializeComplexFields(execution);

      expect(deserialized).toEqual(execution); // Should return original on parse error
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to deserialize execution fields:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle null/undefined complex fields', () => {
      const execution = {
        id: 'exec-123',
        executionData: null,
        result: undefined,
      };

      const deserialized = (repository as any).deserializeComplexFields(execution);

      expect(deserialized.executionData).toBeUndefined();
      expect(deserialized.result).toBeUndefined();
    });
  });

  describe('create', () => {
    const validRequest: CreateExecutionRequest = {
      workflowId: 'workflow-123',
      executionData: { input: 'test' },
    };

    it('should create execution successfully', async () => {
      const mockExecution = {
        id: 'exec-123',
        workflowId: 'workflow-123',
        status: 'pending',
        createdAt: expect.any(String),
        executionData: '{"input":"test"}',
      };

      // Mock the createEntityWithAutoId call to return the execution
      mockConnection.executeWrite
        .mockResolvedValueOnce([{ n: mockExecution }]) // createEntityWithAutoId result
        .mockResolvedValueOnce([]); // relationship creation

      const result = await repository.create(validRequest);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (n:Execution)'),
        expect.objectContaining({
          props: expect.objectContaining({
            workflowId: 'workflow-123',
            status: 'pending',
            executionData: '{"input":"test"}',
          }),
        })
      );

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (w)-[:HAS_EXECUTION]->(e)'),
        expect.objectContaining({
          workflowId: 'workflow-123',
          executionId: 'exec-123',
        })
      );

      expect(result).toMatchObject({
        id: 'exec-123',
        workflowId: 'workflow-123',
        status: 'pending',
      });
    });

    it('should create execution without executionData', async () => {
      const minimalRequest: CreateExecutionRequest = {
        workflowId: 'workflow-123',
      };

      const mockExecution = {
        id: 'exec-123',
        workflowId: 'workflow-123',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockConnection.executeWrite
        .mockResolvedValueOnce([{ n: mockExecution }])
        .mockResolvedValueOnce([]);

      const result = await repository.create(minimalRequest);

      expect(result.executionData).toBeUndefined();
    });

    it('should throw ValidationError for missing workflowId', async () => {
      const invalidRequest = {} as CreateExecutionRequest;

      await expect(repository.create(invalidRequest)).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.create(validRequest)).rejects.toThrow(DatabaseError);
    });
  });

  describe('findById', () => {
    it('should return execution by ID', async () => {
      const executionId = 'exec-123';
      const mockExecution = {
        id: executionId,
        workflowId: 'workflow-123',
        status: 'completed',
        createdAt: '2024-01-01T00:00:00.000Z',
        executionData: '{"input":"test"}',
        result: '{"output":"success"}',
      };

      mockConnection.executeQuery.mockResolvedValue([{ e: mockExecution }]);

      const result = await repository.findById(executionId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (e:Execution) WHERE e.id = $id RETURN e',
        { id: executionId }
      );

      expect(result).toEqual({
        ...mockExecution,
        executionData: { input: 'test' },
        result: { output: 'success' },
      });
    });

    it('should return null when execution not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should handle execution without complex fields', async () => {
      const mockExecution = {
        id: 'exec-123',
        workflowId: 'workflow-123',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockConnection.executeQuery.mockResolvedValue([{ e: mockExecution }]);

      const result = await repository.findById('exec-123');

      expect(result?.executionData).toBeUndefined();
      expect(result?.result).toBeUndefined();
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findById('exec-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findByWorkflowId', () => {
    it('should return executions for workflow ordered by creation date', async () => {
      const workflowId = 'workflow-123';
      const mockExecutions = [
        {
          id: 'exec-1',
          workflowId,
          status: 'completed',
          createdAt: '2024-01-02T00:00:00.000Z',
          executionData: '{"test":true}',
        },
        {
          id: 'exec-2',
          workflowId,
          status: 'running',
          createdAt: '2024-01-01T00:00:00.000Z',
          result: '{"success":true}',
        },
      ];

      mockConnection.executeQuery.mockResolvedValue([
        { e: mockExecutions[0] },
        { e: mockExecutions[1] },
      ]);

      const result = await repository.findByWorkflowId(workflowId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (e:Execution) WHERE e.workflowId = $workflowId RETURN e ORDER BY e.createdAt DESC',
        { workflowId }
      );

      expect(result).toEqual([
        { ...mockExecutions[0], executionData: { test: true } },
        { ...mockExecutions[1], result: { success: true } },
      ]);
    });

    it('should return empty array when no executions found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByWorkflowId('workflow-123');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findByWorkflowId('workflow-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    const executionId = 'exec-123';

    it('should update execution successfully', async () => {
      const updates: UpdateExecutionRequest = {
        status: 'completed',
        currentNodeRef: 'final-node',
        result: { output: 'success' },
      };

      const updatedExecution = {
        id: executionId,
        status: 'completed',
        currentNodeRef: 'final-node',
        result: '{"output":"success"}',
        endTime: expect.any(String),
      };

      mockConnection.executeWrite.mockResolvedValue([{ e: updatedExecution }]);

      const result = await repository.update(executionId, updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (e:Execution) WHERE e.id = $id SET e += $updates RETURN e',
        {
          id: executionId,
          updates: expect.objectContaining({
            status: 'completed',
            currentNodeRef: 'final-node',
            result: { output: 'success' },
            endTime: expect.any(String), // Should auto-set endTime for terminal status
          }),
        }
      );

      expect(result).toBeDefined();
    });

    it('should auto-set startTime when status changes to running', async () => {
      const updates: UpdateExecutionRequest = {
        status: 'running',
      };

      const mockUpdatedExecution = {
        id: executionId,
        status: 'running',
        startTime: '2024-01-01T10:00:00.000Z',
      };

      mockConnection.executeWrite.mockResolvedValue([{ e: mockUpdatedExecution }]);

      await repository.update(executionId, updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (e:Execution) WHERE e.id = $id SET e += $updates RETURN e',
        expect.objectContaining({
          id: executionId,
          updates: expect.objectContaining({
            status: 'running',
            startTime: expect.any(String),
          }),
        })
      );
    });

    it('should auto-set endTime for terminal statuses', async () => {
      const terminalStatuses: ExecutionStatus[] = ['completed', 'failed', 'cancelled'];

      for (const status of terminalStatuses) {
        // Reset mocks for each iteration
        mockConnection.executeWrite.mockClear();

        const mockUpdatedExecution = {
          id: executionId,
          status,
          endTime: '2024-01-01T12:00:00.000Z',
        };

        mockConnection.executeWrite.mockResolvedValue([{ e: mockUpdatedExecution }]);

        await repository.update(executionId, { status });

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (e:Execution) WHERE e.id = $id SET e += $updates RETURN e',
          expect.objectContaining({
            id: executionId,
            updates: expect.objectContaining({
              status,
              endTime: expect.any(String),
            }),
          })
        );
      }
    });

    it('should not override explicitly provided timestamps', async () => {
      const customStartTime = '2024-01-01T10:00:00.000Z';
      const updates = {
        status: 'running' as const,
        startTime: customStartTime,
      };

      const mockUpdatedExecution = {
        id: executionId,
        status: 'running',
        startTime: customStartTime,
      };

      mockConnection.executeWrite.mockResolvedValue([{ e: mockUpdatedExecution }]);

      await repository.update(executionId, updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (e:Execution) WHERE e.id = $id SET e += $updates RETURN e',
        expect.objectContaining({
          id: executionId,
          updates: expect.objectContaining({
            startTime: customStartTime, // Should use provided value
          }),
        })
      );
    });

    it('should return null when execution not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('non-existent', { status: 'completed' });

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.update(executionId, { status: 'completed' })).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('delete', () => {
    it('should delete execution successfully', async () => {
      const executionId = 'exec-123';

      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete(executionId);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (e:Execution) WHERE e.id = $id DETACH DELETE e RETURN count(e) as deletedCount',
        { id: executionId }
      );

      expect(result).toBe(true);
    });

    it('should return false when execution not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.delete('exec-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('findByStatus', () => {
    it('should return executions with specific status', async () => {
      const status: ExecutionStatus = 'running';
      const mockExecutions = [
        {
          id: 'exec-1',
          workflowId: 'workflow-1',
          status,
          createdAt: '2024-01-02T00:00:00.000Z',
        },
        {
          id: 'exec-2',
          workflowId: 'workflow-2',
          status,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockConnection.executeQuery.mockResolvedValue([
        { e: mockExecutions[0] },
        { e: mockExecutions[1] },
      ]);

      const result = await repository.findByStatus(status);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (e:Execution) WHERE e.status = $status RETURN e ORDER BY e.createdAt DESC',
        { status }
      );

      expect(result).toEqual(mockExecutions);
    });

    it('should return empty array when no executions with status found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByStatus('pending');

      expect(result).toEqual([]);
    });

    it('should handle all valid execution statuses', async () => {
      const statuses: ExecutionStatus[] = [
        'pending',
        'running',
        'paused',
        'completed',
        'failed',
        'cancelled',
      ];

      for (const status of statuses) {
        // Clear mocks for each iteration
        mockConnection.executeQuery.mockClear();
        mockConnection.executeQuery.mockResolvedValue([]);

        await repository.findByStatus(status);

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE e.status = $status'),
          { status }
        );
      }
    });
  });

  describe('findActiveExecutions', () => {
    it('should return executions with active statuses', async () => {
      const mockExecutions = [
        { id: 'exec-1', status: 'pending', createdAt: '2024-01-03T00:00:00.000Z' },
        { id: 'exec-2', status: 'running', createdAt: '2024-01-02T00:00:00.000Z' },
        { id: 'exec-3', status: 'paused', createdAt: '2024-01-01T00:00:00.000Z' },
      ];

      mockConnection.executeQuery.mockResolvedValue([
        { e: mockExecutions[0] },
        { e: mockExecutions[1] },
        { e: mockExecutions[2] },
      ]);

      const result = await repository.findActiveExecutions();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (e:Execution) WHERE e.status IN ["pending", "running", "paused"] RETURN e ORDER BY e.createdAt DESC'
      );

      expect(result).toEqual(mockExecutions);
    });

    it('should return empty array when no active executions found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findActiveExecutions();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findActiveExecutions()).rejects.toThrow(DatabaseError);
    });
  });

  describe('cancelExecution', () => {
    it('should cancel execution with default reason', async () => {
      const executionId = 'exec-123';
      const mockUpdatedExecution = {
        id: executionId,
        status: 'cancelled',
        error: 'Execution cancelled by user',
        endTime: '2024-01-01T12:00:00.000Z',
      };

      mockConnection.executeWrite.mockResolvedValue([{ e: mockUpdatedExecution }]);

      const result = await repository.cancelExecution(executionId);

      // Should call update method internally
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (e:Execution) WHERE e.id = $id SET e += $updates RETURN e',
        {
          id: executionId,
          updates: expect.objectContaining({
            status: 'cancelled',
            error: 'Execution cancelled by user',
            endTime: expect.any(String),
          }),
        }
      );

      expect(result).toBeDefined();
    });

    it('should cancel execution with custom reason', async () => {
      const executionId = 'exec-123';
      const customReason = 'Custom cancellation reason';

      const mockUpdatedExecution = {
        id: executionId,
        status: 'cancelled',
        error: customReason,
        endTime: '2024-01-01T12:00:00.000Z',
      };

      mockConnection.executeWrite.mockResolvedValue([{ e: mockUpdatedExecution }]);

      await repository.cancelExecution(executionId, customReason);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (e:Execution) WHERE e.id = $id SET e += $updates RETURN e',
        expect.objectContaining({
          id: executionId,
          updates: expect.objectContaining({
            status: 'cancelled',
            error: customReason,
            endTime: expect.any(String),
          }),
        })
      );
    });

    it('should return null when execution not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.cancelExecution('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('error handling scenarios', () => {
    it('should handle constraint violations', async () => {
      const error = new Error('unique constraint violation');
      mockConnection.executeWrite.mockRejectedValue(error);

      const request: CreateExecutionRequest = {
        workflowId: 'workflow-123',
      };

      await expect(repository.create(request)).rejects.toThrow();
    });

    it('should handle connection timeouts', async () => {
      const error = new Error('connection timeout');
      mockConnection.executeQuery.mockRejectedValue(error);

      await expect(repository.findById('exec-123')).rejects.toThrow();
    });

    it('should handle query syntax errors', async () => {
      const error = new Error('syntax error in query');
      mockConnection.executeQuery.mockRejectedValue(error);

      await expect(repository.findByStatus('running')).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const error = new Error('network error');
      mockConnection.executeWrite.mockRejectedValue(error);

      await expect(repository.delete('exec-123')).rejects.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete execution lifecycle', async () => {
      const workflowId = 'workflow-123';
      const createRequest: CreateExecutionRequest = {
        workflowId,
        executionData: { input: 'test' },
      };

      const mockExecution = {
        id: 'exec-123',
        workflowId,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
        executionData: '{"input":"test"}',
      };

      // Fix: createEntityWithAutoId expects result[0].n
      mockConnection.executeWrite
        .mockResolvedValueOnce([{ n: mockExecution }]) // Create execution
        .mockResolvedValueOnce([]); // Create relationship
      const execution = await repository.create(createRequest);

      // Update to running
      mockConnection.executeWrite.mockResolvedValue([{ e: { ...execution, status: 'running' } }]);
      await repository.update(execution.id, { status: 'running', currentNodeRef: 'start' });

      // Update to completed
      mockConnection.executeWrite.mockResolvedValue([{ e: { ...execution, status: 'completed' } }]);
      await repository.update(execution.id, {
        status: 'completed',
        result: { output: 'success' },
      });

      // Delete execution
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);
      await repository.delete(execution.id);

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(5); // create + relationship + 2 updates + delete
    });

    it('should handle execution with complex data flows', async () => {
      const complexExecutionData = {
        inputs: {
          documents: ['doc1.pdf', 'doc2.txt'],
          settings: { language: 'en', format: 'json' },
        },
        workflow: {
          version: '2.0',
          nodes: ['start', 'process', 'analyze', 'end'],
        },
      };

      const createRequest: CreateExecutionRequest = {
        workflowId: 'complex-workflow',
        executionData: complexExecutionData,
      };

      const mockExecution = {
        id: 'exec-456',
        workflowId: 'complex-workflow',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
        executionData: JSON.stringify(complexExecutionData),
      };

      // Fix: createEntityWithAutoId expects result[0].n
      mockConnection.executeWrite
        .mockResolvedValueOnce([{ n: mockExecution }]) // Create execution
        .mockResolvedValueOnce([]); // Create relationship

      const result = await repository.create(createRequest);

      expect(result.executionData).toEqual(complexExecutionData);
    });

    it('should handle status transitions correctly', async () => {
      const executionId = 'exec-123';

      // Test all status transitions
      const statusFlow: Array<{
        status: ExecutionStatus;
        shouldHaveStartTime: boolean;
        shouldHaveEndTime: boolean;
      }> = [
        { status: 'pending', shouldHaveStartTime: false, shouldHaveEndTime: false },
        { status: 'running', shouldHaveStartTime: true, shouldHaveEndTime: false },
        { status: 'paused', shouldHaveStartTime: false, shouldHaveEndTime: false },
        { status: 'completed', shouldHaveStartTime: false, shouldHaveEndTime: true },
      ];

      for (const { status, shouldHaveStartTime, shouldHaveEndTime } of statusFlow) {
        mockConnection.executeWrite.mockResolvedValue([{ e: { status } }]);

        await repository.update(executionId, { status });

        const expectedUpdates: any = { status };
        if (shouldHaveStartTime) expectedUpdates.startTime = expect.any(String);
        if (shouldHaveEndTime) expectedUpdates.endTime = expect.any(String);

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            updates: expect.objectContaining(expectedUpdates),
          })
        );
      }
    });
  });

  describe('edge cases', () => {
    it('should handle execution with very large execution data', async () => {
      const largeExecutionData = {
        data: 'x'.repeat(100000), // Large string
        array: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` })),
      };

      const request: CreateExecutionRequest = {
        workflowId: 'workflow-123',
        executionData: largeExecutionData,
      };

      const mockExecution = {
        id: 'exec-789',
        workflowId: 'workflow-123',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
        executionData: JSON.stringify(largeExecutionData),
      };

      // Fix: createEntityWithAutoId expects result[0].n
      mockConnection.executeWrite
        .mockResolvedValueOnce([{ n: mockExecution }]) // Create execution
        .mockResolvedValueOnce([]); // Create relationship

      const result = await repository.create(request);

      expect(result.executionData).toEqual(largeExecutionData);
    });

    it('should handle concurrent execution updates', async () => {
      const executionId = 'exec-123';
      const updates1: UpdateExecutionRequest = { status: 'running' };
      const updates2: UpdateExecutionRequest = { currentNodeRef: 'node-1' };

      mockConnection.executeWrite.mockResolvedValue([{ e: {} }]);

      // Simulate concurrent updates
      const promises = [
        repository.update(executionId, updates1),
        repository.update(executionId, updates2),
      ];

      await Promise.all(promises);

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2);
    });

    it('should handle execution with null result', async () => {
      const mockExecution = {
        id: 'exec-123',
        workflowId: 'workflow-123',
        status: 'completed',
        result: null,
      };

      mockConnection.executeQuery.mockResolvedValue([{ e: mockExecution }]);

      const result = await repository.findById('exec-123');

      expect(result?.result).toBeUndefined();
    });

    it('should handle execution with empty string fields', async () => {
      const updates: UpdateExecutionRequest = {
        currentNodeRef: '',
        error: '',
      };

      mockConnection.executeWrite.mockResolvedValue([{ e: {} }]);

      await repository.update('exec-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          updates: expect.objectContaining({
            currentNodeRef: '',
            error: '',
          }),
        })
      );
    });

    it('should handle executions with special characters in error messages', async () => {
      const errorMessage = 'Error with "quotes" and émojis 🚨 and unicode ñ';
      const updates: UpdateExecutionRequest = {
        status: 'failed',
        error: errorMessage,
      };

      mockConnection.executeWrite.mockResolvedValue([{ e: {} }]);

      await repository.update('exec-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          updates: expect.objectContaining({
            error: errorMessage,
          }),
        })
      );
    });

    it('should handle finding executions with empty result arrays', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const results = await Promise.all([
        repository.findByWorkflowId('workflow-123'),
        repository.findByStatus('running'),
        repository.findActiveExecutions(),
      ]);

      results.forEach((result) => {
        expect(result).toEqual([]);
      });
    });

    it('should handle update with all undefined values', async () => {
      const updates: UpdateExecutionRequest = {
        status: undefined,
        currentNodeRef: undefined,
        executionData: undefined,
        error: undefined,
        result: undefined,
      };

      mockConnection.executeWrite.mockResolvedValue([{ e: {} }]);

      await repository.update('exec-123', updates);

      // All undefined values should still be passed to the database
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          updates: updates,
        })
      );
    });
  });

  describe('data serialization edge cases', () => {
    it('should handle circular references in execution data', async () => {
      const circularData: any = { name: 'test' };
      circularData.self = circularData; // Create circular reference

      const request: CreateExecutionRequest = {
        workflowId: 'workflow-123',
        executionData: circularData,
      };

      // JSON.stringify should handle this gracefully or throw
      await expect(repository.create(request)).rejects.toThrow();
    });

    it('should handle very deep nested objects', async () => {
      const deepObject: any = {};
      let current = deepObject;

      // Create deeply nested object
      for (let i = 0; i < 100; i++) {
        current.nested = { level: i };
        current = current.nested;
      }

      const request: CreateExecutionRequest = {
        workflowId: 'workflow-123',
        executionData: { deep: deepObject },
      };

      const mockExecution = {
        id: 'exec-deep',
        workflowId: 'workflow-123',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
        executionData: JSON.stringify({ deep: deepObject }),
      };

      // Fix: createEntityWithAutoId expects result[0].n
      mockConnection.executeWrite
        .mockResolvedValueOnce([{ n: mockExecution }]) // Create execution
        .mockResolvedValueOnce([]); // Create relationship

      const result = await repository.create(request);

      expect(result.executionData?.deep).toBeDefined();
    });

    it('should handle execution data with various data types', async () => {
      const mixedTypeData = {
        string: 'test',
        number: 42,
        boolean: true,
        null: null,
        undefined: undefined,
        array: [1, 'two', { three: 3 }],
        object: { nested: { value: 'deep' } },
        date: new Date().toISOString(),
      };

      const request: CreateExecutionRequest = {
        workflowId: 'workflow-123',
        executionData: mixedTypeData,
      };

      const mockExecution = {
        id: 'exec-mixed',
        workflowId: 'workflow-123',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
        executionData: JSON.stringify(mixedTypeData),
      };

      // Fix: createEntityWithAutoId expects result[0].n
      mockConnection.executeWrite
        .mockResolvedValueOnce([{ n: mockExecution }]) // Create execution
        .mockResolvedValueOnce([]); // Create relationship

      const result = await repository.create(request);

      // undefined should be dropped by JSON.stringify
      expect(result.executionData).toEqual({
        ...mixedTypeData,
        undefined: undefined, // This gets preserved in the object but won't be in JSON
      });
    });
  });
});
