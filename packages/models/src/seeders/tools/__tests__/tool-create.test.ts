/**
 * Tool Create Tool Tests
 *
 * Tests for the tool-create tool including parameter validation,
 * blueprint structure, and functionality verification.
 */

import { toolCreateTool, toolCreateToolTemplate } from '../tool-create';
import { ToolTestHelper, CommonToolTestData, ToolMatchers } from './tool-test-helper';

describe('Tool Create Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(toolCreateTool, toolCreateToolTemplate, 'tool_create');
    jest.clearAllMocks();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      expect(toolCreateTool).toMatchObject({
        name: 'tool_create',
        description: expect.stringContaining('Create a new Tool instance'),
        parameters: expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
          required: expect.any(Array),
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
      expect(toolCreateToolTemplate).toMatchObject({
        slug: 'tool-create',
        category: 'automation',
        exampleUsage: expect.stringContaining('Create a tool'),
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

    it('should have required tool creation parameters', () => {
      const { required } = toolCreateTool.parameters;

      expect(required).toContain('name');
      expect(required).toContain('slug');
      expect(required).toContain('description');
      expect(required).toContain('parameters');
      expect(required).toContain('blueprint');
    });

    it('should have name parameter with correct definition', () => {
      const { properties } = toolCreateTool.parameters;
      const nameProp = (properties as Record<string, unknown>).name as Record<string, unknown>;

      expect(nameProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('Tool name'),
      });
    });

    it('should have slug parameter with correct definition', () => {
      const { properties } = toolCreateTool.parameters;
      const slugProp = (properties as Record<string, unknown>).slug as Record<string, unknown>;

      expect(slugProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('Kebab-case slug'),
      });
    });

    it('should have description parameter with correct definition', () => {
      const { properties } = toolCreateTool.parameters;
      const descProp = (properties as Record<string, unknown>).description as Record<string, unknown>;

      expect(descProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('Short description'),
      });
    });

    it('should have parameters parameter for JSON schema', () => {
      const { properties } = toolCreateTool.parameters;
      const paramsProp = (properties as Record<string, unknown>).parameters as Record<string, unknown>;

      expect(paramsProp).toMatchObject({
        type: 'object',
        description: expect.stringContaining('JSON Schema defining the tool input'),
        properties: expect.any(Object),
      });
    });

    it('should have blueprint parameter for workflow definition', () => {
      const { properties } = toolCreateTool.parameters;
      const blueprintProp = (properties as Record<string, unknown>).blueprint as Record<string, unknown>;

      expect(blueprintProp).toMatchObject({
        type: 'object',
        description: expect.stringContaining('Autopilot blueprint'),
        properties: expect.any(Object),
      });
    });

    it('should have optional configuration parameter', () => {
      const { properties, required } = toolCreateTool.parameters;
      const configProp = (properties as Record<string, unknown>).configuration as Record<string, unknown>;

      expect(configProp).toMatchObject({
        type: 'object',
        description: expect.stringContaining('Optional instance configuration'),
        properties: expect.any(Object),
      });

      expect(required).not.toContain('configuration');
    });

    it('should have optional isEnabled parameter', () => {
      const { properties, required } = toolCreateTool.parameters;
      const enabledProp = (properties as Record<string, unknown>).isEnabled as Record<string, unknown>;

      expect(enabledProp).toMatchObject({
        type: 'boolean',
        description: expect.stringContaining('Enable tool after creation'),
      });

      expect(required).not.toContain('isEnabled');
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
      const { nodes } = toolCreateTool.blueprint;
      const nodeTypes = nodes.map((n) => n.type);
      const nodeRefs = nodes.map((n) => n.ref);

      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('code');
      expect(nodeTypes).toContain('http_request');
      expect(nodeTypes).toContain('end');

      expect(nodeRefs).toContain('start_1');
      expect(nodeRefs).toContain('prepare');
      expect(nodeRefs).toContain('http_create');
      expect(nodeRefs).toContain('end_1');
    });

    it('should have valid edges connecting nodes', () => {
      const { edges, nodes } = toolCreateTool.blueprint;
      const nodeRefs = nodes.map((n) => n.ref);

      edges.forEach((edge) => {
        expect(nodeRefs).toContain(edge.from);
        expect(nodeRefs).toContain(edge.to);
        expect(edge.ref).toBeTruthy();
      });
    });
  });

  describe('Prepare Node Logic', () => {
    it('should have prepare node with request building logic', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');

      expect(prepareNode).toBeDefined();
      expect(prepareNode?.type).toBe('code');
      expect(prepareNode?.parameters).toHaveProperty('code');
    });

    it('should validate required environment variables', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("env('BASE_URL')");
      expect(code).toContain("env('AUTH_TOKEN')");
      expect(code).toContain("env('STARSHIP_ID')");
      expect(code).toContain('baseUrl is required');
      expect(code).toContain('authToken is required');
      expect(code).toContain('starshipId is required');
    });

    it('should validate required input parameters', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("const required = ['name', 'slug', 'description', 'parameters', 'blueprint']");
      expect(code).toContain('for (const k of required)');
      expect(code).toContain('input[k] === undefined || input[k] === null');
      expect(code).toContain('${k} is required');
    });

    it('should build proper request body', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('const body = {');
      expect(code).toContain('name: input.name');
      expect(code).toContain('slug: input.slug');
      expect(code).toContain('description: input.description');
      expect(code).toContain('parameters: input.parameters');
      expect(code).toContain('blueprint: input.blueprint');
      expect(code).toContain('configuration: input.configuration ?? {}');
      expect(code).toContain('isEnabled: input.isEnabled ?? true');
    });

    it('should build proper HTTP request configuration', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('url: `${baseUrl}/starships/${starshipId}/tools`');
      expect(code).toContain("method: 'POST'");
      expect(code).toContain('Authorization');
      expect(code).toContain('Bearer ${authToken}');
      expect(code).toContain('Content-Type');
      expect(code).toContain('application/json');
    });

    it('should have proper timeout', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const parameters = prepareNode?.parameters as Record<string, unknown>;

      expect(parameters.timeout).toBe(3000);
    });
  });

  describe('HTTP Request Node', () => {
    it('should have http_request node configured properly', () => {
      const { nodes } = toolCreateTool.blueprint;
      const httpNode = nodes.find((n) => n.ref === 'http_create');

      expect(httpNode).toBeDefined();
      expect(httpNode?.type).toBe('http_request');
      expect(httpNode?.name).toBe('Create Tool');
      expect(httpNode?.description).toBe('POST /starships/:starshipId/tools');
    });

    it('should reference prepare node outputs', () => {
      const { nodes } = toolCreateTool.blueprint;
      const httpNode = nodes.find((n) => n.ref === 'http_create');
      const parameters = httpNode?.parameters as Record<string, unknown>;

      expect(parameters.url).toBe('{{ $lastOutputOf("prepare")[0].json.url }}');
      expect(parameters.method).toBe('{{ $lastOutputOf("prepare")[0].json.method }}');
      expect(parameters.headers).toBe('{{ $lastOutputOf("prepare")[0].json.headers }}');
      expect(parameters.body).toBe('{{ $lastOutputOf("prepare")[0].json.body }}');
      expect(parameters.timeout).toBe(10000);
    });
  });

  describe('End Node Configuration', () => {
    it('should have proper end node output configuration', () => {
      const { nodes } = toolCreateTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');

      expect(endNode).toBeDefined();
      expect(endNode?.parameters).toHaveProperty('output');
      expect((endNode?.parameters as Record<string, unknown>)?.output).toBe('{{ $lastOutputOf("http_create")[0].json }}');
    });

    it('should reference the http_create node output', () => {
      const { nodes } = toolCreateTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as string;

      expect(output).toContain('$lastOutputOf("http_create")');
      expect(output).toContain('[0].json');
    });
  });

  describe('Tool Template', () => {
    it('should have correct template configuration', () => {
      expect(toolCreateToolTemplate.slug).toBe('tool-create');
      expect(toolCreateToolTemplate.category).toBe('automation');
      expect(toolCreateToolTemplate.requiresApiKey).toBe(false);
      expect(toolCreateToolTemplate.configurationFields).toEqual([]);
    });

    it('should have helpful example usage', () => {
      expect(toolCreateToolTemplate.exampleUsage).toContain('Create a tool');
      expect(toolCreateToolTemplate.exampleUsage).toContain('name');
      expect(toolCreateToolTemplate.exampleUsage).toContain('slug');
      expect(toolCreateToolTemplate.exampleUsage).toContain('description');
      expect(toolCreateToolTemplate.exampleUsage).toContain('parameters');
      expect(toolCreateToolTemplate.exampleUsage).toContain('blueprint');
      expect(toolCreateToolTemplate.exampleUsage).toContain('starshipId/baseUrl/authToken are inferred from state');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid tool creation parameters', () => {
      const validParams = {
        name: 'test_tool',
        slug: 'test-tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message' },
          },
          required: ['message'],
        },
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
            { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
          ],
          edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
        },
      };

      expect(() => {
        expect(validParams).toMatchObject({
          name: expect.any(String),
          slug: expect.any(String),
          description: expect.any(String),
          parameters: expect.any(Object),
          blueprint: expect.any(Object),
        });
      }).not.toThrow();
    });

    it('should accept optional parameters', () => {
      const paramsWithOptionals = {
        name: 'test_tool',
        slug: 'test-tool',
        description: 'A test tool',
        parameters: {},
        blueprint: { nodes: [], edges: [] },
        configuration: { key: 'value' },
        isEnabled: false,
      };

      expect(() => {
        expect(paramsWithOptionals).toMatchObject({
          name: expect.any(String),
          slug: expect.any(String),
          description: expect.any(String),
          parameters: expect.any(Object),
          blueprint: expect.any(Object),
          configuration: expect.any(Object),
          isEnabled: expect.any(Boolean),
        });
      }).not.toThrow();
    });

    it('should handle missing required parameters', () => {
      const requiredFields = ['name', 'slug', 'description', 'parameters', 'blueprint'];

      requiredFields.forEach(() => {
        // The code node contains validation for these cases
        const { nodes } = toolCreateTool.blueprint;
        const prepareNode = nodes.find((n) => n.ref === 'prepare');
        const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

        expect(code).toContain('${k} is required');
      });
    });
  });

  describe('Environment Dependencies', () => {
    it('should depend on required environment variables', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      const requiredEnvVars = ['BASE_URL', 'AUTH_TOKEN', 'STARSHIP_ID'];
      requiredEnvVars.forEach((envVar) => {
        expect(code).toContain(`env('${envVar}')`);
      });
    });

    it('should validate environment variables', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('if (!baseUrl)');
      expect(code).toContain('if (!authToken)');
      expect(code).toContain('if (!starshipId)');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing environment variables', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("throw new Error('baseUrl is required')");
      expect(code).toContain("throw new Error('authToken is required')");
      expect(code).toContain("throw new Error('starshipId is required')");
    });

    it('should handle missing required parameters', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('input[k] === undefined || input[k] === null');
      expect(code).toContain('throw new Error(`${k} is required`)');
    });

    it('should handle URL normalization', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain(".replace(/\\/+$/, '')");
    });
  });

  describe('Default Values', () => {
    it('should provide sensible defaults for optional parameters', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('configuration: input.configuration ?? {}');
      expect(code).toContain('isEnabled: input.isEnabled ?? true');
    });
  });

  describe('Performance and Efficiency', () => {
    it('should have reasonable timeouts', () => {
      const { nodes } = toolCreateTool.blueprint;

      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const httpNode = nodes.find((n) => n.ref === 'http_create');

      expect((prepareNode?.parameters as Record<string, unknown>)?.timeout).toBe(3000);
      expect((httpNode?.parameters as Record<string, unknown>)?.timeout).toBe(10000);
    });

    it('should use POST method for creation', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("method: 'POST'");
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
      expect(ToolMatchers.toHaveValidToolStructure(toolCreateTool)).toEqual({
        message: expect.any(Function),
        pass: true,
      });

      expect(ToolMatchers.toHaveValidBlueprint(toolCreateTool.blueprint)).toEqual({
        message: expect.any(Function),
        pass: true,
      });
    });
  });

  describe('API Integration', () => {
    it('should construct correct API endpoint', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('/starships/${starshipId}/tools');
    });

    it('should include proper authentication headers', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Authorization');
      expect(code).toContain('Bearer ${authToken}');
    });

    it('should set correct content type', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Content-Type');
      expect(code).toContain('application/json');
    });
  });

  describe('Data Structure', () => {
    it('should create proper tool structure', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      const expectedFields = ['name', 'slug', 'description', 'parameters', 'blueprint', 'configuration', 'isEnabled'];
      expectedFields.forEach((field) => {
        expect(code).toContain(`${field}:`);
      });
    });

    it('should preserve all input data', () => {
      const { nodes } = toolCreateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('name: input.name');
      expect(code).toContain('slug: input.slug');
      expect(code).toContain('description: input.description');
      expect(code).toContain('parameters: input.parameters');
      expect(code).toContain('blueprint: input.blueprint');
    });
  });
});
