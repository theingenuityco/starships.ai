/**
 * Blueprint Lint Tool - E2E
 * Executes blueprint_lint using real Autopilot Tool execution (no HTTP mocking needed)
 */

import { blueprintLintTool, blueprintLintToolTemplate } from '../blueprint-lint';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, NodeHandlerOptions } from '@starships/autopilot';

describe('Blueprint Lint Tool (E2E)', () => {
  async function executeTool(input: unknown) {
    const options: NodeHandlerOptions = {
      eventCallback: jest.fn(),
      execution: ExecutionItemUtils.createExecution(),
    };

    const toolNode = new Tool(blueprintLintTool, options);

    // Validate tool
    const validation = toolNode.validate();
    expect(validation.valid).toBe(true);

    const executionItem: ExecutionItem = { json: input || {}, pairedItem: { item: 0 } };
    const result = await toolNode.execute([executionItem]);
    return ExecutionItemUtils.unwrapSingle(result);
  }

  describe('Tool Structure Validation', () => {
    it('should have valid tool structure', () => {
      expect(blueprintLintTool.name).toBe('blueprint_lint');
      expect(blueprintLintTool.description).toContain('Validate');
      expect(blueprintLintTool.parameters).toBeDefined();
      expect(blueprintLintTool.blueprint).toBeDefined();
    });

    it('should require blueprint parameter', () => {
      const req = blueprintLintTool.parameters.required || [];
      expect(req).toEqual(expect.arrayContaining(['blueprint']));
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      expect(blueprintLintToolTemplate.name).toBe(blueprintLintTool.name);
      expect(blueprintLintToolTemplate.description).toBe(blueprintLintTool.description);
      expect(blueprintLintToolTemplate.parameters).toEqual(blueprintLintTool.parameters);
      expect(blueprintLintToolTemplate.blueprint).toEqual(blueprintLintTool.blueprint);
      expect(blueprintLintToolTemplate.slug).toBe('blueprint-lint');
      expect(blueprintLintToolTemplate.category).toBe('automation');
      expect(blueprintLintToolTemplate.requiresApiKey).toBe(false);
    });
  });

  describe('Real Tool Execution', () => {
    const VALID_BLUEPRINT = {
      nodes: [
        { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
        { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
      ],
      edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
      metadata: {},
    };

    it('should validate a simple valid blueprint', async () => {
      const result = (await executeTool({ blueprint: VALID_BLUEPRINT })) as {
        ok: boolean;
        issues: string[];
        summary: { nodeCount: number; edgeCount: number; types: Record<string, number> };
      };

      expect(result).toBeDefined();
      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.summary.nodeCount).toBe(2);
      expect(result.summary.edgeCount).toBe(1);
      expect(result.summary.types.start).toBe(1);
      expect(result.summary.types.end).toBe(1);
    });

    it('should detect missing start node', async () => {
      const invalid = {
        nodes: [{ ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} }],
        edges: [],
        metadata: {},
      };
      const result = (await executeTool({ blueprint: invalid })) as { ok: boolean; issues: string[] };
      expect(result.ok).toBe(false);
      expect(result.issues).toEqual(expect.arrayContaining(['Missing start node']));
    });

    it('should detect invalid node types and edge issues', async () => {
      const invalid = {
        nodes: [
          { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'x1', type: 'invalid_type', name: 'X', description: '', parameters: {} },
          { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
        ],
        edges: [
          { ref: 'e1', from: 'start_1', to: 'x1' },
          { ref: 'e2', from: 'x1', to: 'end_1' },
          { ref: 'e3', from: 'unknown', to: 'end_1' },
        ],
        metadata: {},
      };
      const result = (await executeTool({ blueprint: invalid })) as { ok: boolean; issues: string[] };
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.includes('Unsupported node type'))).toBe(true);
      expect(result.issues.some((i) => i.includes('references unknown node'))).toBe(true);
    });

    it('should handle malformed blueprint inputs', async () => {
      // Not an object
      await expect(executeTool({ blueprint: 'invalid-blueprint' })).resolves.toBeDefined();

      // Missing arrays
      const noNodes = await executeTool({ blueprint: { edges: [] } });
      const noEdges = await executeTool({ blueprint: { nodes: [] } });

      expect(noNodes && typeof noNodes === 'object').toBe(true);
      expect(noEdges && typeof noEdges === 'object').toBe(true);
    });
  });
});
