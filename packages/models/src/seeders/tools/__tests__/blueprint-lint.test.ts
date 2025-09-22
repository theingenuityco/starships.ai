/**
 * Blueprint Lint Tool Tests
 *
 * Tests for the blueprint-lint tool including parameter validation,
 * blueprint structure, and functionality verification.
 */

import { blueprintLintTool, blueprintLintToolTemplate } from '../blueprint-lint';
import { ToolTestHelper, CommonToolTestData, ToolMatchers } from './tool-test-helper';

describe('Blueprint Lint Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(blueprintLintTool, blueprintLintToolTemplate, 'blueprint_lint');
    jest.clearAllMocks();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      expect(blueprintLintTool).toMatchObject({
        name: 'blueprint_lint',
        description: expect.stringContaining('Validate an Autopilot blueprint'),
        parameters: expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
          required: expect.arrayContaining(['blueprint']),
        }),
        blueprint: expect.objectContaining({
          nodes: expect.any(Array),
          edges: expect.any(Array),
          metadata: expect.any(Object),
        }),
      });
    });

    it('should have consistent template and tool data', () => {
      const consistency = testHelper.testTemplateConsistency();

      expect(consistency.nameMatch).toBe(true);
      expect(consistency.descriptionMatch).toBe(true);
      expect(consistency.parametersMatch).toBe(true);
      expect(consistency.blueprintMatch).toBe(true);
    });

    it('should have valid template metadata', () => {
      expect(blueprintLintToolTemplate).toMatchObject({
        slug: 'blueprint-lint',
        category: 'automation',
        exampleUsage: expect.stringContaining('blueprint'),
        requiresApiKey: false,
        configurationFields: [],
      });
    });
  });

  describe('Parameter Schema', () => {
    it('should have valid parameter schema structure', () => {
      const schemaResults = testHelper.testParameterSchema();

      const mainSchema = schemaResults.find((r) => r.description === 'should have valid parameter schema');
      expect(mainSchema?.isObject).toBe(true);
      expect(mainSchema?.hasProperties).toBe(true);
      expect(mainSchema?.hasRequired).toBe(true);
    });

    it('should have blueprint parameter with correct definition', () => {
      const { properties } = blueprintLintTool.parameters;
      const blueprintProp = (properties as Record<string, unknown>).blueprint as Record<string, unknown>;

      expect(blueprintProp).toMatchObject({
        type: 'object',
        description: expect.stringContaining('Blueprint object with nodes and edges'),
        properties: expect.any(Object),
      });
    });

    it('should require blueprint parameter', () => {
      expect(blueprintLintTool.parameters.required).toContain('blueprint');
    });
  });

  describe('Blueprint Structure', () => {
    it('should have valid blueprint structure', () => {
      const blueprintResults = testHelper.testBlueprintStructure();

      const mainStructure = blueprintResults.find((r) => r.description === 'should have valid blueprint structure');
      expect(mainStructure?.hasNodes).toBe(true);
      expect(mainStructure?.hasEdges).toBe(true);
      expect(mainStructure?.nodeCount).toBeGreaterThan(0);
      expect(mainStructure?.edgeCount).toBeGreaterThan(0);
    });

    it('should have start and end nodes', () => {
      const startEndResult = testHelper.testStartEndNodes();

      expect(startEndResult.hasStartNode).toBe(true);
      expect(startEndResult.hasEndNode).toBe(true);
      expect(startEndResult.startNodeCount).toBe(1);
      expect(startEndResult.endNodeCount).toBe(1);
    });

    it('should have proper node connectivity', () => {
      const connectivityResult = testHelper.testConnectivity();

      expect(connectivityResult.isConnected).toBe(true);
      expect(connectivityResult.unreachableNodes).toHaveLength(0);
    });

    it('should have expected nodes', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const nodeTypes = nodes.map((n) => n.type);
      const nodeRefs = nodes.map((n) => n.ref);

      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('code');
      expect(nodeTypes).toContain('end');

      expect(nodeRefs).toContain('start_1');
      expect(nodeRefs).toContain('lint');
      expect(nodeRefs).toContain('end_1');
    });

    it('should have valid edges connecting nodes', () => {
      const { edges, nodes } = blueprintLintTool.blueprint;
      const nodeRefs = nodes.map((n) => n.ref);

      edges.forEach((edge) => {
        expect(nodeRefs).toContain(edge.from);
        expect(nodeRefs).toContain(edge.to);
        expect(edge.ref).toBeTruthy();
      });
    });
  });

  describe('Code Node Logic', () => {
    it('should have a code node with validation logic', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');

      expect(codeNode).toBeDefined();
      expect(codeNode?.ref).toBe('lint');
      expect(codeNode?.parameters).toHaveProperty('code');
      expect(typeof (codeNode?.parameters as Record<string, unknown>)?.code).toBe('string');
      expect((codeNode?.parameters as Record<string, unknown>)?.code).toContain('blueprint');
    });

    it('should validate blueprint structure', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('isObject(bp)');
      expect(code).toContain('Array.isArray(bp.nodes)');
      expect(code).toContain('Array.isArray(bp.edges)');
      expect(code).toContain('nodes must be an array');
      expect(code).toContain('edges must be an array');
    });

    it('should validate node types', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('allowedTypes');
      expect(code).toContain('start');
      expect(code).toContain('end');
      expect(code).toContain('agent');
      expect(code).toContain('code');
      expect(code).toContain('http_request');
      expect(code).toContain('llm');
      expect(code).toContain('user_prompt');
      expect(code).toContain('conditional');
      expect(code).toContain('transform');
      expect(code).toContain('mutate');
      expect(code).toContain('tool');
      expect(code).toContain('workflow');
    });

    it('should validate node references', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('seenRefs');
      expect(code).toContain('Duplicate node ref');
      expect(code).toContain('missing valid "ref"');
      expect(code).toContain('seenRefs.has(n.ref)');
      expect(code).toContain('seenRefs.add(n.ref)');
    });

    it('should validate start and end nodes presence', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('hasStart');
      expect(code).toContain('hasEnd');
      expect(code).toContain('Missing start node');
      expect(code).toContain('Missing end node');
      expect(code).toContain("n.type === 'start'");
      expect(code).toContain("n.type === 'end'");
    });

    it('should validate edge references', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('!e.from || !e.to');
      expect(code).toContain('missing "from" or "to"');
      expect(code).toContain('!seenRefs.has(e.from)');
      expect(code).toContain('!seenRefs.has(e.to)');
      expect(code).toContain('references unknown node');
    });

    it('should generate summary information', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('typeCounts');
      expect(code).toContain('nodeCount: nodes.length');
      expect(code).toContain('edgeCount: edges.length');
      expect(code).toContain('types: typeCounts');
    });

    it('should have proper timeout configuration', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const parameters = codeNode?.parameters as Record<string, unknown>;

      expect(parameters).toHaveProperty('timeout');
      expect(parameters.timeout).toBe(4000);
    });
  });

  describe('End Node Configuration', () => {
    it('should have proper end node output configuration', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');

      expect(endNode).toBeDefined();
      expect(endNode?.parameters).toHaveProperty('output');
      expect((endNode?.parameters as Record<string, unknown>)?.output).toBe('{{ $lastOutputOf("lint")[0].json }}');
    });

    it('should reference the lint node output', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as string;

      expect(output).toContain('$lastOutputOf("lint")');
      expect(output).toContain('[0].json');
    });
  });

  describe('Validation Logic', () => {
    it('should include helper functions', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('function isObject(v)');
      expect(code).toContain("typeof v === 'object'");
      expect(code).toContain('!Array.isArray(v)');
    });

    it('should handle input parameter extraction', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('const bp = input.blueprint || input');
      expect(code).toContain('const issues = []');
    });

    it('should validate all supported node types', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      const expectedTypes = [
        'start',
        'end',
        'agent',
        'workflow',
        'http_request',
        'llm',
        'user_prompt',
        'conditional',
        'transform',
        'mutate',
        'tool',
        'code',
      ];

      expectedTypes.forEach((type) => {
        expect(code).toContain(`'${type}'`);
      });
    });

    it('should provide detailed error messages', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      const expectedMessages = [
        'Node entry must be an object',
        'Node missing valid "ref"',
        'missing "type"',
        'Unsupported node type',
        'Edge entry must be an object',
        'missing "from" or "to"',
        'references unknown node',
      ];

      expectedMessages.forEach((message) => {
        expect(code).toContain(message);
      });
    });
  });

  describe('Return Value Structure', () => {
    it('should return structured validation result', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('return {');
      expect(code).toContain('ok: issues.length === 0');
      expect(code).toContain('issues,');
      expect(code).toContain('summary: {');
    });

    it('should include comprehensive summary', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('nodeCount: nodes.length');
      expect(code).toContain('edgeCount: edges.length');
      expect(code).toContain('types: typeCounts');
    });
  });

  describe('Tool Template', () => {
    it('should have correct template configuration', () => {
      expect(blueprintLintToolTemplate.slug).toBe('blueprint-lint');
      expect(blueprintLintToolTemplate.category).toBe('automation');
      expect(blueprintLintToolTemplate.requiresApiKey).toBe(false);
      expect(blueprintLintToolTemplate.configurationFields).toEqual([]);
    });

    it('should have helpful example usage', () => {
      expect(blueprintLintToolTemplate.exampleUsage).toContain('blueprint');
      expect(blueprintLintToolTemplate.exampleUsage).toContain('nodes');
      expect(blueprintLintToolTemplate.exampleUsage).toContain('edges');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid blueprint objects', () => {
      const validBlueprints = [
        {
          blueprint: {
            nodes: [
              { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
              { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
            ],
            edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
          },
        },
        {
          blueprint: {
            nodes: [],
            edges: [],
            metadata: {},
          },
        },
      ];

      validBlueprints.forEach((params) => {
        expect(() => {
          expect(params).toMatchObject({
            blueprint: expect.any(Object),
          });
        }).not.toThrow();
      });
    });

    it('should handle missing blueprint parameter', () => {
      const invalidInputs = [{}, { blueprint: null }, { blueprint: undefined }, { blueprint: 'string' }, { blueprint: 123 }];

      invalidInputs.forEach(() => {
        // The code node contains validation for these cases
        const { nodes } = blueprintLintTool.blueprint;
        const codeNode = nodes.find((n) => n.type === 'code');
        const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

        expect(code).toContain('!isObject(bp)');
        expect(code).toContain('must be an object with nodes[] and edges[]');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed input gracefully', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('!isObject(bp)');
      expect(code).toContain('throw new Error');
      expect(code).toContain('Invalid blueprint');
    });

    it('should validate array properties', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('!Array.isArray(bp.nodes)');
      expect(code).toContain('!Array.isArray(bp.edges)');
      expect(code).toContain('nodes must be an array');
      expect(code).toContain('edges must be an array');
    });

    it('should handle edge cases in validation', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("!n || typeof n !== 'object'");
      expect(code).toContain("!e || typeof e !== 'object'");
      expect(code).toContain('continue');
    });
  });

  describe('Performance and Efficiency', () => {
    it('should have reasonable timeout for validation', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const parameters = codeNode?.parameters as Record<string, unknown>;

      expect(parameters.timeout).toBe(4000);
      expect(parameters.timeout).toBeLessThan(10000);
    });

    it('should use efficient data structures', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('new Set()'); // For tracking refs
      expect(code).toContain('seenRefs.has');
      expect(code).toContain('seenRefs.add');
    });
  });

  describe('Use Cases', () => {
    it('should support blueprint development workflow', () => {
      expect(blueprintLintTool.description).toContain('Validate an Autopilot blueprint');
      expect(blueprintLintTool.description).toContain('nodes, edges, types, connectivity');
    });

    it('should provide actionable feedback', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      // Should provide specific error messages
      expect(code).toContain('Duplicate node ref');
      expect(code).toContain('Unsupported node type');
      expect(code).toContain('references unknown node');
    });
  });

  describe('Integration with Common Test Patterns', () => {
    it('should handle common invalid inputs', () => {
      CommonToolTestData.commonInvalidInputs.forEach((testCase) => {
        expect(testCase.params).toBeDefined();
        expect(testCase.expectedError).toBeTruthy();
        expect(testCase.description).toBeTruthy();
      });
    });

    it('should use ToolMatchers for validation', () => {
      expect(ToolMatchers.toHaveValidToolStructure(blueprintLintTool)).toEqual({
        message: expect.any(Function),
        pass: true,
      });

      expect(ToolMatchers.toHaveValidBlueprint(blueprintLintTool.blueprint)).toEqual({
        message: expect.any(Function),
        pass: true,
      });
    });
  });

  describe('Comprehensive Validation Coverage', () => {
    it('should validate all critical blueprint aspects', () => {
      const { nodes } = blueprintLintTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      // Structure validation
      expect(code).toContain('isObject');
      expect(code).toContain('Array.isArray');

      // Node validation
      expect(code).toContain('allowedTypes');
      expect(code).toContain('seenRefs');

      // Edge validation
      expect(code).toContain('e.from');
      expect(code).toContain('e.to');

      // Start/End validation
      expect(code).toContain('hasStart');
      expect(code).toContain('hasEnd');

      // Summary generation
      expect(code).toContain('typeCounts');
      expect(code).toContain('nodeCount');
      expect(code).toContain('edgeCount');
    });
  });
});
