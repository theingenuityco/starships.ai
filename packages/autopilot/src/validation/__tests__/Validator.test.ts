/**
 * Validator Unit Tests
 */

import { Validator } from '../Validator';
import { Blueprint, ValidationResult } from '../../types';

describe('Validator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('validate', () => {
    it('should validate successfully with valid workflow', () => {
      const validBlueprint: Blueprint = {
        id: 'valid-workflow',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(validBlueprint);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should fail validation when nodes are missing', () => {
      const blueprintWithoutNodes: Blueprint = {
        id: 'no-nodes',
        nodes: [],
        edges: [],
        metadata: {}
      };

      const result = validator.validate(blueprintWithoutNodes);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Blueprint must have nodes',
        severity: 'error'
      });
    });

    it('should fail validation when nodes array is undefined', () => {
      const blueprintWithUndefinedNodes = {
        id: 'undefined-nodes',
        edges: [],
        metadata: {}
      } as unknown as Blueprint;

      const result = validator.validate(blueprintWithUndefinedNodes);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Blueprint must have nodes',
        severity: 'error'
      });
    });

    it('should fail validation when edges are missing', () => {
      const blueprintWithoutEdges: Blueprint = {
        id: 'no-edges',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} }
        ],
        edges: [],
        metadata: {}
      };

      const result = validator.validate(blueprintWithoutEdges);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Blueprint must have edges',
        severity: 'error'
      });
    });

    it('should fail validation when edges array is undefined', () => {
      const blueprintWithUndefinedEdges = {
        id: 'undefined-edges',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} }
        ],
        metadata: {}
      } as Blueprint;

      const result = validator.validate(blueprintWithUndefinedEdges);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Blueprint must have edges',
        severity: 'error'
      });
    });

    it('should fail validation when start node is missing', () => {
      const blueprintWithoutStart: Blueprint = {
        id: 'no-start',
        nodes: [
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithoutStart);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_START_NODE',
        message: 'Blueprint must have a start node',
        severity: 'error'
      });
    });

    it('should fail validation when end node is missing', () => {
      const blueprintWithoutEnd: Blueprint = {
        id: 'no-end',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithoutEnd);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_END_NODE',
        message: 'Blueprint must have an end node',
        severity: 'error'
      });
    });

    it('should detect unreachable nodes', () => {
      const blueprintWithUnreachableNode: Blueprint = {
        id: 'unreachable-node',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
          { id: 'isolated', type: 'conditional', name: 'Isolated', description: 'Isolated node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'end' }
          // No edge connecting to 'isolated' node
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithUnreachableNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'UNREACHABLE_NODE',
        message: "Node 'Isolated' is not reachable from start node",
        nodeId: 'isolated',
        severity: 'error'
      });
    });

    it('should detect circular dependencies', () => {
      const blueprintWithCircularDep: Blueprint = {
        id: 'circular-dep',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'node1', type: 'conditional', name: 'Node 1', description: 'Node 1', parameters: {} },
          { id: 'node2', type: 'conditional', name: 'Node 2', description: 'Node 2', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'node1' },
          { id: 'edge-2', from: 'node1', to: 'node2' },
          { id: 'edge-3', from: 'node2', to: 'node1' }, // Creates cycle
          { id: 'edge-4', from: 'node2', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithCircularDep);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => 
        error.code === 'CIRCULAR_DEPENDENCY' && 
        error.message.includes('Circular dependency detected')
      )).toBe(true);
    });

    it('should handle complex circular dependencies', () => {
      const blueprintWithComplexCycle: Blueprint = {
        id: 'complex-cycle',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'a', type: 'conditional', name: 'A', description: 'Node A', parameters: {} },
          { id: 'b', type: 'conditional', name: 'B', description: 'Node B', parameters: {} },
          { id: 'c', type: 'conditional', name: 'C', description: 'Node C', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'a' },
          { id: 'edge-2', from: 'a', to: 'b' },
          { id: 'edge-3', from: 'b', to: 'c' },
          { id: 'edge-4', from: 'c', to: 'a' }, // Creates cycle: a -> b -> c -> a
          { id: 'edge-5', from: 'c', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithComplexCycle);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should handle workflows without start node for connectivity validation', () => {
      const blueprintWithoutStartForConnectivity: Blueprint = {
        id: 'no-start-connectivity',
        nodes: [
          { id: 'node1', type: 'conditional', name: 'Node 1', description: 'Node 1', parameters: {} },
          { id: 'node2', type: 'conditional', name: 'Node 2', description: 'Node 2', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'node1', to: 'node2' },
          { id: 'edge-2', from: 'node2', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithoutStartForConnectivity);

      expect(result.valid).toBe(false);
      // Should have start node error, but connectivity validation should handle missing start gracefully
      expect(result.errors.some(error => error.code === 'MISSING_START_NODE')).toBe(true);
    });

    it('should handle self-referencing nodes', () => {
      const blueprintWithSelfReference: Blueprint = {
        id: 'self-reference',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'self-ref', type: 'conditional', name: 'Self Ref', description: 'Self referencing node', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'self-ref' },
          { id: 'edge-2', from: 'self-ref', to: 'self-ref' }, // Self reference
          { id: 'edge-3', from: 'self-ref', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithSelfReference);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should handle multiple validation errors', () => {
      const invalidBlueprint: Blueprint = {
        id: 'multiple-errors',
        nodes: [], // Missing nodes
        edges: [], // Missing edges
        metadata: {}
      };

      const result = validator.validate(invalidBlueprint);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      
      const errorCodes = result.errors.map(e => e.code);
      expect(errorCodes).toContain('MISSING_REQUIRED_FIELD'); // Should appear for both nodes and edges
    });

    it('should handle validation exceptions gracefully', () => {
      // Create a blueprint that could cause issues during validation
      const problematicBlueprint = null as unknown as Blueprint;

      const result = validator.validate(problematicBlueprint);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'VALIDATION_FAILED',
        message: expect.stringContaining('Validation failed:'),
        severity: 'error'
      });
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should pass validation for workflow with multiple paths', () => {
      const multiPathBlueprint: Blueprint = {
        id: 'multi-path',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'decision', type: 'conditional', name: 'Decision', description: 'Decision node', parameters: {} },
          { id: 'path1', type: 'conditional', name: 'Path 1', description: 'Path 1', parameters: {} },
          { id: 'path2', type: 'conditional', name: 'Path 2', description: 'Path 2', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'decision' },
          { id: 'edge-2', from: 'decision', to: 'path1', condition: 'condition1' },
          { id: 'edge-3', from: 'decision', to: 'path2', condition: 'condition2' },
          { id: 'edge-4', from: 'path1', to: 'end' },
          { id: 'edge-5', from: 'path2', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(multiPathBlueprint);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect nodes that only connect to themselves', () => {
      const blueprintWithIsolatedSelfLoop: Blueprint = {
        id: 'isolated-self-loop',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'self-loop', type: 'conditional', name: 'Self Loop', description: 'Self loop node', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'end' },
          { id: 'edge-2', from: 'self-loop', to: 'self-loop' } // Isolated self loop
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithIsolatedSelfLoop);

      expect(result.valid).toBe(false);
      // Should detect both unreachable node and circular dependency
      expect(result.errors.some(error => error.code === 'UNREACHABLE_NODE')).toBe(true);
      expect(result.errors.some(error => error.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should handle workflow with no edges correctly', () => {
      const blueprintWithNoEdgesButNodes: Blueprint = {
        id: 'no-edges-with-nodes',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [],
        metadata: {}
      };

      const result = validator.validate(blueprintWithNoEdgesButNodes);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Blueprint must have edges',
        severity: 'error'
      });
    });

    it('should return early when basic structure validation fails', () => {
      const blueprintWithBasicErrors: Blueprint = {
        id: 'basic-errors',
        nodes: [],
        edges: [],
        metadata: {}
      };

      const result = validator.validate(blueprintWithBasicErrors);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2); // Only basic validation errors, no connectivity errors
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should properly track visited nodes in cycle detection', () => {
      const blueprintWithMultipleComponents: Blueprint = {
        id: 'multiple-components',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { id: 'a', type: 'conditional', name: 'A', description: 'Node A', parameters: {} },
          { id: 'b', type: 'conditional', name: 'B', description: 'Node B', parameters: {} },
          { id: 'c', type: 'conditional', name: 'C', description: 'Node C', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { id: 'edge-1', from: 'start', to: 'a' },
          { id: 'edge-2', from: 'a', to: 'b' },
          { id: 'edge-3', from: 'b', to: 'end' },
          { id: 'edge-4', from: 'c', to: 'c' } // Isolated self loop
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithMultipleComponents);

      expect(result.valid).toBe(false);
      // Should detect both unreachable node and circular dependency
      const errorCodes = result.errors.map(e => e.code);
      expect(errorCodes).toContain('UNREACHABLE_NODE');
      expect(errorCodes).toContain('CIRCULAR_DEPENDENCY');
    });
  });

  describe('edge cases', () => {
    it('should handle empty workflow gracefully', () => {
      const emptyBlueprint: Blueprint = {
        id: 'empty',
        nodes: [],
        edges: [],
        metadata: {}
      };

      const result = validator.validate(emptyBlueprint);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle workflow with only start node', () => {
      const startOnlyBlueprint: Blueprint = {
        id: 'start-only',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} }
        ],
        edges: [],
        metadata: {}
      };

      const result = validator.validate(startOnlyBlueprint);

      expect(result.valid).toBe(false);
      // Should fail due to missing edges (early return before checking start/end nodes)
      expect(result.errors.some(error => error.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
    });

    it('should handle workflow with only end node', () => {
      const endOnlyBlueprint: Blueprint = {
        id: 'end-only',
        nodes: [
          { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [],
        metadata: {}
      };

      const result = validator.validate(endOnlyBlueprint);

      expect(result.valid).toBe(false);
      // Should fail due to missing edges (early return before checking start/end nodes)
      expect(result.errors.some(error => error.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
    });
  });
});