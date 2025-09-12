/**
 * WorkflowHandler Unit Tests
 */

import { WorkflowHandler } from '@/nodes/handlers/WorkflowHandler';
import { Workflow } from '@/Workflow';
import { Node, Execution, WorkflowParams, Blueprint, NodeResult } from '@/types';

// Mock Workflow class
jest.mock('../../../Workflow');

// Type definitions for test data structures
interface WorkflowResponseData {
  workflowResults: unknown[];
  workflowStatus: string;
  executionId: string;
  output: string;
}

describe('WorkflowHandler', () => {
  let handler: WorkflowHandler;
  let mockNode: Node;
  let mockExecution: Execution;
  let mockWorkflow: jest.Mocked<Workflow>;

  const mockBlueprint: Blueprint = {
    nodes: [
      { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
      { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
    ],
    edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
    metadata: {},
  };

  beforeEach(() => {
    mockNode = {
      ref: 'workflow-node',
      type: 'workflow',
      name: 'Test Workflow Node',
      description: 'Workflow node for testing',
      parameters: {
        blueprint: mockBlueprint,
      } as WorkflowParams,
    };

    handler = new WorkflowHandler(mockNode);
    mockExecution = global.createMockExecution();

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
      clone: jest.fn(),
    } as unknown as jest.Mocked<Workflow>;

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
        nodeRef: 'start',
        data: { message: 'Started' },
      };

      const mockNodeResult2: NodeResult = {
        nodeRef: 'end',
        data: { message: 'Completed' },
      };

      const mockRuntimeState: Execution = global.createMockExecution({
        status: 'completed',
        results: new Map([
          ['start', mockNodeResult1],
          ['end', mockNodeResult2],
        ]),
      });

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      const result = await handler.execute(mockExecution);

      const nodeResult = result.results.get('workflow-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      expect(nodeResult?.nodeRef).toBe('workflow-node');

      const resultData = nodeResult?.data as WorkflowResponseData;
      expect(resultData.workflowStatus).toBe('completed');
      expect(resultData.workflowResults).toHaveLength(2);
      expect(resultData.output).toBe('Workflow completed successfully');
    });

    it('should execute workflow successfully', async () => {
      const mockRuntimeState: Execution = global.createMockExecution({
        status: 'completed',
      });

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      await handler.execute(mockExecution);

      // Verify Workflow was created with correct parameters
      expect(Workflow).toHaveBeenCalledWith(mockNode.parameters);

      // Verify execute was called
      expect(mockWorkflow.execute).toHaveBeenCalled();
    });

    it('should handle workflow execution failure', async () => {
      const mockRuntimeState: Execution = global.createMockExecution({
        status: 'failed',
        error: {
          code: 'NODE_EXECUTION_FAILED',
          message: 'Something went wrong',
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      });

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      const result = await handler.execute(mockExecution);

      const nodeResult = result.results.get('workflow-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toContain('Something went wrong');
      expect(nodeResult?.nodeRef).toBe('workflow-node');
    });

    it('should handle workflow execution failure without error message', async () => {
      const mockRuntimeState: Execution = global.createMockExecution({
        status: 'failed',
      });

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      const result = await handler.execute(mockExecution);

      const nodeResult = result.results.get('workflow-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toContain('Workflow execution failed');
    });

    it('should handle workflow execution exception', async () => {
      mockWorkflow.execute.mockRejectedValue(new Error('Workflow crashed'));

      const result = await handler.execute(mockExecution);

      const nodeResult = result.results.get('workflow-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toContain('Workflow crashed');
      expect(nodeResult?.nodeRef).toBe('workflow-node');
    });

    it('should handle non-Error exceptions', async () => {
      mockWorkflow.execute.mockRejectedValue('String error');

      const result = await handler.execute(mockExecution);

      const nodeResult = result.results.get('workflow-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toContain('Unknown error');
    });

    it('should execute workflow with timeout parameter', async () => {
      const nodeWithTimeout: Node = {
        ...mockNode,
        parameters: {
          blueprint: mockBlueprint,
          timeout: 30000,
        } as WorkflowParams,
      };

      const timeoutHandler = new WorkflowHandler(nodeWithTimeout);

      const mockRuntimeState: Execution = global.createMockExecution({
        status: 'completed',
      });

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      await timeoutHandler.execute(mockExecution);

      // Verify Workflow was created with correct parameters
      expect(Workflow).toHaveBeenCalledWith(nodeWithTimeout.parameters);
      expect(mockWorkflow.execute).toHaveBeenCalled();
    });

    it('should filter successful results from workflow execution', async () => {
      const successfulResult: NodeResult = {
        nodeRef: 'success-node',
        data: { result: 'success' },
      };

      const failedResult: NodeResult = {
        nodeRef: 'failed-node',
        error: 'Failed to execute',
      };

      const mockRuntimeState: Execution = global.createMockExecution({
        status: 'completed',
        results: new Map([
          ['success-node', successfulResult],
          ['failed-node', failedResult],
        ]),
      });

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      const result = await handler.execute(mockExecution);

      const nodeResult = result.results.get('workflow-node');
      expect(nodeResult).toBeDefined();
      const resultData = nodeResult?.data as WorkflowResponseData;
      expect(resultData.workflowResults).toHaveLength(1);
      expect(resultData.workflowResults[0]).toEqual({ result: 'success' });
    });

    it('should set execution timestamp', async () => {
      const mockRuntimeState: Execution = global.createMockExecution({
        status: 'completed',
      });

      mockWorkflow.execute.mockResolvedValue(mockRuntimeState);

      const result = await handler.execute(mockExecution);

      expect(result).toBeDefined();
      const nodeResult = result.results.get('workflow-node');
      expect(nodeResult).toBeDefined();
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
          timeout: 60000,
        } as WorkflowParams,
      };
      const handlerWithTimeout = new WorkflowHandler(nodeWithTimeout);

      const result = handlerWithTimeout.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when blueprint is missing', () => {
      const nodeWithoutBlueprint: Node = {
        ...mockNode,
        parameters: {} as WorkflowParams,
      };
      const handlerWithoutBlueprint = new WorkflowHandler(nodeWithoutBlueprint);

      const result = handlerWithoutBlueprint.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Blueprint is required',
        nodeRef: 'workflow-node',
        severity: 'error',
      });
    });

    it('should validate successfully even without blueprint id', () => {
      const blueprintWithoutId: Blueprint = {
        ...mockBlueprint,
      };

      const nodeWithInvalidBlueprint: Node = {
        ...mockNode,
        parameters: {
          blueprint: blueprintWithoutId,
        } as WorkflowParams,
      };
      const handlerWithInvalidBlueprint = new WorkflowHandler(nodeWithInvalidBlueprint);

      const result = handlerWithInvalidBlueprint.validate();

      expect(result.valid).toBe(true);
    });

    it('should fail validation when blueprint has no nodes', () => {
      const blueprintWithoutNodes: Blueprint = {
        ...mockBlueprint,
        nodes: [],
      };

      const nodeWithInvalidBlueprint: Node = {
        ...mockNode,
        parameters: {
          blueprint: blueprintWithoutNodes,
        } as WorkflowParams,
      };
      const handlerWithInvalidBlueprint = new WorkflowHandler(nodeWithInvalidBlueprint);

      const result = handlerWithInvalidBlueprint.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'VALIDATION_FAILED',
        message: 'Blueprint must contain at least one node',
        nodeRef: 'workflow-node',
        severity: 'error',
      });
    });

    it('should fail validation when blueprint has no start node', () => {
      const blueprintWithoutStart: Blueprint = {
        ...mockBlueprint,
        nodes: [{ ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }],
      };

      const nodeWithInvalidBlueprint: Node = {
        ...mockNode,
        parameters: {
          blueprint: blueprintWithoutStart,
        } as WorkflowParams,
      };
      const handlerWithInvalidBlueprint = new WorkflowHandler(nodeWithInvalidBlueprint);

      const result = handlerWithInvalidBlueprint.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_START_NODE',
        message: 'Blueprint must have a start node',
        nodeRef: 'workflow-node',
        severity: 'error',
      });
    });

    it('should fail validation when blueprint has invalid edge references', () => {
      const blueprintWithInvalidEdges: Blueprint = {
        ...mockBlueprint,
        edges: [
          { ref: 'edge-1', from: 'start', to: 'nonexistent' },
          { ref: 'edge-2', from: 'nonexistent2', to: 'end' },
        ],
      };

      const nodeWithInvalidBlueprint: Node = {
        ...mockNode,
        parameters: {
          blueprint: blueprintWithInvalidEdges,
        } as WorkflowParams,
      };
      const handlerWithInvalidBlueprint = new WorkflowHandler(nodeWithInvalidBlueprint);

      const result = handlerWithInvalidBlueprint.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'INVALID_EDGE_CONNECTION',
        message: 'Invalid edge reference in blueprint: start -> nonexistent',
        nodeRef: 'workflow-node',
        severity: 'error',
      });
      expect(result.errors).toContainEqual({
        code: 'INVALID_EDGE_CONNECTION',
        message: 'Invalid edge reference in blueprint: nonexistent2 -> end',
        nodeRef: 'workflow-node',
        severity: 'error',
      });
    });

    it('should warn about low timeout', () => {
      const nodeWithLowTimeout: Node = {
        ...mockNode,
        parameters: {
          blueprint: mockBlueprint,
          timeout: 500,
        } as WorkflowParams,
      };
      const handlerWithLowTimeout = new WorkflowHandler(nodeWithLowTimeout);

      const result = handlerWithLowTimeout.validate();

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        code: 'POTENTIAL_TIMEOUT',
        message: 'Workflow timeout is less than 1 second, which may be too short for complex workflows',
        nodeRef: 'workflow-node',
      });
    });

    it('should handle multiple validation errors', () => {
      const invalidBlueprint: Blueprint = {
        nodes: [], // Invalid: no nodes
        edges: [],
        metadata: {},
      };

      const nodeWithMultipleErrors: Node = {
        ...mockNode,
        parameters: {
          blueprint: invalidBlueprint,
        } as WorkflowParams,
      };
      const handlerWithMultipleErrors = new WorkflowHandler(nodeWithMultipleErrors);

      const result = handlerWithMultipleErrors.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);

      const errorMessages = result.errors.map((e) => e.message);
      expect(errorMessages).toContain('Blueprint must contain at least one node');
      expect(errorMessages).toContain('Blueprint must have a start node');
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('workflow');
    });
  });
});
