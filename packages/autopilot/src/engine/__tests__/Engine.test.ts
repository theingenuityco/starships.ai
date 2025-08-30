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
  let handlers: Map<string, Handler>;
  let mockBlueprint: Blueprint;
  let mockContext: Partial<ExecutionContext>;

  beforeEach(() => {
    handlers = new Map();
    handlers.set('start', new StartHandler());
    handlers.set('end', new EndHandler());
    
    engine = new Engine(handlers);
    
    mockBlueprint = global.createMockBlueprint();
    mockContext = global.createMockContext();
  });

  describe('constructor', () => {
    it('should create engine with provided handlers', () => {
      const customHandlers = new Map<string, Handler>();
      const customEngine = new Engine(customHandlers);
      expect(customEngine).toBeInstanceOf(Engine);
    });

    it('should require handlers map to be provided', () => {
      // Engine now requires handlers map
      expect(() => new Engine(new Map())).not.toThrow();
    });
  });

  describe('execute', () => {
    it('should execute a simple workflow successfully', async () => {
      const result = await engine.execute(mockBlueprint, mockContext);
      
      expect(result.status).toBe('completed');
      expect(result.workflowId).toBe(mockBlueprint.id);
      expect(result.executionResults.size).toBe(2); // start and end nodes
      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should fail when workflow has no start node', async () => {
      const workflowWithoutStart = global.createMockBlueprint({
        nodes: [
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ]
      });
      
      const result = await engine.execute(workflowWithoutStart, mockContext);
      
      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Blueprint must have a start node');
    });

    it('should fail when node handler is missing', async () => {
      const workflowWithUnsupportedNode = global.createMockBlueprint({
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          { id: 'unsupported', type: 'unsupported-type' as any, name: 'Unsupported', description: 'Unsupported', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'unsupported' },
          { id: 'edge-2', from: 'unsupported', to: 'end' }
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
      expect(startResult?.data).toEqual({ message: 'Blueprint started' });
      
      const endResult = result.executionResults.get('end');
      expect(endResult?.success).toBe(true);
      expect(endResult?.data).toEqual({ message: 'Blueprint completed' });
    });

    it('should handle node execution failures', async () => {
      // Create a mock handler that fails
      class FailingHandler {
        readonly type = 'failing';
        
        async execute(): Promise<NodeResult> {
          return {
            nodeId: 'failing-node',
            success: false,
            error: 'Intentional failure',
            executedAt: new Date().toISOString(),
            duration: 0
          };
        }
        
        validate() {
          return { valid: true, errors: [], warnings: [], suggestions: [] };
        }
        
        getIcon() {
          return 'error';
        }
      }
      
      handlers.set('failing', new FailingHandler());
      
      const workflowWithFailingNode = global.createMockBlueprint({
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          { id: 'failing-node', type: 'failing' as any, name: 'Failing', description: 'Failing', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'failing-node' },
          { id: 'edge-2', from: 'failing-node', to: 'end' }
        ]
      });
      
      const result = await engine.execute(workflowWithFailingNode, mockContext);
      
      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Node execution failed');
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
      jest.spyOn(engine as any, 'executeGraph').mockImplementation(async function(...args) {
        // Capture the execution ID while it's running
        const running = engine.getRunningExecutions();
        if (running.length > 0) {
          executionId = running[0].id;
        }
        // Call original method
        return originalExecuteGraph.apply(this, args);
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
      class ConditionalHandler {
        readonly type = 'conditional';
        
        async execute(): Promise<NodeResult> {
          return {
            nodeId: 'conditional',
            success: true,
            data: { decision: 'path-a' },
            executedAt: new Date().toISOString(),
            duration: 10,
            nextEdgeCondition: 'path-a'
          };
        }
        
        validate() {
          return { valid: true, errors: [], warnings: [], suggestions: [] };
        }
        
        getIcon() {
          return 'branch';
        }
      }
      
      class PathHandler {
        readonly type = 'path';
        
        async execute(node: any): Promise<NodeResult> {
          return {
            nodeId: node.id,
            success: true,
            data: { path: node.id },
            executedAt: new Date().toISOString(),
            duration: 5
          };
        }
        
        validate() {
          return { valid: true, errors: [], warnings: [], suggestions: [] };
        }
        
        getIcon() {
          return 'arrow';
        }
      }
      
      handlers.set('conditional', new ConditionalHandler());
      handlers.set('path', new PathHandler());
      
      const conditionalBlueprint = global.createMockBlueprint({
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          { id: 'conditional', type: 'conditional', name: 'Decision', description: 'Decision', parameters: {} },
          { id: 'path-a', type: 'path' as any, name: 'Path A', description: 'Path A', parameters: {} },
          { id: 'path-b', type: 'path' as any, name: 'Path B', description: 'Path B', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'conditional' },
          { id: 'edge-2', from: 'conditional', to: 'path-a', condition: 'path-a' },
          { id: 'edge-3', from: 'conditional', to: 'path-b', condition: 'path-b' },
          { id: 'edge-4', from: 'path-a', to: 'end' },
          { id: 'edge-5', from: 'path-b', to: 'end' }
        ]
      });
      
      const result = await engine.execute(conditionalBlueprint, mockContext);
      
      expect(result.status).toBe('completed');
      expect(result.executionResults.has('path-a')).toBe(true);
      expect(result.executionResults.has('path-b')).toBe(false);
    });
  });
});