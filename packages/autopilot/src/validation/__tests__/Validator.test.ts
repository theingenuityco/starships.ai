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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'end' }
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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} }
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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} }
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
        nodes: [
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'end' }
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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'end' }
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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
          { ref: 'isolated', type: 'conditional', name: 'Isolated', description: 'Isolated node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'end' }
          // No edge connecting to 'isolated' node
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithUnreachableNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'UNREACHABLE_NODE',
        message: "Node 'Isolated' is not reachable from start node",
        nodeRef: 'isolated',
        severity: 'error'
      });
    });

    it('should detect circular dependencies', () => {
      const blueprintWithCircularDep: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'node1', type: 'conditional', name: 'Node 1', description: 'Node 1', parameters: {} },
          { ref: 'node2', type: 'conditional', name: 'Node 2', description: 'Node 2', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'node1' },
          { ref: 'edge-2', from: 'node1', to: 'node2' },
          { ref: 'edge-3', from: 'node2', to: 'node1' }, // Creates cycle
          { ref: 'edge-4', from: 'node2', to: 'end' }
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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'a', type: 'conditional', name: 'A', description: 'Node A', parameters: {} },
          { ref: 'b', type: 'conditional', name: 'B', description: 'Node B', parameters: {} },
          { ref: 'c', type: 'conditional', name: 'C', description: 'Node C', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'a' },
          { ref: 'edge-2', from: 'a', to: 'b' },
          { ref: 'edge-3', from: 'b', to: 'c' },
          { ref: 'edge-4', from: 'c', to: 'a' }, // Creates cycle: a -> b -> c -> a
          { ref: 'edge-5', from: 'c', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithComplexCycle);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should handle workflows without start node for connectivity validation', () => {
      const blueprintWithoutStartForConnectivity: Blueprint = {
        nodes: [
          { ref: 'node1', type: 'conditional', name: 'Node 1', description: 'Node 1', parameters: {} },
          { ref: 'node2', type: 'conditional', name: 'Node 2', description: 'Node 2', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'node1', to: 'node2' },
          { ref: 'edge-2', from: 'node2', to: 'end' }
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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'self-ref', type: 'conditional', name: 'Self Ref', description: 'Self referencing node', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'self-ref' },
          { ref: 'edge-2', from: 'self-ref', to: 'self-ref' }, // Self reference
          { ref: 'edge-3', from: 'self-ref', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(blueprintWithSelfReference);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should handle multiple validation errors', () => {
      const invalidBlueprint: Blueprint = {
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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'decision', type: 'conditional', name: 'Decision', description: 'Decision node', parameters: {} },
          { ref: 'path1', type: 'conditional', name: 'Path 1', description: 'Path 1', parameters: {} },
          { ref: 'path2', type: 'conditional', name: 'Path 2', description: 'Path 2', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'decision' },
          { ref: 'edge-2', from: 'decision', to: 'path1', condition: 'condition1' },
          { ref: 'edge-3', from: 'decision', to: 'path2', condition: 'condition2' },
          { ref: 'edge-4', from: 'path1', to: 'end' },
          { ref: 'edge-5', from: 'path2', to: 'end' }
        ],
        metadata: {}
      };

      const result = validator.validate(multiPathBlueprint);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect nodes that only connect to themselves', () => {
      const blueprintWithIsolatedSelfLoop: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'self-loop', type: 'conditional', name: 'Self Loop', description: 'Self loop node', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'end' },
          { ref: 'edge-2', from: 'self-loop', to: 'self-loop' } // Isolated self loop
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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'a', type: 'conditional', name: 'A', description: 'Node A', parameters: {} },
          { ref: 'b', type: 'conditional', name: 'B', description: 'Node B', parameters: {} },
          { ref: 'c', type: 'conditional', name: 'C', description: 'Node C', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'a' },
          { ref: 'edge-2', from: 'a', to: 'b' },
          { ref: 'edge-3', from: 'b', to: 'end' },
          { ref: 'edge-4', from: 'c', to: 'c' } // Isolated self loop
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
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} }
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
        nodes: [
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
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