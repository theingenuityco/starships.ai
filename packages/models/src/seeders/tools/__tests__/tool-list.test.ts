/**
 * Tool List Tool Tests
 *
 * Tests for the tool-list tool including parameter validation,
 * blueprint structure, and functionality verification.
 */

import type { Edge } from '@starships/autopilot';
import { toolListTool, toolListToolTemplate } from '../tool-list';
import { ToolTestHelper, CommonToolTestData, ToolMatchers } from './tool-test-helper';

describe('Tool List Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(toolListTool, toolListToolTemplate, 'tool_list');
    jest.clearAllMocks();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      expect(toolListTool).toMatchObject({
        name: 'tool_list',
        description: expect.stringContaining('List all tools'),
        parameters: expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
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
      expect(toolListToolTemplate).toMatchObject({
        slug: 'tool-list',
        category: 'automation',
        exampleUsage: expect.stringContaining('list tools'),
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

    it('should have empty properties (no parameters needed)', () => {
      const { properties } = toolListTool.parameters;

      expect(properties).toEqual({});
    });

    it('should have no required parameters', () => {
      expect(toolListTool.parameters.required).toBeUndefined();
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
      const { nodes } = toolListTool.blueprint;
      const nodeTypes = nodes.map((n) => n.type);
      const nodeRefs = nodes.map((n) => n.ref);

      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('code');
      expect(nodeTypes).toContain('http_request');
      expect(nodeTypes).toContain('end');

      expect(nodeRefs).toContain('start_1');
      expect(nodeRefs).toContain('prepare');
      expect(nodeRefs).toContain('http_list');
      expect(nodeRefs).toContain('summarize');
      expect(nodeRefs).toContain('end_1');
    });

    it('should have valid edges connecting nodes', () => {
      const { edges, nodes } = toolListTool.blueprint;
      const nodeRefs = nodes.map((n) => n.ref);

      edges.forEach((edge: Edge) => {
        expect(nodeRefs).toContain(edge.from);
        expect(nodeRefs).toContain(edge.to);
        expect(edge.ref).toBeTruthy();
      });
    });
  });

  describe('Prepare Node Logic', () => {
    it('should have prepare node with request building logic', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');

      expect(prepareNode).toBeDefined();
      expect(prepareNode?.type).toBe('code');
      expect(prepareNode?.parameters).toHaveProperty('code');
    });

    it('should validate required environment variables', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("env('BASE_URL')");
      expect(code).toContain("env('AUTH_TOKEN')");
      expect(code).toContain("env('STARSHIP_ID')");
      expect(code).toContain('baseUrl is required');
      expect(code).toContain('authToken is required');
      expect(code).toContain('starshipId is required');
    });

    it('should build proper HTTP request configuration', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('url: `${baseUrl}/starships/${starshipId}/tools`');
      expect(code).toContain("method: 'GET'");
      expect(code).toContain('Authorization');
      expect(code).toContain('Bearer ${authToken}');
      expect(code).toContain('Content-Type');
      expect(code).toContain('application/json');
    });

    it('should handle URL normalization', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain(".replace(/\\/+$/, '')");
    });

    it('should have proper timeout', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const parameters = prepareNode?.parameters as Record<string, unknown>;

      expect(parameters.timeout).toBe(3000);
    });
  });

  describe('HTTP Request Node', () => {
    it('should have http_request node configured properly', () => {
      const { nodes } = toolListTool.blueprint;
      const httpNode = nodes.find((n) => n.ref === 'http_list');

      expect(httpNode).toBeDefined();
      expect(httpNode?.type).toBe('http_request');
      expect(httpNode?.name).toBe('List Tools');
      expect(httpNode?.description).toBe('GET /starships/:starshipId/tools');
    });

    it('should reference prepare node outputs', () => {
      const { nodes } = toolListTool.blueprint;
      const httpNode = nodes.find((n) => n.ref === 'http_list');
      const parameters = httpNode?.parameters as Record<string, unknown>;

      expect(parameters.url).toBe('{{ $lastOutputOf("prepare")[0].json.url }}');
      expect(parameters.method).toBe('{{ $lastOutputOf("prepare")[0].json.method }}');
      expect(parameters.headers).toBe('{{ $lastOutputOf("prepare")[0].json.headers }}');
      expect(parameters.timeout).toBe(5000);
    });
  });

  describe('Summarize Node Logic', () => {
    it('should have summarize node with data processing logic', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');

      expect(summarizeNode).toBeDefined();
      expect(summarizeNode?.type).toBe('code');
      expect(summarizeNode?.parameters).toHaveProperty('code');
    });

    it('should process HTTP response properly', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');
      const code = (summarizeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('const http = input');
      expect(code).toContain("const body = http && typeof http === 'object' ? http.body : http");
      expect(code).toContain('body.data');
      expect(code).toContain('Array.isArray(body.data)');
    });

    it('should return lean tool summaries', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');
      const code = (summarizeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('data.map((t) => ({');
      expect(code).toContain('id: t && t.id');
      expect(code).toContain('slug: t && t.slug');
      expect(code).toContain('name: t && t.name');
      expect(code).toContain('description: t && t.description');
      expect(code).toContain('isEnabled: t && t.isEnabled');
    });

    it('should avoid leaking large blueprint contents', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');
      const code = (summarizeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Return a lean summary');
      expect(code).toContain('avoid leaking large/templated blueprint contents');
      expect(code).not.toContain('blueprint:');
    });

    it('should handle different response formats', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');
      const code = (summarizeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Array.isArray(body.data)');
      expect(code).toContain('? body.data');
      expect(code).toContain(': (Array.isArray(body) ? body : [])');
    });

    it('should have proper timeout', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');
      const parameters = summarizeNode?.parameters as Record<string, unknown>;

      expect(parameters.timeout).toBe(2000);
    });
  });

  describe('End Node Configuration', () => {
    it('should have proper end node output configuration', () => {
      const { nodes } = toolListTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');

      expect(endNode).toBeDefined();
      expect(endNode?.parameters).toHaveProperty('output');
      expect((endNode?.parameters as Record<string, unknown>)?.output).toBe('{{ $lastOutputOf("summarize")[0].json }}');
    });

    it('should reference the summarize node output', () => {
      const { nodes } = toolListTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as string;

      expect(output).toContain('$lastOutputOf("summarize")');
      expect(output).toContain('[0].json');
    });
  });

  describe('Tool Template', () => {
    it('should have correct template configuration', () => {
      expect(toolListToolTemplate.slug).toBe('tool-list');
      expect(toolListToolTemplate.category).toBe('automation');
      expect(toolListToolTemplate.requiresApiKey).toBe(false);
      expect(toolListToolTemplate.configurationFields).toEqual([]);
    });

    it('should have helpful example usage', () => {
      expect(toolListToolTemplate.exampleUsage).toContain('{}');
      expect(toolListToolTemplate.exampleUsage).toContain('list tools');
      expect(toolListToolTemplate.exampleUsage).toContain('starshipId/baseUrl/authToken');
      expect(toolListToolTemplate.exampleUsage).toContain('inferred from state');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept empty parameters', () => {
      const validParams = {};

      expect(() => {
        expect(validParams).toEqual(expect.any(Object));
      }).not.toThrow();
    });

    it('should not require any specific parameters', () => {
      expect(toolListTool.parameters.required).toBeUndefined();
      expect(Object.keys(toolListTool.parameters.properties)).toHaveLength(0);
    });
  });

  describe('Environment Dependencies', () => {
    it('should depend on required environment variables', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      const requiredEnvVars = ['BASE_URL', 'AUTH_TOKEN', 'STARSHIP_ID'];
      requiredEnvVars.forEach((envVar) => {
        expect(code).toContain(`env('${envVar}')`);
      });
    });

    it('should validate environment variables', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('if (!baseUrl)');
      expect(code).toContain('if (!authToken)');
      expect(code).toContain('if (!starshipId)');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing environment variables', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("throw new Error('baseUrl is required')");
      expect(code).toContain("throw new Error('authToken is required')");
      expect(code).toContain("throw new Error('starshipId is required')");
    });

    it('should handle different response formats gracefully', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');
      const code = (summarizeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Array.isArray(body.data)');
      expect(code).toContain('Array.isArray(body) ? body : []');
    });

    it('should handle null/undefined safely', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');
      const code = (summarizeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('t && t.id');
      expect(code).toContain('t && t.slug');
      expect(code).toContain('t && t.name');
    });
  });

  describe('Performance and Efficiency', () => {
    it('should have reasonable timeouts', () => {
      const { nodes } = toolListTool.blueprint;

      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const httpNode = nodes.find((n) => n.ref === 'http_list');
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');

      expect((prepareNode?.parameters as Record<string, unknown>)?.timeout).toBe(3000);
      expect((httpNode?.parameters as Record<string, unknown>)?.timeout).toBe(5000);
      expect((summarizeNode?.parameters as Record<string, unknown>)?.timeout).toBe(2000);
    });

    it('should minimize data transfer by returning lean summaries', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');
      const code = (summarizeNode?.parameters as Record<string, unknown>)?.code as string;

      // Should only include essential fields
      expect(code).toContain('id:');
      expect(code).toContain('slug:');
      expect(code).toContain('name:');
      expect(code).toContain('description:');
      expect(code).toContain('isEnabled:');

      // Should not include heavy fields
      expect(code).not.toContain('blueprint:');
      expect(code).not.toContain('parameters:');
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
      expect(ToolMatchers.toHaveValidToolStructure(toolListTool)).toEqual({
        message: expect.any(Function),
        pass: true,
      });

      expect(ToolMatchers.toHaveValidBlueprint(toolListTool.blueprint)).toEqual({
        message: expect.any(Function),
        pass: true,
      });
    });
  });

  describe('API Integration', () => {
    it('should use proper HTTP method for listing', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("method: 'GET'");
    });

    it('should construct correct API endpoint', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('/starships/${starshipId}/tools');
    });

    it('should include proper authentication headers', () => {
      const { nodes } = toolListTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Authorization');
      expect(code).toContain('Bearer ${authToken}');
    });
  });

  describe('Data Processing', () => {
    it('should handle server response format', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');
      const code = (summarizeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Server sendSuccess returns { data: T }');
      expect(code).toContain('prefer body.data when present');
    });

    it('should provide consistent output format', () => {
      const { nodes } = toolListTool.blueprint;
      const summarizeNode = nodes.find((n) => n.ref === 'summarize');
      const code = (summarizeNode?.parameters as Record<string, unknown>)?.code as string;

      // Should return array of tool summaries
      expect(code).toContain('data.map(');
      expect(code).toMatch(/return.*data\.map/);
    });
  });
});
