/**
 * Blueprint Lint Tool - Functional Execution Tests
 *
 * Tests that actually execute the blueprint-lint tool functionality
 * to verify it works as expected with real input/output.
 */

import { blueprintLintTool } from '../blueprint-lint';
import { ToolTestRunner } from './tool-execution-helper';

describe('Blueprint Lint Tool - Functional Tests', () => {
  let testRunner: ToolTestRunner;

  beforeEach(() => {
    testRunner = new ToolTestRunner(blueprintLintTool);
  });

  describe('Valid Blueprint Validation', () => {
    it('should validate a simple valid blueprint', async () => {
      const validBlueprint = {
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
            { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
          ],
          edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
          metadata: {},
        },
      };

      const result = await testRunner.testValidInput(validBlueprint);

      // Type assertion to safely access properties
      const output = result as {
        ok: boolean;
        issues: string[];
        summary: { nodeCount: number; edgeCount: number; types: Record<string, number> };
      };

      expect(output.ok).toBe(true);
      expect(output.issues).toEqual([]);
      expect(output.summary.nodeCount).toBe(2);
      expect(output.summary.edgeCount).toBe(1);
      expect(output.summary.types).toEqual({ start: 1, end: 1 });
    });

    it('should validate a complex blueprint with multiple node types', async () => {
      const complexBlueprint = {
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
            { ref: 'code_1', type: 'code', name: 'Process', description: '', parameters: { code: 'return input;' } },
            { ref: 'http_1', type: 'http_request', name: 'API Call', description: '', parameters: {} },
            { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'code_1' },
            { ref: 'e2', from: 'code_1', to: 'http_1' },
            { ref: 'e3', from: 'http_1', to: 'end_1' },
          ],
          metadata: {},
        },
      };

      const result = await testRunner.testValidInput(complexBlueprint);

      const output = result as {
        ok: boolean;
        issues: string[];
        summary: { nodeCount: number; edgeCount: number; types: Record<string, number> };
      };

      expect(output.ok).toBe(true);
      expect(output.issues).toEqual([]);
      expect(output.summary.nodeCount).toBe(4);
      expect(output.summary.edgeCount).toBe(3);
      expect(output.summary.types).toEqual({
        start: 1,
        code: 1,
        http_request: 1,
        end: 1,
      });
    });
  });

  describe('Invalid Blueprint Detection', () => {
    it('should detect missing blueprint object', async () => {
      await testRunner.testInvalidInput({}, 'Invalid blueprint');
    });

    it('should detect blueprint with missing nodes array', async () => {
      const invalidBlueprint = {
        blueprint: {
          edges: [],
        },
      };

      await testRunner.testInvalidInput(invalidBlueprint, 'nodes must be an array');
    });

    it('should detect missing start node', async () => {
      const noStartBlueprint = {
        blueprint: {
          nodes: [{ ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} }],
          edges: [],
        },
      };

      const result = await testRunner.testValidInput(noStartBlueprint);

      const output = result as {
        ok: boolean;
        issues: string[];
      };

      expect(output.ok).toBe(false);
      expect(output.issues).toContain('Missing start node');
    });

    it('should detect missing end node', async () => {
      const noEndBlueprint = {
        blueprint: {
          nodes: [{ ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} }],
          edges: [],
        },
      };

      const result = await testRunner.testValidInput(noEndBlueprint);

      const output = result as {
        ok: boolean;
        issues: string[];
      };

      expect(output.ok).toBe(false);
      expect(output.issues).toContain('Missing end node');
    });

    it('should detect duplicate node refs', async () => {
      const duplicateRefBlueprint = {
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
            { ref: 'start_1', type: 'end', name: 'End', description: '', parameters: {} },
          ],
          edges: [],
        },
      };

      const result = await testRunner.testValidInput(duplicateRefBlueprint);

      const output = result as {
        ok: boolean;
        issues: string[];
      };

      expect(output.ok).toBe(false);
      expect(output.issues).toContain('Duplicate node ref: start_1');
    });

    it('should detect unsupported node types', async () => {
      const invalidTypeBlueprint = {
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
            { ref: 'invalid_1', type: 'invalid_type', name: 'Invalid', description: '', parameters: {} },
            { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'invalid_1' },
            { ref: 'e2', from: 'invalid_1', to: 'end_1' },
          ],
        },
      };

      const result = await testRunner.testValidInput(invalidTypeBlueprint);

      const output = result as {
        ok: boolean;
        issues: string[];
      };

      expect(output.ok).toBe(false);
      expect(output.issues.some((issue) => issue.includes('Unsupported node type "invalid_type"'))).toBe(true);
    });

    it('should detect edges referencing unknown nodes', async () => {
      const invalidEdgeBlueprint = {
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
            { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'unknown_node' },
            { ref: 'e2', from: 'another_unknown', to: 'end_1' },
          ],
        },
      };

      const result = await testRunner.testValidInput(invalidEdgeBlueprint);

      const output = result as {
        ok: boolean;
        issues: string[];
      };

      expect(output.ok).toBe(false);
      expect(output.issues.some((issue) => issue.includes('references unknown node: unknown_node'))).toBe(true);
      expect(output.issues.some((issue) => issue.includes('references unknown node: another_unknown'))).toBe(true);
    });
  });

  describe('Summary Generation', () => {
    it('should generate correct summary for various blueprint structures', async () => {
      const testBlueprint = {
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
            { ref: 'code_1', type: 'code', name: 'Code 1', description: '', parameters: {} },
            { ref: 'code_2', type: 'code', name: 'Code 2', description: '', parameters: {} },
            { ref: 'http_1', type: 'http_request', name: 'HTTP', description: '', parameters: {} },
            { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'code_1' },
            { ref: 'e2', from: 'code_1', to: 'code_2' },
            { ref: 'e3', from: 'code_2', to: 'http_1' },
            { ref: 'e4', from: 'http_1', to: 'end_1' },
          ],
          metadata: {},
        },
      };

      const result = await testRunner.testValidInput(testBlueprint);

      const output = result as {
        ok: boolean;
        summary: { nodeCount: number; edgeCount: number; types: Record<string, number> };
      };

      expect(output.ok).toBe(true);
      expect(output.summary).toEqual({
        nodeCount: 5,
        edgeCount: 4,
        types: {
          start: 1,
          code: 2,
          http_request: 1,
          end: 1,
        },
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle moderately large blueprints efficiently', async () => {
      const nodes = [];
      const edges = [];

      // Generate 50 nodes
      for (let i = 0; i < 50; i++) {
        nodes.push({
          ref: `node_${i}`,
          type: i === 0 ? 'start' : i === 49 ? 'end' : 'code',
          name: `Node ${i}`,
          description: '',
          parameters: {},
        });
      }

      // Generate edges in sequence
      for (let i = 0; i < 49; i++) {
        edges.push({
          ref: `edge_${i}`,
          from: `node_${i}`,
          to: `node_${i + 1}`,
        });
      }

      const largeBlueprint = {
        blueprint: { nodes, edges, metadata: {} },
      };

      const startTime = Date.now();
      const result = await testRunner.testValidInput(largeBlueprint);
      const duration = Date.now() - startTime;

      const output = result as {
        ok: boolean;
        issues: string[];
        summary: { nodeCount: number; edgeCount: number };
      };

      expect(output.ok).toBe(true);
      expect(output.issues).toEqual([]);
      expect(output.summary.nodeCount).toBe(50);
      expect(output.summary.edgeCount).toBe(49);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});
