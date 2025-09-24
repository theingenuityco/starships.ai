/**
 * Blueprint Lint Tool Tests
 * End-to-end tests for the blueprint_lint tool using autopilot Tool node
 */

import { blueprintLintTool, blueprintLintToolTemplate } from '../blueprint-lint';
import { ToolTestHelper, CommonToolTestData } from './tool-test-helper';

describe('Blueprint Lint Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(blueprintLintTool, blueprintLintToolTemplate, 'blueprint_lint');
    testHelper.clearEventLogs();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      const result = testHelper.testToolStructure();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct tool name', () => {
      expect(blueprintLintTool.name).toBe('blueprint_lint');
    });

    it('should have descriptive description', () => {
      expect(blueprintLintTool.description).toContain('blueprint');
      expect(blueprintLintTool.description.length).toBeGreaterThan(10);
    });
  });

  describe('Parameter Schema', () => {
    it('should have valid parameter schema', () => {
      const result = testHelper.testParameterSchema();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require blueprint parameter', () => {
      expect(blueprintLintTool.parameters.required).toContain('blueprint');
    });

    it('should define blueprint as object type', () => {
      const blueprintProp = blueprintLintTool.parameters.properties?.blueprint as {
        type: string;
        description: string;
        properties: Record<string, unknown>;
      };
      expect(blueprintProp?.type).toBe('object');
      expect(blueprintProp?.description).toBeDefined();
    });
  });

  describe('Blueprint Structure', () => {
    it('should have valid blueprint structure', () => {
      const result = testHelper.testBlueprintStructure();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have start and end nodes', () => {
      const blueprint = blueprintLintTool.blueprint;
      const hasStart = blueprint.nodes.some((n) => n.type === 'start');
      const hasEnd = blueprint.nodes.some((n) => n.type === 'end');

      expect(hasStart).toBe(true);
      expect(hasEnd).toBe(true);
    });

    it('should have lint logic code node', () => {
      const blueprint = blueprintLintTool.blueprint;
      const hasLintNode = blueprint.nodes.some((n) => n.type === 'code' && n.name?.toLowerCase().includes('lint'));
      expect(hasLintNode).toBe(true);
    });

    it('should have proper node connectivity', () => {
      const blueprint = blueprintLintTool.blueprint;
      const nodeRefs = new Set(blueprint.nodes.map((n) => n.ref));

      for (const edge of blueprint.edges) {
        expect(nodeRefs.has(edge.from)).toBe(true);
        expect(nodeRefs.has(edge.to)).toBe(true);
      }
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      const result = testHelper.testTemplateConsistency();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct template metadata', () => {
      expect(blueprintLintToolTemplate.slug).toBe('blueprint-lint');
      expect(blueprintLintToolTemplate.category).toBe('automation');
      expect(blueprintLintToolTemplate.requiresApiKey).toBe(false);
    });

    it('should have example usage', () => {
      expect(blueprintLintToolTemplate.exampleUsage).toBeDefined();
      if (blueprintLintToolTemplate.exampleUsage) {
        expect(blueprintLintToolTemplate.exampleUsage.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Tool Execution', () => {
    it('should validate a simple valid blueprint', async () => {
      const input = {
        blueprint: CommonToolTestData.VALID_BLUEPRINT,
      };

      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      if (result.result && typeof result.result === 'object') {
        const lintResult = result.result as {
          ok: boolean;
          issues: string[];
          summary: { nodeCount: number; edgeCount: number; types: Record<string, number> };
        };
        expect(lintResult.ok).toBe(true);
        expect(lintResult.issues).toHaveLength(0);
        expect(lintResult.summary.nodeCount).toBe(2);
        expect(lintResult.summary.edgeCount).toBe(1);
        expect(lintResult.summary.types.start).toBe(1);
        expect(lintResult.summary.types.end).toBe(1);
      }
    });

    it('should validate a complex valid blueprint', async () => {
      const complexBlueprint = {
        nodes: [
          { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'llm_1', type: 'llm', name: 'LLM Call', description: 'AI processing', parameters: {} },
          { ref: 'http_1', type: 'http_request', name: 'API Call', description: 'External API', parameters: {} },
          { ref: 'conditional_1', type: 'conditional', name: 'Branch Logic', description: 'Decision point', parameters: {} },
          { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
        ],
        edges: [
          { ref: 'e1', from: 'start_1', to: 'llm_1' },
          { ref: 'e2', from: 'llm_1', to: 'http_1' },
          { ref: 'e3', from: 'http_1', to: 'conditional_1' },
          { ref: 'e4', from: 'conditional_1', to: 'end_1' },
        ],
        metadata: {},
      };

      const input = { blueprint: complexBlueprint };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const lintResult = result.result as {
          ok: boolean;
          issues: string[];
          summary: { nodeCount: number; edgeCount: number; types: Record<string, number> };
        };
        expect(lintResult.ok).toBe(true);
        expect(lintResult.issues).toHaveLength(0);
        expect(lintResult.summary.nodeCount).toBe(5);
        expect(lintResult.summary.edgeCount).toBe(4);
        expect(lintResult.summary.types.llm).toBe(1);
        expect(lintResult.summary.types.http_request).toBe(1);
        expect(lintResult.summary.types.conditional).toBe(1);
      }
    });

    it('should detect missing start node', async () => {
      const invalidBlueprint = {
        nodes: [{ ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} }],
        edges: [],
        metadata: {},
      };

      const input = { blueprint: invalidBlueprint };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const lintResult = result.result as { ok: boolean; issues: string[] };
        expect(lintResult.ok).toBe(false);
        expect(lintResult.issues).toContain('Missing start node');
      }
    });

    it('should detect missing end node', async () => {
      const invalidBlueprint = {
        nodes: [{ ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} }],
        edges: [],
        metadata: {},
      };

      const input = { blueprint: invalidBlueprint };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const lintResult = result.result as { ok: boolean; issues: string[] };
        expect(lintResult.ok).toBe(false);
        expect(lintResult.issues).toContain('Missing end node');
      }
    });

    it('should detect duplicate node refs', async () => {
      const invalidBlueprint = {
        nodes: [
          { ref: 'duplicate', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'duplicate', type: 'end', name: 'End', description: '', parameters: {} },
        ],
        edges: [{ ref: 'e1', from: 'duplicate', to: 'duplicate' }],
        metadata: {},
      };

      const input = { blueprint: invalidBlueprint };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const lintResult = result.result as { ok: boolean; issues: string[] };
        expect(lintResult.ok).toBe(false);
        expect(lintResult.issues.some((issue) => issue.includes('Duplicate node ref'))).toBe(true);
      }
    });

    it('should detect invalid node types', async () => {
      const invalidBlueprint = {
        nodes: [
          { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'invalid_1', type: 'invalid_type', name: 'Invalid', description: '', parameters: {} },
          { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
        ],
        edges: [
          { ref: 'e1', from: 'start_1', to: 'invalid_1' },
          { ref: 'e2', from: 'invalid_1', to: 'end_1' },
        ],
        metadata: {},
      };

      const input = { blueprint: invalidBlueprint };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const lintResult = result.result as { ok: boolean; issues: string[] };
        expect(lintResult.ok).toBe(false);
        expect(lintResult.issues.some((issue) => issue.includes('Unsupported node type'))).toBe(true);
      }
    });

    it('should detect edges referencing unknown nodes', async () => {
      const invalidBlueprint = {
        nodes: [
          { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
        ],
        edges: [
          { ref: 'e1', from: 'start_1', to: 'unknown_node' },
          { ref: 'e2', from: 'unknown_node', to: 'end_1' },
        ],
        metadata: {},
      };

      const input = { blueprint: invalidBlueprint };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const lintResult = result.result as { ok: boolean; issues: string[] };
        expect(lintResult.ok).toBe(false);
        expect(lintResult.issues.some((issue) => issue.includes('references unknown node'))).toBe(true);
      }
    });

    it('should detect missing node refs', async () => {
      const invalidBlueprint = {
        nodes: [
          { type: 'start', name: 'Start', description: '', parameters: {} }, // missing ref
          { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
        ],
        edges: [],
        metadata: {},
      };

      const input = { blueprint: invalidBlueprint };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const lintResult = result.result as { ok: boolean; issues: string[] };
        expect(lintResult.ok).toBe(false);
        expect(lintResult.issues.some((issue) => issue.includes('missing valid "ref"'))).toBe(true);
      }
    });

    it('should emit proper events during execution', async () => {
      const input = { blueprint: CommonToolTestData.VALID_BLUEPRINT };
      await testHelper.executeToolViaEngine(input);

      const events = testHelper.getEventLogs();
      expect(events.length).toBeGreaterThan(0);
    });

    it('should complete within reasonable time', async () => {
      const input = { blueprint: CommonToolTestData.VALID_BLUEPRINT };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      expect(result.duration).toBeLessThan(4000); // Should complete within 4 seconds
    });
  });

  describe('Error Handling', () => {
    it('should handle missing blueprint parameter', async () => {
      const input = {}; // Missing blueprint
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('blueprint');
    });

    it('should handle invalid blueprint structure (not object)', async () => {
      const input = { blueprint: 'invalid-blueprint' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('object with nodes');
    });

    it('should handle blueprint without nodes array', async () => {
      const input = { blueprint: { edges: [] } };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('nodes must be an array');
    });

    it('should handle blueprint without edges array', async () => {
      const input = { blueprint: { nodes: [] } };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('edges must be an array');
    });

    it('should handle null blueprint', async () => {
      const input = { blueprint: null };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('object with nodes');
    });

    it('should handle malformed nodes', async () => {
      const input = {
        blueprint: {
          nodes: [
            'invalid-node', // Not an object
            { ref: 'valid', type: 'start', name: 'Start', parameters: {} },
          ],
          edges: [],
        },
      };

      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const lintResult = result.result as { ok: boolean; issues: string[] };
        expect(lintResult.ok).toBe(false);
        expect(lintResult.issues.some((issue) => issue.includes('Node entry must be an object'))).toBe(true);
      }
    });
  });

  describe('All Validation Tests', () => {
    it('should pass comprehensive validation', () => {
      const validation = testHelper.runAllValidationTests();

      expect(validation.structureValid).toBe(true);
      expect(validation.parametersValid).toBe(true);
      expect(validation.blueprintValid).toBe(true);
      expect(validation.templateValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});
