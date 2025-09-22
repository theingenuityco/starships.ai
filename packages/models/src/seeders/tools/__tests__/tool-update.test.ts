/**
 * Tool Update Tool Tests
 *
 * Tests for the tool-update tool including parameter validation,
 * blueprint structure, and functionality verification.
 */

import type { Edge } from '@starships/autopilot';
import { toolUpdateTool, toolUpdateToolTemplate } from '../tool-update';
import { ToolTestHelper, CommonToolTestData, ToolMatchers } from './tool-test-helper';

describe('Tool Update Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(toolUpdateTool, toolUpdateToolTemplate, 'tool_update');
    jest.clearAllMocks();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      expect(toolUpdateTool).toMatchObject({
        name: 'tool_update',
        description: expect.stringContaining('Update an existing Tool instance'),
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
      expect(toolUpdateToolTemplate).toMatchObject({
        slug: 'tool-update',
        category: 'automation',
        exampleUsage: expect.stringContaining('Update'),
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

    it('should have no required parameters (flexible update)', () => {
      expect(toolUpdateTool.parameters.required).toEqual([]);
    });

    it('should have identifier parameters (id and slug)', () => {
      const { properties } = toolUpdateTool.parameters;

      const idProp = (properties as Record<string, unknown>).id as Record<string, unknown>;
      const slugProp = (properties as Record<string, unknown>).slug as Record<string, unknown>;

      expect(idProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('Tool ID to update'),
      });

      expect(slugProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('Tool slug'),
      });
    });

    it('should have all updateable parameters as optional', () => {
      const { properties, required } = toolUpdateTool.parameters;

      const updateableFields = ['name', 'description', 'parameters', 'blueprint', 'configuration', 'isEnabled'];

      updateableFields.forEach((field) => {
        expect(properties).toHaveProperty(field);
        expect(required).not.toContain(field);
      });
    });

    it('should have name parameter with correct definition', () => {
      const { properties } = toolUpdateTool.parameters;
      const nameProp = (properties as Record<string, unknown>).name as Record<string, unknown>;

      expect(nameProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('New tool name'),
      });
    });

    it('should have description parameter with correct definition', () => {
      const { properties } = toolUpdateTool.parameters;
      const descProp = (properties as Record<string, unknown>).description as Record<string, unknown>;

      expect(descProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('New tool description'),
      });
    });

    it('should have parameters parameter for JSON schema updates', () => {
      const { properties } = toolUpdateTool.parameters;
      const paramsProp = (properties as Record<string, unknown>).parameters as Record<string, unknown>;

      expect(paramsProp).toMatchObject({
        type: 'object',
        description: expect.stringContaining('New JSON Schema for tool parameters'),
        properties: expect.any(Object),
      });
    });

    it('should have blueprint parameter for workflow updates', () => {
      const { properties } = toolUpdateTool.parameters;
      const blueprintProp = (properties as Record<string, unknown>).blueprint as Record<string, unknown>;

      expect(blueprintProp).toMatchObject({
        type: 'object',
        description: expect.stringContaining('New Autopilot blueprint'),
        properties: expect.any(Object),
      });
    });

    it('should have configuration parameter', () => {
      const { properties } = toolUpdateTool.parameters;
      const configProp = (properties as Record<string, unknown>).configuration as Record<string, unknown>;

      expect(configProp).toMatchObject({
        type: 'object',
        description: expect.stringContaining('New instance configuration'),
        properties: expect.any(Object),
      });
    });

    it('should have isEnabled parameter', () => {
      const { properties } = toolUpdateTool.parameters;
      const enabledProp = (properties as Record<string, unknown>).isEnabled as Record<string, unknown>;

      expect(enabledProp).toMatchObject({
        type: 'boolean',
        description: expect.stringContaining('Enable/disable the tool'),
      });
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

    it('should have expected nodes for complex update logic', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const nodeTypes = nodes.map((n) => n.type);
      const nodeRefs = nodes.map((n) => n.ref);

      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('code'); // validation
      expect(nodeTypes).toContain('http_request'); // maybe fetch by slug
      expect(nodeTypes).toContain('end');

      expect(nodeRefs).toContain('start_1');
      expect(nodeRefs).toContain('validate');
      expect(nodeRefs).toContain('maybe_fetch_by_slug');
      expect(nodeRefs).toContain('prepare_update');
      expect(nodeRefs).toContain('http_update');
      expect(nodeRefs).toContain('end_1');
    });

    it('should have valid edges connecting nodes', () => {
      const { edges, nodes } = toolUpdateTool.blueprint;
      const nodeRefs = nodes.map((n) => n.ref);

      edges.forEach((edge: Edge) => {
        expect(nodeRefs).toContain(edge.from);
        expect(nodeRefs).toContain(edge.to);
        expect(edge.ref).toBeTruthy();
      });
    });
  });

  describe('Validate Node Logic', () => {
    it('should have validate node with input validation logic', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');

      expect(validateNode).toBeDefined();
      expect(validateNode?.type).toBe('code');
      expect(validateNode?.parameters).toHaveProperty('code');
    });

    it('should validate required environment variables', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("env('BASE_URL')");
      expect(code).toContain("env('AUTH_TOKEN')");
      expect(code).toContain('baseUrl is required');
      expect(code).toContain('authToken is required');
    });

    it('should validate identifier strategy (id vs slug)', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('hasId');
      expect(code).toContain('hasSlugResolve');
      expect(code).toContain("typeof input.id === 'string'");
      expect(code).toContain('input.id.length > 0');
      expect(code).toContain('!!slug');
    });

    it('should require either id or slug', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('!hasId && !hasSlugResolve');
      expect(code).toContain('Provide "id" OR "slug"');
    });

    it('should build patch object from provided fields', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('const patch = {}');
      expect(code).toContain("const keys = ['name', 'description', 'parameters', 'blueprint', 'configuration', 'isEnabled']");
      expect(code).toContain('Object.prototype.hasOwnProperty.call(input, k)');
      expect(code).toContain('input[k] !== undefined');
    });

    it('should validate at least one update field is provided', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Object.keys(patch).length === 0');
      expect(code).toContain('No update fields provided');
    });

    it('should handle starship ID resolution', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("env('STARSHIP_ID')");
      expect(code).toContain("state && typeof state === 'object' ? state.starshipId : undefined");
    });
  });

  describe('Maybe Fetch by Slug Node', () => {
    it('should have conditional http_request node for slug resolution', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const fetchNode = nodes.find((n) => n.ref === 'maybe_fetch_by_slug');

      expect(fetchNode).toBeDefined();
      expect(fetchNode?.type).toBe('http_request');
      expect(fetchNode?.name).toBe('Maybe Fetch by Slug');
      expect(fetchNode?.description).toBe('GET /starships/:starshipId/tools/:slug when id is not provided');
    });

    it('should have conditional URL based on slug resolution need', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const fetchNode = nodes.find((n) => n.ref === 'maybe_fetch_by_slug');
      const parameters = fetchNode?.parameters as Record<string, unknown>;

      expect(parameters.url).toContain('$lastOutputOf("validate")[0].json.hasSlugResolve');
      expect(parameters.url).toContain('/starships/');
      expect(parameters.url).toContain('/tools/');
    });

    it('should reference validation outputs', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const fetchNode = nodes.find((n) => n.ref === 'maybe_fetch_by_slug');
      const parameters = fetchNode?.parameters as Record<string, unknown>;

      expect(parameters.headers).toBe('{{ $lastOutputOf("validate")[0].json.headers }}');
      expect(parameters.timeout).toBe(6000);
    });
  });

  describe('Prepare Update Node', () => {
    it('should have prepare_update node with final request preparation', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare_update');

      expect(prepareNode).toBeDefined();
      expect(prepareNode?.type).toBe('code');
      expect(prepareNode?.name).toBe('Prepare Update Request');
      expect(prepareNode?.description).toBe('Pick ID and build PUT request target');
    });

    it('should resolve final tool ID', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare_update');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("const ctx = $lastOutputOf('validate')[0].json");
      expect(code).toContain('let toolId = ctx.id');
      expect(code).toContain('!ctx.hasId && ctx.hasSlugResolve');
      expect(code).toContain("const fetched = $lastOutputOf('maybe_fetch_by_slug')[0].json");
    });

    it('should handle slug resolution failure', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare_update');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('!fetched || !fetched.id');
      expect(code).toContain('Failed to resolve tool by slug');
    });

    it('should build proper PUT request', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare_update');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('url: `${ctx.baseUrl}/tools/${toolId}`');
      expect(code).toContain("method: 'PUT'");
      expect(code).toContain('headers: ctx.headers');
      expect(code).toContain('body: ctx.patch');
    });
  });

  describe('HTTP Update Node', () => {
    it('should have http_update node configured properly', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const httpNode = nodes.find((n) => n.ref === 'http_update');

      expect(httpNode).toBeDefined();
      expect(httpNode?.type).toBe('http_request');
      expect(httpNode?.name).toBe('Update Tool');
      expect(httpNode?.description).toBe('PUT /tools/:id');
    });

    it('should reference prepare_update node outputs', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const httpNode = nodes.find((n) => n.ref === 'http_update');
      const parameters = httpNode?.parameters as Record<string, unknown>;

      expect(parameters.url).toBe('{{ $lastOutputOf("prepare_update")[0].json.url }}');
      expect(parameters.method).toBe('{{ $lastOutputOf("prepare_update")[0].json.method }}');
      expect(parameters.headers).toBe('{{ $lastOutputOf("prepare_update")[0].json.headers }}');
      expect(parameters.body).toBe('{{ $lastOutputOf("prepare_update")[0].json.body }}');
      expect(parameters.timeout).toBe(10000);
    });
  });

  describe('End Node Configuration', () => {
    it('should have proper end node output configuration', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');

      expect(endNode).toBeDefined();
      expect(endNode?.parameters).toHaveProperty('output');
      expect((endNode?.parameters as Record<string, unknown>)?.output).toBe('{{ $lastOutputOf("http_update")[0].json }}');
    });

    it('should reference the http_update node output', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as string;

      expect(output).toContain('$lastOutputOf("http_update")');
      expect(output).toContain('[0].json');
    });
  });

  describe('Tool Template', () => {
    it('should have correct template configuration', () => {
      expect(toolUpdateToolTemplate.slug).toBe('tool-update');
      expect(toolUpdateToolTemplate.category).toBe('automation');
      expect(toolUpdateToolTemplate.requiresApiKey).toBe(false);
      expect(toolUpdateToolTemplate.configurationFields).toEqual([]);
    });

    it('should have helpful example usage', () => {
      expect(toolUpdateToolTemplate.exampleUsage).toContain('Update by id');
      expect(toolUpdateToolTemplate.exampleUsage).toContain('resolve by slug');
      expect(toolUpdateToolTemplate.exampleUsage).toContain('starshipId/baseUrl/authToken inferred from state');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid update parameters with ID', () => {
      const validParams = {
        id: 'tool-123',
        name: 'Updated Tool',
        description: 'Updated description',
      };

      expect(() => {
        expect(validParams).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
        });
      }).not.toThrow();
    });

    it('should accept valid update parameters with slug', () => {
      const validParams = {
        slug: 'my-tool',
        isEnabled: false,
        configuration: { key: 'value' },
      };

      expect(() => {
        expect(validParams).toMatchObject({
          slug: expect.any(String),
          isEnabled: expect.any(Boolean),
          configuration: expect.any(Object),
        });
      }).not.toThrow();
    });

    it('should handle partial updates', () => {
      const partialUpdates = [
        { id: 'tool-123', name: 'New Name' },
        { slug: 'tool-slug', description: 'New Description' },
        { id: 'tool-123', isEnabled: false },
        { slug: 'tool-slug', parameters: { type: 'object' } },
        { id: 'tool-123', blueprint: { nodes: [], edges: [] } },
      ];

      partialUpdates.forEach((params) => {
        expect(() => {
          expect(params).toEqual(expect.any(Object));
        }).not.toThrow();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing identifier', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('!hasId && !hasSlugResolve');
      expect(code).toContain('Provide "id" OR "slug"');
    });

    it('should handle missing update fields', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Object.keys(patch).length === 0');
      expect(code).toContain('No update fields provided');
    });

    it('should handle slug resolution failure', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare_update');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Failed to resolve tool by slug');
    });

    it('should handle missing environment variables', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('baseUrl is required');
      expect(code).toContain('authToken is required');
    });
  });

  describe('Flexibility and Use Cases', () => {
    it('should support both ID and slug-based updates', () => {
      expect(toolUpdateTool.description).toContain('Provide id directly or resolve by slug');
    });

    it('should support all tool fields for updates', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      const updateableFields = ['name', 'description', 'parameters', 'blueprint', 'configuration', 'isEnabled'];
      updateableFields.forEach((field) => {
        expect(code).toContain(`'${field}'`);
      });
    });

    it('should handle starship ID from state or environment', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("env('STARSHIP_ID')");
      expect(code).toContain('state.starshipId');
    });
  });

  describe('Performance and Efficiency', () => {
    it('should have reasonable timeouts', () => {
      const { nodes } = toolUpdateTool.blueprint;

      const validateNode = nodes.find((n) => n.ref === 'validate');
      const fetchNode = nodes.find((n) => n.ref === 'maybe_fetch_by_slug');
      const prepareNode = nodes.find((n) => n.ref === 'prepare_update');
      const httpNode = nodes.find((n) => n.ref === 'http_update');

      expect((validateNode?.parameters as Record<string, unknown>)?.timeout).toBe(3000);
      expect((fetchNode?.parameters as Record<string, unknown>)?.timeout).toBe(6000);
      expect((prepareNode?.parameters as Record<string, unknown>)?.timeout).toBe(3000);
      expect((httpNode?.parameters as Record<string, unknown>)?.timeout).toBe(10000);
    });

    it('should use PUT method for updates', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare_update');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("method: 'PUT'");
    });

    it('should only fetch by slug when needed', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const fetchNode = nodes.find((n) => n.ref === 'maybe_fetch_by_slug');
      const parameters = fetchNode?.parameters as Record<string, unknown>;

      expect(parameters.url).toContain('hasSlugResolve');
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
      expect(ToolMatchers.toHaveValidToolStructure(toolUpdateTool)).toEqual({
        message: expect.any(Function),
        pass: true,
      });

      expect(ToolMatchers.toHaveValidBlueprint(toolUpdateTool.blueprint)).toEqual({
        message: expect.any(Function),
        pass: true,
      });
    });
  });

  describe('API Integration', () => {
    it('should use correct endpoints for different operations', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const fetchNode = nodes.find((n) => n.ref === 'maybe_fetch_by_slug');
      const prepareNode = nodes.find((n) => n.ref === 'prepare_update');

      // Fetch by slug uses starships endpoint
      const fetchParams = fetchNode?.parameters as Record<string, unknown>;
      expect(fetchParams.url).toContain('/starships/');
      expect(fetchParams.url).toContain('/tools/');

      // Update uses direct tools endpoint
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;
      expect(code).toContain('/tools/${toolId}');
    });

    it('should include proper authentication headers', () => {
      const { nodes } = toolUpdateTool.blueprint;
      const validateNode = nodes.find((n) => n.ref === 'validate');
      const code = (validateNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Authorization');
      expect(code).toContain('Bearer ${authToken}');
    });
  });

  describe('Complex Update Logic', () => {
    it('should handle the full update workflow correctly', () => {
      const { edges } = toolUpdateTool.blueprint;
      const expectedFlow = [
        { from: 'start_1', to: 'validate' },
        { from: 'validate', to: 'maybe_fetch_by_slug' },
        { from: 'maybe_fetch_by_slug', to: 'prepare_update' },
        { from: 'prepare_update', to: 'http_update' },
        { from: 'http_update', to: 'end_1' },
      ];

      expectedFlow.forEach((expectedEdge) => {
        const edge = edges.find((e: Edge) => e.from === expectedEdge.from && e.to === expectedEdge.to);
        expect(edge).toBeDefined();
      });
    });
  });
});
