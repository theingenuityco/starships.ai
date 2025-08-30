/**
 * WorkflowHandler Unit Tests
 */

import { WorkflowHandler } from '../WorkflowHandler';
import { Workflow } from '../../../Workflow';
import { Node, ExecutionContext, WorkflowNodeParameters, Blueprint, RuntimeState, NodeResult } from '../../../types';

// Mock Workflow class
jest.mock('../../../Workflow');

// Type definitions for test data structures
interface WorkflowResponseData {
  workflowId: string;
  workflowResults: unknown[];
  workflowStatus: string;
  executionId: string;
  output: string;
}

describe('WorkflowHandler', () => {
  let handler: WorkflowHandler;
  let mockNode: Node;
  let mockContext: ExecutionContext;
  let mockWorkflow: jest.Mocked<Workflow>;

  const mockBlueprint: Blueprint = {
    id: 'test-embedded-workflow',
    nodes: [
      { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
      { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
    ],
    edges: [
      { id: 'edge-1', from: 'start', to: 'end' }
    ],
    metadata: {}
  };

  beforeEach(() => {
    mockNode = {
      id: 'workflow-node',
      type: 'workflow',
      name: 'Test Workflow Node',
      description: 'Workflow node for testing',
      parameters: {
        blueprint: mockBlueprint
      } as WorkflowNodeParameters
    };

    handler = new WorkflowHandler(mockNode);
    mockContext = global.createMockContext();

    // Setup Workflow mock
    mockWorkflow = {
      execute: jest.fn(),
      validate: jest.fn(),
      getId: jest.fn(),
      getNodes: jest.fn(),
      getEdges: jest.fn(),
      getBlueprint: jest.fn(),
      addNode: jest.fn(),
      addEdge: jest.fn(),
      removeNode: jest.fn(),
      removeEdge: jest.fn(),
      clone: jest.fn()
    } as any;

    (Workflow as jest.MockedClass<typeof Workflow>).mockImplementation(() => mockWorkflow);
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('workflow');
    });
  });

  describe('execute', () => {
    it('should execute embedded workflow successfully', async () => {
      const mockNodeResult1: NodeResult = {
        nodeId: 'start',
        success: true,
        data: { message: 'Started' },
        executedAt: new Date().toISOString(),
        duration: 10
      };

      const mockNodeResult2: NodeResult = {
        nodeId: 'end',
        success: true,
        data: { message: 'Completed' },
        executedAt: new Date().toISOString(),
        duration: 5
      };

      const mockRuntimeState: RuntimeState = {
        id: 'execution-123',
        workflowId: 'test-embedded-workflow',
        status: 'completed',
        executionResults: new Map([
          ['start', mockNodeResult1],
          ['end', mockNodeResult2]
        ]),
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      const result = await handler.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('workflow-node');
      
      const resultData = result.data as WorkflowResponseData;
      expect(resultData.workflowId).toBe('test-embedded-workflow');
      expect(resultData.workflowStatus).toBe('completed');
      expect(resultData.executionId).toBe('execution-123');
      expect(resultData.workflowResults).toHaveLength(2);
      expect(resultData.output).toBe('Workflow test-embedded-workflow completed successfully');
      
      expect(result.executedAt).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should execute workflow with custom context', async () => {
      const nodeWithContext: Node = {
        ...mockNode,
        parameters: {
          blueprint: mockBlueprint,
          workflowContext: {
            customKey: 'customValue',
            userId: 'custom-user'
          }
        } as WorkflowNodeParameters
      };

      const contextHandler = new WorkflowHandler(nodeWithContext);

      const mockRuntimeState: RuntimeState = {
        id: 'execution-456',
        workflowId: 'test-embedded-workflow',
        status: 'completed',
        executionResults: new Map(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      await contextHandler.execute(mockContext);

      // Verify Workflow was created with correct blueprint
      expect(Workflow).toHaveBeenCalledWith(mockBlueprint);

      // Verify execute was called with merged context
      expect(mockWorkflow.execute).toHaveBeenCalledWith(expect.objectContaining({
        ...mockContext,
        expeditionState: expect.objectContaining({
          workflowNodeId: 'workflow-node',
          customKey: 'customValue',
          userId: 'custom-user'
        })
      }));
    });

    it('should handle workflow execution failure', async () => {
      const mockRuntimeState: RuntimeState = {
        id: 'execution-failed',
        workflowId: 'test-embedded-workflow',
        status: 'failed',
        executionResults: new Map(),
        error: {
          code: 'NODE_EXECUTION_FAILED',
          message: 'Something went wrong',
          timestamp: new Date().toISOString(),
          recoverable: false
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      const result = await handler.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow test-embedded-workflow execution failed: Something went wrong');
      expect(result.nodeId).toBe('workflow-node');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle workflow execution failure without error message', async () => {
      const mockRuntimeState: RuntimeState = {
        id: 'execution-failed-no-message',
        workflowId: 'test-embedded-workflow',
        status: 'failed',
        executionResults: new Map(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      const result = await handler.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow test-embedded-workflow execution failed: Workflow execution failed');
    });

    it('should handle workflow execution exception', async () => {
      mockWorkflow.execute.mockRejectedValue(new Error('Workflow crashed'));

      const result = await handler.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow test-embedded-workflow execution failed: Workflow crashed');
      expect(result.nodeId).toBe('workflow-node');
    });

    it('should handle non-Error exceptions', async () => {
      mockWorkflow.execute.mockRejectedValue('String error');

      const result = await handler.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow test-embedded-workflow execution failed: Unknown error');
    });

    it('should merge existing expedition state with workflow context', async () => {
      const contextWithExistingState = {
        ...mockContext,
        expeditionState: {
          existingKey: 'existingValue',
          sharedKey: 'originalValue'
        }
      };

      const nodeWithContext: Node = {
        ...mockNode,
        parameters: {
          blueprint: mockBlueprint,
          workflowContext: {
            newKey: 'newValue',
            sharedKey: 'overriddenValue'
          }
        } as WorkflowNodeParameters
      };

      const contextHandler = new WorkflowHandler(nodeWithContext);

      const mockRuntimeState: RuntimeState = {
        id: 'execution-merge',
        workflowId: 'test-embedded-workflow',
        status: 'completed',
        executionResults: new Map(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      await contextHandler.execute(contextWithExistingState);

      expect(mockWorkflow.execute).toHaveBeenCalledWith(expect.objectContaining({
        expeditionState: expect.objectContaining({
          existingKey: 'existingValue',
          workflowNodeId: 'workflow-node',
          newKey: 'newValue',
          sharedKey: 'overriddenValue' // Should override existing
        })
      }));
    });

    it('should filter successful results from workflow execution', async () => {
      const successfulResult: NodeResult = {
        nodeId: 'success-node',
        success: true,
        data: { result: 'success' },
        executedAt: new Date().toISOString()
      };

      const failedResult: NodeResult = {
        nodeId: 'failed-node',
        success: false,
        error: 'Failed to execute',
        executedAt: new Date().toISOString()
      };

      const mockRuntimeState: RuntimeState = {
        id: 'execution-mixed',
        workflowId: 'test-embedded-workflow',
        status: 'completed',
        executionResults: new Map([
          ['success-node', successfulResult],
          ['failed-node', failedResult]
        ]),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      const result = await handler.execute(mockContext);

      const resultData = result.data as WorkflowResponseData;
      expect(resultData.workflowResults).toHaveLength(1);
      expect(resultData.workflowResults[0]).toEqual({ result: 'success' });
    });

    it('should set execution timestamp', async () => {
      const mockRuntimeState: RuntimeState = {
        id: 'execution-timestamp',
        workflowId: 'test-embedded-workflow',
        status: 'completed',
        executionResults: new Map(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      const beforeExecution = Date.now();
      const result = await handler.execute(mockContext);
      const afterExecution = Date.now();

      const executedAtTimestamp = new Date(result.executedAt).getTime();
      expect(executedAtTimestamp).toBeGreaterThanOrEqual(beforeExecution);
      expect(executedAtTimestamp).toBeLessThanOrEqual(afterExecution);
    });
  });

  describe('validate', () => {
    it('should validate successfully with valid parameters', () => {
      const result = handler.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should validate successfully with timeout parameter', () => {
      const nodeWithTimeout: Node = {
        ...mockNode,
        parameters: {
          blueprint: mockBlueprint,
          timeout: 60000
        } as WorkflowNodeParameters
      };
      const handlerWithTimeout = new WorkflowHandler(nodeWithTimeout);

      const result = handlerWithTimeout.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when blueprint is missing', () => {
      const nodeWithoutBlueprint: Node = {
        ...mockNode,
        parameters: {} as WorkflowNodeParameters
      };
      const handlerWithoutBlueprint = new WorkflowHandler(nodeWithoutBlueprint);

      const result = handlerWithoutBlueprint.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Blueprint is required',
        nodeId: 'workflow-node',
        severity: 'error'
      });
    });

    it('should fail validation when blueprint has no id', () => {
      const blueprintWithoutId: Blueprint = {
        ...mockBlueprint,
        id: ''
      };

      const nodeWithInvalidBlueprint: Node = {
        ...mockNode,
        parameters: {
          blueprint: blueprintWithoutId
        } as WorkflowNodeParameters
      };
      const handlerWithInvalidBlueprint = new WorkflowHandler(nodeWithInvalidBlueprint);

      const result = handlerWithInvalidBlueprint.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'INVALID_BLUEPRINT',
        message: 'Blueprint must have an id',
        nodeId: 'workflow-node',
        severity: 'error'
      });
    });

    it('should fail validation when blueprint has no nodes', () => {
      const blueprintWithoutNodes: Blueprint = {
        ...mockBlueprint,
        nodes: []
      };

      const nodeWithInvalidBlueprint: Node = {
        ...mockNode,
        parameters: {
          blueprint: blueprintWithoutNodes
        } as WorkflowNodeParameters
      };
      const handlerWithInvalidBlueprint = new WorkflowHandler(nodeWithInvalidBlueprint);

      const result = handlerWithInvalidBlueprint.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'INVALID_BLUEPRINT',
        message: 'Blueprint must contain at least one node',
        nodeId: 'workflow-node',
        severity: 'error'
      });
    });

    it('should fail validation when blueprint has no start node', () => {
      const blueprintWithoutStart: Blueprint = {
        ...mockBlueprint,
        nodes: [
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ]
      };

      const nodeWithInvalidBlueprint: Node = {
        ...mockNode,
        parameters: {
          blueprint: blueprintWithoutStart
        } as WorkflowNodeParameters
      };
      const handlerWithInvalidBlueprint = new WorkflowHandler(nodeWithInvalidBlueprint);

      const result = handlerWithInvalidBlueprint.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'INVALID_BLUEPRINT',
        message: 'Blueprint must have a start node',
        nodeId: 'workflow-node',
        severity: 'error'
      });
    });

    it('should fail validation when blueprint has invalid edge references', () => {
      const blueprintWithInvalidEdges: Blueprint = {
        ...mockBlueprint,
        edges: [
          { id: 'edge-1', from: 'start', to: 'nonexistent' },
          { id: 'edge-2', from: 'nonexistent2', to: 'end' }
        ]
      };

      const nodeWithInvalidBlueprint: Node = {
        ...mockNode,
        parameters: {
          blueprint: blueprintWithInvalidEdges
        } as WorkflowNodeParameters
      };
      const handlerWithInvalidBlueprint = new WorkflowHandler(nodeWithInvalidBlueprint);

      const result = handlerWithInvalidBlueprint.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'INVALID_BLUEPRINT',
        message: 'Invalid edge reference in blueprint: start -> nonexistent',
        nodeId: 'workflow-node',
        severity: 'error'
      });
      expect(result.errors).toContainEqual({
        code: 'INVALID_BLUEPRINT',
        message: 'Invalid edge reference in blueprint: nonexistent2 -> end',
        nodeId: 'workflow-node',
        severity: 'error'
      });
    });

    it('should warn about low timeout', () => {
      const nodeWithLowTimeout: Node = {
        ...mockNode,
        parameters: {
          blueprint: mockBlueprint,
          timeout: 500
        } as WorkflowNodeParameters
      };
      const handlerWithLowTimeout = new WorkflowHandler(nodeWithLowTimeout);

      const result = handlerWithLowTimeout.validate();

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        code: 'LOW_TIMEOUT',
        message: 'Workflow timeout is less than 1 second, which may be too short for complex workflows',
        nodeId: 'workflow-node',
        severity: 'warning'
      });
    });

    it('should handle multiple validation errors', () => {
      const invalidBlueprint: Blueprint = {
        id: '', // Invalid: empty id
        nodes: [], // Invalid: no nodes
        edges: [],
        metadata: {}
      };

      const nodeWithMultipleErrors: Node = {
        ...mockNode,
        parameters: {
          blueprint: invalidBlueprint
        } as WorkflowNodeParameters
      };
      const handlerWithMultipleErrors = new WorkflowHandler(nodeWithMultipleErrors);

      const result = handlerWithMultipleErrors.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      
      const errorMessages = result.errors.map(e => e.message);
      expect(errorMessages).toContain('Blueprint must have an id');
      expect(errorMessages).toContain('Blueprint must contain at least one node');
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('workflow');
    });
  });
});