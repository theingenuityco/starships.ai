/**
 * Workflow Unit Tests
 */

import { Workflow } from '@/Workflow';
import { Blueprint, Execution, WorkflowParams } from '@/types';

describe('Workflow', () => {
  let mockExecution: Execution;

  beforeEach(() => {
    mockExecution = global.createMockExecution();
  });

  describe('constructor', () => {
    it('should create workflow from parameters', () => {
      const testBlueprint = {
        nodes: [],
        edges: [],
        metadata: {},
      };
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: testBlueprint,
      };
      const workflow = new Workflow(params);

      expect(workflow.getNodes()).toHaveLength(0);
      expect(workflow.getEdges()).toHaveLength(0);

      const blueprint = workflow.getBlueprint();
      expect(blueprint.nodes).toEqual([]);
      expect(blueprint.edges).toEqual([]);
      expect(blueprint.metadata).toEqual({});
    });

    it('should create workflow from parameters with blueprint', () => {
      const mockBlueprint: Blueprint = {
        nodes: [{ ref: 'node1', type: 'start', name: 'Start', description: 'Start node', parameters: {} }],
        edges: [{ ref: 'edge1', from: 'node1', to: 'node2' }],
        metadata: { version: '1.0' },
      };

      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: mockBlueprint,
        timeout: 30000,
      };
      const workflow = new Workflow(params);

      expect(workflow.getNodes()).toHaveLength(1);
      expect(workflow.getEdges()).toHaveLength(1);
      expect(workflow.getTimeout()).toBe(30000);

      const blueprint = workflow.getBlueprint();
      expect(blueprint.metadata?.version).toBe('1.0');
    });

    it('should create a copy of the blueprint to avoid mutations', () => {
      const originalBlueprint: Blueprint = {
        nodes: [{ ref: 'node1', type: 'start', name: 'Start', description: 'Start node', parameters: {} }],
        edges: [],
        metadata: {},
      };

      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: originalBlueprint,
      };
      const workflow = new Workflow(params);

      // Get initial state
      const initialNodeCount = workflow.getNodes().length;

      // Modify original blueprint
      originalBlueprint.nodes.push({
        ref: 'node2',
        type: 'end',
        name: 'End',
        description: 'End node',
        parameters: {},
      });

      // Workflow should have original values (not affected by mutations to original blueprint)
      expect(workflow.getNodes()).toHaveLength(initialNodeCount);
    });
  });

  describe('addNode', () => {
    it('should add node with generated id', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addNode({
        type: 'start',
        name: 'Start Node',
        description: 'Starting point',
        parameters: {},
      });

      const nodes = workflow.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].ref).toBeDefined();
      expect(nodes[0].type).toBe('start');
      expect(nodes[0].name).toBe('Start Node');
      expect(nodes[0].description).toBe('Starting point');
    });

    it('should add node with provided ref', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addNode({
        ref: 'custom-ref',
        type: 'end',
        name: 'End Node',
        description: 'Ending point',
        parameters: {},
      });

      const nodes = workflow.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].ref).toBe('custom-ref');
    });

    it('should add node with metadata', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addNode({
        type: 'conditional',
        name: 'Decision',
        description: 'Decision point',
        parameters: {},
        metadata: { position: { x: 100, y: 200 } },
      });

      const nodes = workflow.getNodes();
      expect(nodes[0].metadata).toEqual({ position: { x: 100, y: 200 } });
    });

    it('should support method chaining', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      const result = workflow
        .addNode({ type: 'start', name: 'Start', description: 'Start', parameters: {} })
        .addNode({ type: 'end', name: 'End', description: 'End', parameters: {} });

      expect(result).toBe(workflow);
      expect(workflow.getNodes()).toHaveLength(2);
    });
  });

  describe('addEdge', () => {
    it('should add basic edge', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addEdge('node1', 'node2');

      const edges = workflow.getEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0].ref).toBeDefined();
      expect(edges[0].from).toBe('node1');
      expect(edges[0].to).toBe('node2');
      expect(edges[0].condition).toBeUndefined();
      expect(edges[0].label).toBeUndefined();
    });

    it('should add edge with condition', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addEdge('node1', 'node2', 'success');

      const edges = workflow.getEdges();
      expect(edges[0].condition).toBe('success');
    });

    it('should add edge with condition and label', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addEdge('node1', 'node2', 'success', 'Success Path');

      const edges = workflow.getEdges();
      expect(edges[0].condition).toBe('success');
      expect(edges[0].label).toBe('Success Path');
    });

    it('should add edge with metadata', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addEdge('node1', 'node2');

      const edges = workflow.getEdges();
      expect(edges[0].metadata).toEqual({});
    });

    it('should support method chaining', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      const result = workflow.addEdge('start', 'middle').addEdge('middle', 'end');

      expect(result).toBe(workflow);
      expect(workflow.getEdges()).toHaveLength(2);
    });
  });

  describe('removeNode', () => {
    it('should remove node and associated edges', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'node1',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addNode({ ref: 'node2', type: 'end', name: 'End', description: 'End', parameters: {} })
        .addNode({
          ref: 'node3',
          type: 'conditional',
          name: 'Decision',
          description: 'Decision',
          parameters: {},
        })
        .addEdge('node1', 'node2')
        .addEdge('node2', 'node3')
        .addEdge('node3', 'node1');

      workflow.removeNode('node2');

      const nodes = workflow.getNodes();
      const edges = workflow.getEdges();

      expect(nodes).toHaveLength(2);
      expect(nodes.find((n) => n.ref === 'node2')).toBeUndefined();

      // Edges involving node2 should be removed
      expect(edges).toHaveLength(1);
      expect(edges[0].from).toBe('node3');
      expect(edges[0].to).toBe('node1');
    });

    it('should handle removing non-existent node', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addNode({
        ref: 'node1',
        type: 'start',
        name: 'Start',
        description: 'Start',
        parameters: {},
      });

      expect(() => workflow.removeNode('nonexistent')).not.toThrow();
      expect(workflow.getNodes()).toHaveLength(1);
    });

    it('should support method chaining', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'node1',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addNode({ ref: 'node2', type: 'end', name: 'End', description: 'End', parameters: {} });

      const result = workflow.removeNode('node1');
      expect(result).toBe(workflow);
    });
  });

  describe('removeEdge', () => {
    it('should remove edge by ref', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addEdge('node1', 'node2').addEdge('node2', 'node3');

      const edges = workflow.getEdges();
      const edgeToRemove = edges[0].ref;

      workflow.removeEdge(edgeToRemove);

      const remainingEdges = workflow.getEdges();
      expect(remainingEdges).toHaveLength(1);
      expect(remainingEdges[0].from).toBe('node2');
      expect(remainingEdges[0].to).toBe('node3');
    });

    it('should handle removing non-existent edge', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addEdge('node1', 'node2');

      expect(() => workflow.removeEdge('nonexistent')).not.toThrow();
      expect(workflow.getEdges()).toHaveLength(1);
    });

    it('should support method chaining', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addEdge('node1', 'node2');
      const edgeRef = workflow.getEdges()[0].ref;

      const result = workflow.removeEdge(edgeRef);
      expect(result).toBe(workflow);
    });
  });

  describe('getBlueprint', () => {
    it('should return deep copy of blueprint', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'node1',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addEdge('node1', 'node2');

      const blueprint1 = workflow.getBlueprint();
      const blueprint2 = workflow.getBlueprint();

      expect(blueprint1).toEqual(blueprint2);
      expect(blueprint1).not.toBe(blueprint2);
      expect(blueprint1.nodes).not.toBe(blueprint2.nodes);
      expect(blueprint1.edges).not.toBe(blueprint2.edges);
    });
  });

  describe('getter methods', () => {
    it('should return copies of nodes and edges', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'node1',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addEdge('node1', 'node2');

      const nodes1 = workflow.getNodes();
      const nodes2 = workflow.getNodes();
      const edges1 = workflow.getEdges();
      const edges2 = workflow.getEdges();

      expect(nodes1).toEqual(nodes2);
      expect(nodes1).not.toBe(nodes2);
      expect(edges1).toEqual(edges2);
      expect(edges1).not.toBe(edges2);
    });
  });

  describe('execute', () => {
    it('should execute simple workflow successfully', async () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addNode({ ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} })
        .addEdge('start', 'end');

      const result = await workflow.execute(mockExecution);

      expect(result.status).toBe('completed');
      expect(result.executionResults.size).toBe(2);
    });

    it('should handle execution with initial execution state', async () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addNode({ ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} })
        .addEdge('start', 'end');

      const initialExecution = global.createMockExecution();

      const result = await workflow.execute(initialExecution);

      expect(result.status).toBe('completed');
    });

    it('should handle workflow execution failure', async () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      // Create workflow without start node to trigger failure
      workflow.addNode({
        ref: 'end',
        type: 'end',
        name: 'End',
        description: 'End',
        parameters: {},
      });

      const result = await workflow.execute(mockExecution);

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Workflow must have a start node');
    });
  });

  describe('validate', () => {
    it('should validate successful workflow', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addNode({ ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} })
        .addEdge('start', 'end');

      const validation = workflow.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should fail validation without start node', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addNode({
        ref: 'end',
        type: 'end',
        name: 'End',
        description: 'End',
        parameters: {},
      });

      const validation = workflow.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Workflow must have a start node');
    });

    it('should fail validation with unsupported node types', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addNode({
          ref: 'unsupported',
          type: 'unsupported-type' as 'start', // Temporarily cast to valid type for test
          name: 'Unsupported',
          description: 'Unsupported',
          parameters: {},
        });

      const validation = workflow.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Unsupported node types'))).toBe(true);
    });

    it('should fail validation with invalid edge references', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addEdge('start', 'nonexistent');

      const validation = workflow.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Invalid edge references'))).toBe(true);
    });

    it('should handle empty workflow', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      const validation = workflow.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Workflow must have a start node');
    });
  });

  describe('clone', () => {
    it('should clone workflow', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'node1',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addEdge('node1', 'node2');

      const cloned = workflow.clone();

      expect(cloned.getNodes()).toEqual(workflow.getNodes());
      expect(cloned.getEdges()).toEqual(workflow.getEdges());

      // Should be independent copies
      expect(cloned).not.toBe(workflow);
      expect(cloned.getNodes()).not.toBe(workflow.getNodes());
    });

    it('should create independent clone', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow.addNode({
        ref: 'node1',
        type: 'start',
        name: 'Start',
        description: 'Start',
        parameters: {},
      });

      const cloned = workflow.clone();

      // Modify original
      workflow.addNode({
        ref: 'node2',
        type: 'end',
        name: 'End',
        description: 'End',
        parameters: {},
      });

      expect(workflow.getNodes()).toHaveLength(2);
      expect(cloned.getNodes()).toHaveLength(1);
    });
  });

  describe('complex workflows', () => {
    it('should handle workflow with conditional routing', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addNode({
          ref: 'condition',
          type: 'conditional',
          name: 'Decision',
          description: 'Decision',
          parameters: {
            sourceNodeId: 'start',
            expression: 'true',
            conditions: { success: 'true' },
            defaultCondition: 'success',
          },
        })
        .addNode({ ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} })
        .addEdge('start', 'condition')
        .addEdge('condition', 'end', 'success');

      const validation = workflow.validate();
      expect(validation.valid).toBe(true);
    });

    it('should handle workflow with user prompts', () => {
      const params: WorkflowParams = {
        name: 'Test Workflow',
        blueprint: {
          nodes: [],
          edges: [],
          metadata: {},
        },
      };
      const workflow = new Workflow(params);

      workflow
        .addNode({
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Start',
          parameters: {},
        })
        .addNode({
          ref: 'prompt',
          type: 'user_prompt',
          name: 'User Input',
          description: 'Get user input',
          parameters: {
            promptText: 'Please choose:',
            choices: [
              { id: 'yes', text: 'Yes', value: true },
              { id: 'no', text: 'No', value: false },
            ],
          },
        })
        .addNode({ ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} })
        .addEdge('start', 'prompt')
        .addEdge('prompt', 'end');

      const validation = workflow.validate();
      expect(validation.valid).toBe(true);
    });
  });
});
