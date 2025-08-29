/**
 * Validator Unit Tests
 */

import { Validator } from '../Validator';
import { Workflow, Node, Edge, ValidationError } from '../../types';

describe('Validator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('validate', () => {
    it('should validate a simple valid workflow', () => {
      const workflow: Workflow = global.createMockWorkflow();
      
      const result = validator.validate(workflow);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should fail validation when workflow has no nodes', () => {
      const workflow: Workflow = global.createMockWorkflow({
        nodes: []
      });
      
      const result = validator.validate(workflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('Workflow must have nodes');
    });

    it('should fail validation when workflow has no edges', () => {
      const workflow: Workflow = global.createMockWorkflow({
        edges: []
      });
      
      const result = validator.validate(workflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('Workflow must have edges');
    });

    it('should fail validation when workflow has no start node', () => {
      const workflow: Workflow = global.createMockWorkflow({
        nodes: [
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ]
      });
      
      const result = validator.validate(workflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_START_NODE',
          message: 'Workflow must have a start node'
        })
      );
    });

    it('should fail validation when workflow has no end node', () => {
      const workflow: Workflow = global.createMockWorkflow({
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} }
        ]
      });
      
      const result = validator.validate(workflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_END_NODE',
          message: 'Workflow must have an end node'
        })
      );
    });

    it('should detect unreachable nodes', () => {
      const workflow: Workflow = global.createMockWorkflow({
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
          { id: 'orphan', type: 'agent', name: 'Orphan', description: 'Unreachable node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'end' }
        ]
      });
      
      const result = validator.validate(workflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'UNREACHABLE_NODE',
          message: "Node 'Orphan' is not reachable from start node",
          nodeId: 'orphan'
        })
      );
    });

    it('should detect circular dependencies', () => {
      const workflow: Workflow = global.createMockWorkflow({
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'node1', type: 'agent', name: 'Node 1', description: 'First node', parameters: {} },
          { id: 'node2', type: 'agent', name: 'Node 2', description: 'Second node', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'node1' },
          { id: 'edge-2', from: 'node1', to: 'node2' },
          { id: 'edge-3', from: 'node2', to: 'node1' }, // Creates cycle
          { id: 'edge-4', from: 'node2', to: 'end' }
        ]
      });
      
      const result = validator.validate(workflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'CIRCULAR_DEPENDENCY',
          message: expect.stringContaining('Circular dependency detected')
        })
      );
    });

    it('should handle validation exceptions gracefully', () => {
      // Create an invalid workflow object that will cause an exception
      const invalidWorkflow = null as any;
      
      const result = validator.validate(invalidWorkflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('VALIDATION_FAILED');
      expect(result.errors[0].message).toContain('Validation failed');
    });

    it('should validate complex workflow with conditional paths', () => {
      const workflow: Workflow = global.createMockWorkflow({
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'conditional', type: 'conditional', name: 'Decision', description: 'Conditional node', parameters: {} },
          { id: 'path-a', type: 'agent', name: 'Path A', description: 'Path A node', parameters: {} },
          { id: 'path-b', type: 'agent', name: 'Path B', description: 'Path B node', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'conditional' },
          { id: 'edge-2', from: 'conditional', to: 'path-a', condition: 'true' },
          { id: 'edge-3', from: 'conditional', to: 'path-b', condition: 'false' },
          { id: 'edge-4', from: 'path-a', to: 'end' },
          { id: 'edge-5', from: 'path-b', to: 'end' }
        ]
      });
      
      const result = validator.validate(workflow);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('findReachableNodes', () => {
    it('should find all nodes reachable from start in linear workflow', () => {
      const workflow: Workflow = global.createMockWorkflow({
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          { id: 'middle', type: 'agent', name: 'Middle', description: 'Middle', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'middle' },
          { id: 'edge-2', from: 'middle', to: 'end' }
        ]
      });

      // Access private method through any to test it
      const reachableNodes = (validator as any).findReachableNodes(workflow, 'start');
      
      expect(reachableNodes.size).toBe(3);
      expect(reachableNodes.has('start')).toBe(true);
      expect(reachableNodes.has('middle')).toBe(true);
      expect(reachableNodes.has('end')).toBe(true);
    });
  });

  describe('detectCircularDependencies', () => {
    it('should detect simple cycle', () => {
      const workflow: Workflow = global.createMockWorkflow({
        nodes: [
          { id: 'node1', type: 'agent', name: 'Node 1', description: 'Node 1', parameters: {} },
          { id: 'node2', type: 'agent', name: 'Node 2', description: 'Node 2', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'node1', to: 'node2' },
          { id: 'edge-2', from: 'node2', to: 'node1' }
        ]
      });

      // Access private method through any to test it
      const cycles = (validator as any).detectCircularDependencies(workflow);
      
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toContain('node1');
      expect(cycles[0]).toContain('node2');
    });

    it('should return empty array for acyclic graph', () => {
      const workflow: Workflow = global.createMockWorkflow();

      // Access private method through any to test it
      const cycles = (validator as any).detectCircularDependencies(workflow);
      
      expect(cycles).toHaveLength(0);
    });
  });
});