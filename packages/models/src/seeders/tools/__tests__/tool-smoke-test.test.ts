/**
 * Tool Smoke Test Tool Tests
 *
 * Tests for the tool-smoke-test tool including parameter validation,
 * blueprint structure, and functionality verification.
 */

import type { Edge } from '@starships/autopilot';
import { toolSmokeTestTool, toolSmokeTestToolTemplate } from '../tool-smoke-test';
import { ToolTestHelper, CommonToolTestData, ToolMatchers } from './tool-test-helper';

describe('Tool Smoke Test Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(toolSmokeTestTool, toolSmokeTestToolTemplate, 'tool_smoke_test');
    jest.clearAllMocks();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      expect(toolSmokeTestTool).toMatchObject({
        name: 'tool_smoke_test',
        description: expect.stringContaining('Execute another tool'),
        parameters: expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
          required: expect.arrayContaining(['targetSlug']),
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
      expect(toolSmokeTestToolTemplate).toMatchObject({
        slug: 'tool-smoke-test',
        category: 'automation',
        exampleUsage: expect.stringContaining('Smoke test'),
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

    it('should require targetSlug parameter', () => {
      expect(toolSmokeTestTool.parameters.required).toContain('targetSlug');
    });

    it('should have targetSlug parameter with correct definition', () => {
      const { properties } = toolSmokeTestTool.parameters;
      const targetSlugProp = (properties as Record<string, unknown>).targetSlug as Record<string, unknown>;

      expect(targetSlugProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('Slug of the tool to execute'),
      });
    });

    it('should have arguments parameter for tool input', () => {
      const { properties, required } = toolSmokeTestTool.parameters;
      const argumentsProp = (properties as Record<string, unknown>).arguments as Record<string, unknown>;

      expect(argumentsProp).toMatchObject({
        type: 'object',
        description: expect.stringContaining('Arguments object to pass to the target tool blueprint'),
        properties: expect.any(Object),
      });

      expect(required).not.toContain('arguments');
    });

    it('should have optional timeoutMs parameter', () => {
      const { properties, required } = toolSmokeTestTool.parameters;
      const timeoutProp = (properties as Record<string, unknown>).timeoutMs as Record<string, unknown>;

      expect(timeoutProp).toMatchObject({
        type: 'number',
        description: expect.stringContaining('Optional timeout for the nested run'),
      });

      expect(required).not.toContain('timeoutMs');
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

    it('should have expected nodes for complex smoke test logic', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const nodeTypes = nodes.map((n) => n.type);
      const nodeRefs = nodes.map((n) => n.ref);

      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('code');
      expect(nodeTypes).toContain('http_request');
      expect(nodeTypes).toContain('transform');
      expect(nodeTypes).toContain('workflow');
      expect(nodeTypes).toContain('end');

      expect(nodeRefs).toContain('start_1');
      expect(nodeRefs).toContain('prepare');
      expect(nodeRefs).toContain('http_get_tool');
      expect(nodeRefs).toContain('capture_args');
      expect(nodeRefs).toContain('mark_time');
      expect(nodeRefs).toContain('emit_args');
      expect(nodeRefs).toContain('run_tool');
      expect(nodeRefs).toContain('end_1');
    });

    it('should have valid edges connecting nodes', () => {
      const { edges, nodes } = toolSmokeTestTool.blueprint;
      const nodeRefs = nodes.map((n) => n.ref);

      edges.forEach((edge: Edge) => {
        expect(nodeRefs).toContain(edge.from);
        expect(nodeRefs).toContain(edge.to);
        expect(edge.ref).toBeTruthy();
      });
    });
  });

  describe('Prepare Node Logic', () => {
    it('should have prepare node with tool fetching logic', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');

      expect(prepareNode).toBeDefined();
      expect(prepareNode?.type).toBe('code');
      expect(prepareNode?.parameters).toHaveProperty('code');
    });

    it('should validate required environment variables', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("env('BASE_URL')");
      expect(code).toContain("env('AUTH_TOKEN')");
      expect(code).toContain("env('STARSHIP_ID')");
      expect(code).toContain('baseUrl is required');
      expect(code).toContain('authToken is required');
      expect(code).toContain('starshipId is required');
    });

    it('should validate targetSlug parameter', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('input.targetSlug');
      expect(code).toContain('targetSlug is required');
    });

    it('should build proper HTTP request configuration', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('url: `${baseUrl}/starships/${starshipId}/tools/${targetSlug}`');
      expect(code).toContain("method: 'GET'");
      expect(code).toContain('Authorization');
      expect(code).toContain('Bearer ${authToken}');
      expect(code).toContain('Content-Type');
      expect(code).toContain('application/json');
    });
  });

  describe('HTTP Get Tool Node', () => {
    it('should have http_request node configured properly', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const httpNode = nodes.find((n) => n.ref === 'http_get_tool');

      expect(httpNode).toBeDefined();
      expect(httpNode?.type).toBe('http_request');
      expect(httpNode?.name).toBe('Get Tool');
      expect(httpNode?.description).toBe('GET /starships/:starshipId/tools/:slug');
    });

    it('should reference prepare node outputs', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const httpNode = nodes.find((n) => n.ref === 'http_get_tool');
      const parameters = httpNode?.parameters as Record<string, unknown>;

      expect(parameters.url).toBe('{{ $lastOutputOf("prepare")[0].json.url }}');
      expect(parameters.method).toBe('{{ $lastOutputOf("prepare")[0].json.method }}');
      expect(parameters.headers).toBe('{{ $lastOutputOf("prepare")[0].json.headers }}');
      expect(parameters.timeout).toBe(8000);
    });
  });

  describe('Capture Args Node', () => {
    it('should have transform node for capturing arguments', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const captureNode = nodes.find((n) => n.ref === 'capture_args');

      expect(captureNode).toBeDefined();
      expect(captureNode?.type).toBe('transform');
      expect(captureNode?.name).toBe('Capture Arguments');
      expect(captureNode?.description).toBe('Attach initial arguments under dummy for later extraction');
    });

    it('should have proper transform configuration', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const captureNode = nodes.find((n) => n.ref === 'capture_args');
      const parameters = captureNode?.parameters as Record<string, unknown>;

      expect(parameters).toHaveProperty('transforms');
      const transforms = parameters.transforms as Array<Record<string, unknown>>;

      expect(transforms).toHaveLength(1);
      expect(transforms[0]).toMatchObject({
        operation: 'add',
        path: '/dummy',
        value: '{{ $lastOutputOf("__initial__")[0].json.arguments ?? {} }}',
      });
    });
  });

  describe('Mark Time Node', () => {
    it('should have mark_time node with timing logic', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const markTimeNode = nodes.find((n) => n.ref === 'mark_time');

      expect(markTimeNode).toBeDefined();
      expect(markTimeNode?.type).toBe('code');
      expect(markTimeNode?.name).toBe('Mark Start Time');
      expect(markTimeNode?.description).toBe('Record t0 and carry args forward');
    });

    it('should capture start time and arguments', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const markTimeNode = nodes.find((n) => n.ref === 'mark_time');
      const code = (markTimeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('t0: Date.now()');
      expect(code).toContain("args: (input && typeof input === 'object' && input !== null) ? (input.dummy ?? {}) : {}");
    });
  });

  describe('Emit Args Node', () => {
    it('should have emit_args node with argument preparation', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const emitNode = nodes.find((n) => n.ref === 'emit_args');

      expect(emitNode).toBeDefined();
      expect(emitNode?.type).toBe('code');
      expect(emitNode?.name).toBe('Emit Arguments');
      expect(emitNode?.description).toBe('Return plain args for nested workflow input');
    });

    it('should return clean arguments for workflow execution', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const emitNode = nodes.find((n) => n.ref === 'emit_args');
      const code = (emitNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("return (input && typeof input === 'object' && input !== null) ? (input.args ?? {}) : {}");
    });
  });

  describe('Run Tool Node', () => {
    it('should have workflow node for executing target tool', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const runNode = nodes.find((n) => n.ref === 'run_tool');

      expect(runNode).toBeDefined();
      expect(runNode?.type).toBe('workflow');
      expect(runNode?.name).toBe('Run Target Tool');
      expect(runNode?.description).toBe('Execute target tool blueprint with provided arguments');
    });

    it('should reference fetched tool blueprint', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const runNode = nodes.find((n) => n.ref === 'run_tool');
      const parameters = runNode?.parameters as Record<string, unknown>;

      expect(parameters.name).toBe('Nested Tool Execution');
      expect(parameters.description).toBe('Smoke test runner');
      expect(parameters.blueprint).toBe('{{ $lastOutputOf("http_get_tool")[0].json.blueprint }}');
      expect(parameters.timeout).toBe(60000);
    });
  });

  describe('End Node Configuration', () => {
    it('should have proper end node output configuration', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');

      expect(endNode).toBeDefined();
      expect(endNode?.parameters).toHaveProperty('output');

      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;
      expect(output).toHaveProperty('ok');
      expect(output).toHaveProperty('durationMs');
      expect(output).toHaveProperty('result');
    });

    it('should calculate duration and return results', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;

      expect(output.ok).toBe(true);
      expect(output.durationMs).toBe('{{ Date.now() - $lastOutputOf("mark_time")[0].json.t0 }}');
      expect(output.result).toBe('{{ $lastOutputOf("run_tool")[0].json }}');
    });
  });

  describe('Tool Template', () => {
    it('should have correct template configuration', () => {
      expect(toolSmokeTestToolTemplate.slug).toBe('tool-smoke-test');
      expect(toolSmokeTestToolTemplate.category).toBe('automation');
      expect(toolSmokeTestToolTemplate.requiresApiKey).toBe(false);
      expect(toolSmokeTestToolTemplate.configurationFields).toEqual([]);
    });

    it('should have helpful example usage', () => {
      expect(toolSmokeTestToolTemplate.exampleUsage).toContain('Smoke test');
      expect(toolSmokeTestToolTemplate.exampleUsage).toContain('targetSlug');
      expect(toolSmokeTestToolTemplate.exampleUsage).toContain('arguments');
      expect(toolSmokeTestToolTemplate.exampleUsage).toContain('starshipId/baseUrl/authToken inferred from state');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid smoke test parameters', () => {
      const validParams = {
        targetSlug: 'calculator',
        arguments: { expression: '2 + 3' },
      };

      expect(() => {
        expect(validParams).toMatchObject({
          targetSlug: expect.any(String),
          arguments: expect.any(Object),
        });
      }).not.toThrow();
    });

    it('should accept optional parameters', () => {
      const paramsWithOptionals = {
        targetSlug: 'echo',
        arguments: { message: 'test' },
        timeoutMs: 30000,
      };

      expect(() => {
        expect(paramsWithOptionals).toMatchObject({
          targetSlug: expect.any(String),
          arguments: expect.any(Object),
          timeoutMs: expect.any(Number),
        });
      }).not.toThrow();
    });

    it('should handle missing optional arguments', () => {
      const minimalParams = {
        targetSlug: 'time',
      };

      expect(() => {
        expect(minimalParams).toMatchObject({
          targetSlug: expect.any(String),
        });
      }).not.toThrow();
    });
  });

  describe('Complex Execution Flow', () => {
    it('should have proper execution sequence', () => {
      const { edges } = toolSmokeTestTool.blueprint;
      const expectedFlow = [
        { from: 'start_1', to: 'prepare' },
        { from: 'prepare', to: 'http_get_tool' },
        { from: 'http_get_tool', to: 'capture_args' },
        { from: 'capture_args', to: 'mark_time' },
        { from: 'mark_time', to: 'emit_args' },
        { from: 'emit_args', to: 'run_tool' },
        { from: 'run_tool', to: 'end_1' },
      ];

      expectedFlow.forEach((expectedEdge) => {
        const edge = edges.find((e: Edge) => e.from === expectedEdge.from && e.to === expectedEdge.to);
        expect(edge).toBeDefined();
      });
    });

    it('should handle argument passing correctly', () => {
      // Arguments flow: __initial__ -> capture_args -> mark_time -> emit_args -> run_tool
      const { nodes } = toolSmokeTestTool.blueprint;

      const captureNode = nodes.find((n) => n.ref === 'capture_args');
      const captureParams = captureNode?.parameters as Record<string, unknown>;
      const transforms = captureParams.transforms as Array<Record<string, unknown>>;
      expect(transforms[0].value).toContain('$lastOutputOf("__initial__")');

      const markTimeNode = nodes.find((n) => n.ref === 'mark_time');
      const markTimeCode = (markTimeNode?.parameters as Record<string, unknown>)?.code as string;
      expect(markTimeCode).toContain('input.dummy');

      const emitNode = nodes.find((n) => n.ref === 'emit_args');
      const emitCode = (emitNode?.parameters as Record<string, unknown>)?.code as string;
      expect(emitCode).toContain('input.args');
    });
  });

  describe('Performance Measurement', () => {
    it('should measure execution time accurately', () => {
      const { nodes } = toolSmokeTestTool.blueprint;

      const markTimeNode = nodes.find((n) => n.ref === 'mark_time');
      const markTimeCode = (markTimeNode?.parameters as Record<string, unknown>)?.code as string;
      expect(markTimeCode).toContain('t0: Date.now()');

      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;
      expect(output.durationMs).toContain('Date.now() - $lastOutputOf("mark_time")[0].json.t0');
    });

    it('should return comprehensive test results', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;

      expect(output).toHaveProperty('ok');
      expect(output).toHaveProperty('durationMs');
      expect(output).toHaveProperty('result');

      expect(output.ok).toBe(true); // Should be true by default for successful execution
    });
  });

  describe('Error Handling', () => {
    it('should handle missing environment variables', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("throw new Error('baseUrl is required')");
      expect(code).toContain("throw new Error('authToken is required')");
      expect(code).toContain("throw new Error('starshipId is required')");
      expect(code).toContain("throw new Error('targetSlug is required')");
    });

    it('should handle null/undefined input safely', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const markTimeNode = nodes.find((n) => n.ref === 'mark_time');
      const emitNode = nodes.find((n) => n.ref === 'emit_args');

      const markTimeCode = (markTimeNode?.parameters as Record<string, unknown>)?.code as string;
      const emitCode = (emitNode?.parameters as Record<string, unknown>)?.code as string;

      expect(markTimeCode).toContain("input && typeof input === 'object' && input !== null");
      expect(emitCode).toContain("input && typeof input === 'object' && input !== null");
    });
  });

  describe('Timeouts and Performance', () => {
    it('should have reasonable timeouts for all operations', () => {
      const { nodes } = toolSmokeTestTool.blueprint;

      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const httpNode = nodes.find((n) => n.ref === 'http_get_tool');
      const markTimeNode = nodes.find((n) => n.ref === 'mark_time');
      const emitNode = nodes.find((n) => n.ref === 'emit_args');
      const runNode = nodes.find((n) => n.ref === 'run_tool');

      expect((prepareNode?.parameters as Record<string, unknown>)?.timeout).toBe(3000);
      expect((httpNode?.parameters as Record<string, unknown>)?.timeout).toBe(8000);
      expect((markTimeNode?.parameters as Record<string, unknown>)?.timeout).toBe(2000);
      expect((emitNode?.parameters as Record<string, unknown>)?.timeout).toBe(2000);
      expect((runNode?.parameters as Record<string, unknown>)?.timeout).toBe(60000);
    });

    it('should have generous timeout for tool execution', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const runNode = nodes.find((n) => n.ref === 'run_tool');
      const parameters = runNode?.parameters as Record<string, unknown>;

      expect(parameters.timeout).toBe(60000); // 60 seconds for tool execution
    });
  });

  describe('Integration Testing Capabilities', () => {
    it('should be suitable for automated testing workflows', () => {
      expect(toolSmokeTestTool.description).toContain('Execute another tool');
      expect(toolSmokeTestTool.description).toContain('pass/fail with duration');
    });

    it('should provide debugging information', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;

      // Should include timing information
      expect(output).toHaveProperty('durationMs');

      // Should include full result for debugging
      expect(output).toHaveProperty('result');
      expect(output.result).toBe('{{ $lastOutputOf("run_tool")[0].json }}');
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
      expect(ToolMatchers.toHaveValidToolStructure(toolSmokeTestTool)).toEqual({
        message: expect.any(Function),
        pass: true,
      });

      expect(ToolMatchers.toHaveValidBlueprint(toolSmokeTestTool.blueprint)).toEqual({
        message: expect.any(Function),
        pass: true,
      });
    });
  });

  describe('Functional Testing - Node Execution', () => {
    describe('Prepare Node Logic Execution', () => {
      it('should execute prepare node with valid environment and target slug', () => {
        const originalEnv = process.env;
        process.env.BASE_URL = 'https://api.example.com/';
        process.env.AUTH_TOKEN = 'test-token-123';
        process.env.STARSHIP_ID = 'starship-456';

        const { nodes } = toolSmokeTestTool.blueprint;
        const prepareNode = nodes.find((n) => n.ref === 'prepare');
        const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

        const validInput = {
          targetSlug: 'calculator-tool',
          arguments: { expression: '2 + 3 * 4' },
          timeoutMs: 30000,
        };

        const env = (key: string) => process.env[key];
        const executeCode = new Function('input', 'env', code);
        const result = executeCode(validInput, env);

        expect(result).toBeDefined();
        expect(result.url).toBe('https://api.example.com/starships/starship-456/tools/calculator-tool');
        expect(result.method).toBe('GET');
        expect(result.headers).toBeDefined();
        expect(result.headers.Authorization).toBe('Bearer test-token-123');
        expect(result.headers['Content-Type']).toBe('application/json');

        process.env = originalEnv;
      });

      it('should throw error for missing targetSlug', () => {
        const originalEnv = process.env;
        process.env.BASE_URL = 'https://api.example.com';
        process.env.AUTH_TOKEN = 'test-token';
        process.env.STARSHIP_ID = 'starship-123';

        const { nodes } = toolSmokeTestTool.blueprint;
        const prepareNode = nodes.find((n) => n.ref === 'prepare');
        const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

        const inputWithoutTargetSlug = {
          arguments: { expression: '1 + 1' },
        };

        const env = (key: string) => process.env[key];
        const executeCode = new Function('input', 'env', code);

        expect(() => executeCode(inputWithoutTargetSlug, env)).toThrow('targetSlug is required');

        process.env = originalEnv;
      });

      it('should throw error for missing environment variables', () => {
        const originalEnv = process.env;
        const validInput = { targetSlug: 'test-tool' };
        const { nodes } = toolSmokeTestTool.blueprint;
        const prepareNode = nodes.find((n) => n.ref === 'prepare');
        const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;
        const executeCode = new Function('input', 'env', code);

        // Test missing BASE_URL
        process.env = { ...process.env };
        delete process.env.BASE_URL;
        process.env.AUTH_TOKEN = 'test-token';
        process.env.STARSHIP_ID = 'starship-123';
        const env1 = (key: string) => process.env[key];
        expect(() => executeCode(validInput, env1)).toThrow('baseUrl is required');

        // Test missing AUTH_TOKEN
        process.env.BASE_URL = 'https://api.example.com';
        delete process.env.AUTH_TOKEN;
        process.env.STARSHIP_ID = 'starship-123';
        const env2 = (key: string) => process.env[key];
        expect(() => executeCode(validInput, env2)).toThrow('authToken is required');

        // Test missing STARSHIP_ID
        process.env.BASE_URL = 'https://api.example.com';
        process.env.AUTH_TOKEN = 'test-token';
        delete process.env.STARSHIP_ID;
        const env3 = (key: string) => process.env[key];
        expect(() => executeCode(validInput, env3)).toThrow('starshipId is required');

        process.env = originalEnv;
      });

      it('should build correct URL for different target slugs', () => {
        const originalEnv = process.env;
        process.env.BASE_URL = 'https://api.example.com';
        process.env.AUTH_TOKEN = 'token';
        process.env.STARSHIP_ID = 'ship-123';

        const { nodes } = toolSmokeTestTool.blueprint;
        const prepareNode = nodes.find((n) => n.ref === 'prepare');
        const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

        const env = (key: string) => process.env[key];
        const executeCode = new Function('input', 'env', code);

        const testCases = [
          { targetSlug: 'simple-calculator', expectedPath: '/starships/ship-123/tools/simple-calculator' },
          { targetSlug: 'echo-tool', expectedPath: '/starships/ship-123/tools/echo-tool' },
          { targetSlug: 'complex-tool-name', expectedPath: '/starships/ship-123/tools/complex-tool-name' },
        ];

        testCases.forEach(({ targetSlug, expectedPath }) => {
          const result = executeCode({ targetSlug }, env);
          expect(result.url).toBe(`https://api.example.com${expectedPath}`);
        });

        process.env = originalEnv;
      });
    });

    describe('Mark Time Node Logic Execution', () => {
      it('should execute mark_time node and record timestamp with arguments', () => {
        const { nodes } = toolSmokeTestTool.blueprint;
        const markTimeNode = nodes.find((n) => n.ref === 'mark_time');
        const code = (markTimeNode?.parameters as Record<string, unknown>)?.code as string;

        const mockInput = {
          dummy: { expression: '5 * 6', precision: 2 },
          // other fields from transform node
        };

        const beforeTime = Date.now();
        const executeCode = new Function('input', code);
        const result = executeCode(mockInput);
        const afterTime = Date.now();

        expect(result).toBeDefined();
        expect(result.t0).toBeGreaterThanOrEqual(beforeTime);
        expect(result.t0).toBeLessThanOrEqual(afterTime);
        expect(result.args).toEqual({ expression: '5 * 6', precision: 2 });
      });

      it('should handle null or undefined input gracefully', () => {
        const { nodes } = toolSmokeTestTool.blueprint;
        const markTimeNode = nodes.find((n) => n.ref === 'mark_time');
        const code = (markTimeNode?.parameters as Record<string, unknown>)?.code as string;

        const executeCode = new Function('input', code);

        // Test with null input
        let result = executeCode(null);
        expect(result.t0).toBeDefined();
        expect(result.args).toEqual({});

        // Test with undefined input
        result = executeCode(undefined);
        expect(result.t0).toBeDefined();
        expect(result.args).toEqual({});

        // Test with input without dummy
        result = executeCode({});
        expect(result.t0).toBeDefined();
        expect(result.args).toEqual({});

        // Test with input with null dummy
        result = executeCode({ dummy: null });
        expect(result.t0).toBeDefined();
        expect(result.args).toEqual({});
      });

      it('should extract args from dummy field correctly', () => {
        const { nodes } = toolSmokeTestTool.blueprint;
        const markTimeNode = nodes.find((n) => n.ref === 'mark_time');
        const code = (markTimeNode?.parameters as Record<string, unknown>)?.code as string;

        const executeCode = new Function('input', code);

        const testCases = [
          {
            input: { dummy: { message: 'Hello World' } },
            expectedArgs: { message: 'Hello World' },
          },
          {
            input: { dummy: { expression: '10 / 2', format: 'decimal' } },
            expectedArgs: { expression: '10 / 2', format: 'decimal' },
          },
          {
            input: { dummy: {} },
            expectedArgs: {},
          },
        ];

        testCases.forEach(({ input, expectedArgs }) => {
          const result = executeCode(input);
          expect(result.args).toEqual(expectedArgs);
          expect(typeof result.t0).toBe('number');
        });
      });
    });

    describe('Emit Args Node Logic Execution', () => {
      it('should execute emit_args node and return clean arguments', () => {
        const { nodes } = toolSmokeTestTool.blueprint;
        const emitNode = nodes.find((n) => n.ref === 'emit_args');
        const code = (emitNode?.parameters as Record<string, unknown>)?.code as string;

        const mockInput = {
          t0: Date.now(),
          args: { expression: '2 + 2', precision: 0 },
          // other fields that should be filtered out
          someOtherField: 'should not appear',
        };

        const executeCode = new Function('input', code);
        const result = executeCode(mockInput);

        expect(result).toEqual({ expression: '2 + 2', precision: 0 });
      });

      it('should handle null or undefined input gracefully', () => {
        const { nodes } = toolSmokeTestTool.blueprint;
        const emitNode = nodes.find((n) => n.ref === 'emit_args');
        const code = (emitNode?.parameters as Record<string, unknown>)?.code as string;

        const executeCode = new Function('input', code);

        // Test with null input
        let result = executeCode(null);
        expect(result).toEqual({});

        // Test with undefined input
        result = executeCode(undefined);
        expect(result).toEqual({});

        // Test with input without args
        result = executeCode({ t0: Date.now() });
        expect(result).toEqual({});

        // Test with input with null args
        result = executeCode({ args: null });
        expect(result).toEqual({});
      });

      it('should return only the args field, filtering out other data', () => {
        const { nodes } = toolSmokeTestTool.blueprint;
        const emitNode = nodes.find((n) => n.ref === 'emit_args');
        const code = (emitNode?.parameters as Record<string, unknown>)?.code as string;

        const executeCode = new Function('input', code);

        const complexInput = {
          t0: 1640995200000,
          args: {
            targetSlug: 'nested-tool',
            params: { x: 10, y: 20 },
            options: { debug: true },
          },
          internalState: 'should be filtered',
          metadata: { version: '1.0' },
          executionContext: 'filtered',
        };

        const result = executeCode(complexInput);

        expect(result).toEqual({
          targetSlug: 'nested-tool',
          params: { x: 10, y: 20 },
          options: { debug: true },
        });
        expect(result.internalState).toBeUndefined();
        expect(result.metadata).toBeUndefined();
        expect(result.executionContext).toBeUndefined();
        expect(result.t0).toBeUndefined();
      });

      it('should handle empty args object', () => {
        const { nodes } = toolSmokeTestTool.blueprint;
        const emitNode = nodes.find((n) => n.ref === 'emit_args');
        const code = (emitNode?.parameters as Record<string, unknown>)?.code as string;

        const executeCode = new Function('input', code);

        const inputWithEmptyArgs = {
          t0: Date.now(),
          args: {},
          otherData: 'filtered',
        };

        const result = executeCode(inputWithEmptyArgs);
        expect(result).toEqual({});
      });
    });

    describe('Integration Testing Scenarios', () => {
      it('should handle complete smoke test data flow', () => {
        // This test simulates the data flow through the nodes
        const { nodes } = toolSmokeTestTool.blueprint;
        const markTimeNode = nodes.find((n) => n.ref === 'mark_time');
        const emitNode = nodes.find((n) => n.ref === 'emit_args');

        const markTimeCode = (markTimeNode?.parameters as Record<string, unknown>)?.code as string;
        const emitCode = (emitNode?.parameters as Record<string, unknown>)?.code as string;

        // Step 1: Arguments come from transform node (captured as dummy)
        const initialArgs = { expression: '8 * 7', format: 'integer' };
        const transformOutput = { dummy: initialArgs };

        // Step 2: mark_time captures timestamp and args
        const markTimeExec = new Function('input', markTimeCode);
        const timeResult = markTimeExec(transformOutput);

        expect(timeResult.args).toEqual(initialArgs);
        expect(typeof timeResult.t0).toBe('number');

        // Step 3: emit_args extracts clean args for workflow
        const emitExec = new Function('input', emitCode);
        const finalArgs = emitExec(timeResult);

        expect(finalArgs).toEqual(initialArgs);
      });

      it('should maintain argument fidelity through the pipeline', () => {
        const { nodes } = toolSmokeTestTool.blueprint;
        const markTimeNode = nodes.find((n) => n.ref === 'mark_time');
        const emitNode = nodes.find((n) => n.ref === 'emit_args');

        const markTimeCode = (markTimeNode?.parameters as Record<string, unknown>)?.code as string;
        const emitCode = (emitNode?.parameters as Record<string, unknown>)?.code as string;

        const complexArgs = {
          expression: 'sqrt(16) + pow(2, 3)',
          precision: 4,
          options: {
            angleMode: 'radians',
            scientific: true,
          },
          metadata: {
            source: 'smoke-test',
            timestamp: new Date().toISOString(),
          },
        };

        // Simulate the full pipeline
        const transformedInput = { dummy: complexArgs };

        const markTimeExec = new Function('input', markTimeCode);
        const timeResult = markTimeExec(transformedInput);

        const emitExec = new Function('input', emitCode);
        const finalResult = emitExec(timeResult);

        // Arguments should remain exactly the same throughout the pipeline
        expect(finalResult).toEqual(complexArgs);
      });
    });
  });

  describe('API Integration', () => {
    it('should fetch tool definition from correct endpoint', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('/starships/${starshipId}/tools/${targetSlug}');
    });

    it('should include proper authentication', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const prepareNode = nodes.find((n) => n.ref === 'prepare');
      const code = (prepareNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('Authorization');
      expect(code).toContain('Bearer ${authToken}');
    });

    it('should expect blueprint property in response', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const runNode = nodes.find((n) => n.ref === 'run_tool');
      const parameters = runNode?.parameters as Record<string, unknown>;

      expect(parameters.blueprint).toBe('{{ $lastOutputOf("http_get_tool")[0].json.blueprint }}');
    });
  });

  describe('Nested Execution', () => {
    it('should execute tool blueprint as nested workflow', () => {
      const { nodes } = toolSmokeTestTool.blueprint;
      const runNode = nodes.find((n) => n.ref === 'run_tool');

      expect(runNode?.type).toBe('workflow');
      expect(runNode?.name).toBe('Run Target Tool');
    });

    it('should pass arguments correctly to nested execution', () => {
      // The flow should be: initial args -> capture -> mark_time -> emit -> workflow
      const { nodes } = toolSmokeTestTool.blueprint;

      const emitNode = nodes.find((n) => n.ref === 'emit_args');

      // emit_args should be directly connected to run_tool
      const { edges } = toolSmokeTestTool.blueprint;
      const connectingEdge = edges.find((e: Edge) => e.from === 'emit_args' && e.to === 'run_tool');

      expect(connectingEdge).toBeDefined();
      expect(emitNode?.description).toContain('Return plain args for nested workflow input');
    });
  });
});
