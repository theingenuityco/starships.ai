/**
 * Engine Unit Tests
 */

import { Engine, ExecutionEvent } from '../Engine';
import { Handler } from '../../nodes/Handler';
import { StartHandler } from '../../nodes/handlers/StartHandler';
import { EndHandler } from '../../nodes/handlers/EndHandler';
import { Blueprint, ExecutionContext, NodeResult } from '../../types';

describe('Engine', () => {
  let engine: Engine;
  let mockBlueprint: Blueprint;
  let mockContext: Partial<ExecutionContext>;

  beforeEach(() => {
    // Engine now manages handlers internally
    engine = new Engine();
    
    mockBlueprint = global.createMockBlueprint();
    mockContext = global.createMockContext();
  });

  describe('constructor', () => {
    it('should create engine with internal handlers', () => {
      const customEngine = new Engine();
      expect(customEngine).toBeInstanceOf(Engine);
    });

    it('should initialize default handlers automatically', () => {
      // Engine now manages handlers internally
      expect(() => new Engine()).not.toThrow();
      expect(engine.hasHandler('start')).toBe(true);
      expect(engine.hasHandler('end')).toBe(true);
      expect(engine.hasHandler('agent')).toBe(true);
      expect(engine.hasHandler('llm')).toBe(true);
    });
  });

  describe('execute', () => {
    it('should execute a simple workflow successfully', async () => {
      const result = await engine.execute(mockBlueprint, mockContext);
      
      expect(result.status).toBe('completed');
      expect(result.executionResults.size).toBe(2); // start and end nodes
      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should fail when workflow has no start node', async () => {
      const workflowWithoutStart = global.createMockBlueprint({
        nodes: [
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ]
      });
      
      const result = await engine.execute(workflowWithoutStart, mockContext);
      
      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Workflow must have a start node');
    });

    it('should fail when node handler is missing', async () => {
      const workflowWithUnsupportedNode = global.createMockBlueprint({
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          { ref: 'unsupported', type: 'unsupported-type' as any, name: 'Unsupported', description: 'Unsupported', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'unsupported' },
          { ref: 'edge-2', from: 'unsupported', to: 'end' }
        ]
      });
      
      const result = await engine.execute(workflowWithUnsupportedNode, mockContext);
      
      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Unsupported node types');
    });

    it('should store execution results for each node', async () => {
      const result = await engine.execute(mockBlueprint, mockContext);
      
      expect(result.executionResults.has('start')).toBe(true);
      expect(result.executionResults.has('end')).toBe(true);
      
      const startResult = result.executionResults.get('start');
      expect(startResult?.success).toBe(true);
      expect(startResult?.data).toEqual({ message: 'Workflow started' });
      
      const endResult = result.executionResults.get('end');
      expect(endResult?.success).toBe(true);
      expect(endResult?.data).toEqual({ message: 'Workflow completed' });
    });

    it('should handle node execution failures', async () => {
      // Test with an unsupported node type to simulate failure
      const workflowWithUnsupportedNode = global.createMockBlueprint({
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          { ref: 'unsupported-node', type: 'unsupported-failing-type' as any, name: 'Unsupported', description: 'Unsupported', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'unsupported-node' },
          { ref: 'edge-2', from: 'unsupported-node', to: 'end' }
        ]
      });
      
      const result = await engine.execute(workflowWithUnsupportedNode, mockContext);
      
      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Unsupported node types');
    });
  });

  describe('event system', () => {
    it('should emit workflow lifecycle events', async () => {
      const events: ExecutionEvent[] = [];
      
      const eventCallback = async (event: ExecutionEvent) => {
        events.push(event);
      };
      
      engine.onEvent(eventCallback);
      
      await engine.execute(mockBlueprint, mockContext);
      
      // Check that events were emitted in correct order
      expect(events).toHaveLength(6); // workflow_started, node_started, node_completed, node_started, node_completed, workflow_completed
      expect(events[0].type).toBe('workflow_started');
      expect(events[events.length - 1].type).toBe('workflow_completed');
    });

    it('should remove event callbacks', async () => {
      const events: ExecutionEvent[] = [];
      
      const eventCallback = async (event: ExecutionEvent) => {
        events.push(event);
      };
      
      engine.onEvent(eventCallback);
      engine.offEvent(eventCallback);
      
      await engine.execute(mockBlueprint, mockContext);
      
      expect(events).toHaveLength(0);
    });

    it('should handle event callback errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const failingCallback = async () => {
        throw new Error('Event callback error');
      };
      
      engine.onEvent(failingCallback);
      
      const result = await engine.execute(mockBlueprint, mockContext);
      
      // Blueprint should still complete successfully despite callback error
      expect(result.status).toBe('completed');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in workflow event callback:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('execution management', () => {
    it('should track running executions', async () => {
      // This test is tricky because execute() removes itself from running executions when complete
      // We need to capture the execution ID during execution
      let executionId: string = '';
      
      // Mock the executeGraph method to capture running executions
      const originalExecuteGraph = (engine as any).executeGraph;
      jest.spyOn(engine as any, 'executeGraph').mockImplementation(async (...args) => {
        // Capture the execution ID while it's running
        const running = engine.getRunningExecutions();
        if (running.length > 0) {
          executionId = running[0].id;
        }
        // Call original method
        return originalExecuteGraph.apply(engine, args);
      });
      
      const result = await engine.execute(mockBlueprint, mockContext);
      
      expect(result.status).toBe('completed');
      expect(executionId).toBeTruthy();
    });

    it('should return null for nonexistent execution status', () => {
      const status = engine.getExecutionStatus('nonexistent-id');
      expect(status).toBeNull();
    });
  });

  describe('workflow navigation', () => {
    it('should handle workflow with conditional edges', async () => {
      // Test conditional workflow using existing conditional handler
      const conditionalBlueprint = global.createMockBlueprint({
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          { ref: 'conditional', type: 'conditional', name: 'Decision', description: 'Decision', parameters: {
            sourceNodeId: 'start',
            conditions: {
              'default': 'true' // Simple condition that will match
            },
            defaultCondition: 'default'
          }},
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'conditional' },
          { ref: 'edge-2', from: 'conditional', to: 'end', condition: 'default' },
        ]
      });
      
      const result = await engine.execute(conditionalBlueprint, mockContext);
      
      expect(result.status).toBe('completed');
      expect(result.executionResults.has('conditional')).toBe(true);
      expect(result.executionResults.has('start')).toBe(true);
      expect(result.executionResults.has('end')).toBe(true);
    });
  });
});