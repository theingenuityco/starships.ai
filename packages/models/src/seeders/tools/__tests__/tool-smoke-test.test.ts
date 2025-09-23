/**
 * Tool Smoke Test - E2E
 * Executes tool_smoke_test using real Autopilot execution with mocked HTTP only
 */

import { toolSmokeTestTool, toolSmokeTestToolTemplate } from '../tool-smoke-test';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, NodeHandlerOptions } from '@starships/autopilot';

// Helper to create a realistic Fetch Response-like object for our HttpRequest node
function createMockResponse(
  body: unknown,
  {
    ok = true,
    status = 200,
    statusText = 'OK',
    contentType = 'application/json; charset=utf-8',
    url = 'https://api.test.com/starships/test-starship/tools/demo',
    extraHeaders = {},
  }: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    contentType?: string;
    url?: string;
    extraHeaders?: Record<string, string>;
  } = {}
) {
  const headersMap: Record<string, string> = { 'content-type': contentType, ...extraHeaders };
  return {
    ok,
    status,
    statusText,
    url,
    headers: {
      get: (name: string) => headersMap[name.toLowerCase()] ?? null,
      forEach: (cb: (value: string, key: string) => void) => {
        for (const [k, v] of Object.entries(headersMap)) cb(v, k);
      },
    },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('Tool Smoke Test Tool', () => {
  beforeEach(() => {
    // Mock fetch globally for HTTP requests
    global.fetch = jest.fn() as unknown as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Tool Structure Validation', () => {
    it('should have valid tool structure', () => {
      expect(toolSmokeTestTool.name).toBe('tool_smoke_test');
      expect(toolSmokeTestTool.description).toContain('Execute another tool');
      expect(toolSmokeTestTool.parameters).toBeDefined();
      expect(toolSmokeTestTool.blueprint).toBeDefined();
    });

    it('should require targetSlug parameter', () => {
      const req = toolSmokeTestTool.parameters.required || [];
      expect(req).toEqual(expect.arrayContaining(['targetSlug']));
    });

    it('should have the expected nodes and connectivity', () => {
      const bp = toolSmokeTestTool.blueprint;
      const nodeRefs = new Set(bp.nodes.map((n) => n.ref));

      // Required nodes present
      const requiredRefs = ['start_1', 'prepare', 'http_get_tool', 'capture_args', 'mark_time', 'emit_args', 'run_tool', 'end_1'];
      for (const r of requiredRefs) expect(nodeRefs.has(r)).toBe(true);

      // Edges reference valid nodes
      for (const e of bp.edges) {
        expect(nodeRefs.has(e.from)).toBe(true);
        expect(nodeRefs.has(e.to)).toBe(true);
      }
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      expect(toolSmokeTestToolTemplate.name).toBe(toolSmokeTestTool.name);
      expect(toolSmokeTestToolTemplate.description).toBe(toolSmokeTestTool.description);
      expect(toolSmokeTestToolTemplate.parameters).toEqual(toolSmokeTestTool.parameters);
      expect(toolSmokeTestToolTemplate.blueprint).toEqual(toolSmokeTestTool.blueprint);
      expect(toolSmokeTestToolTemplate.slug).toBe('tool-smoke-test');
      expect(toolSmokeTestToolTemplate.category).toBe('automation');
      expect(toolSmokeTestToolTemplate.requiresApiKey).toBe(false);
    });
  });

  describe('Real Tool Execution', () => {
    async function executeToolWithMockEnv(input: unknown, mockEnv: Record<string, string>) {
      const options: NodeHandlerOptions = {
        eventCallback: jest.fn(),
        secureEnv: mockEnv,
        // Force in-process execution so HTTP mocking (global.fetch) works reliably in tests
        execution: ExecutionItemUtils.createExecution(),
      };

      const toolNode = new Tool(toolSmokeTestTool, options);

      const validation = toolNode.validate();
      expect(validation.valid).toBe(true);

      const executionItem: ExecutionItem = {
        json: input || {},
        pairedItem: { item: 0 },
      };

      const result = await toolNode.execute([executionItem]);
      return ExecutionItemUtils.unwrapSingle(result);
    }

    function makeNestedEchoBlueprint() {
      // Simple nested blueprint that echoes its initial input arguments
      return {
        nodes: [
          { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
          {
            ref: 'end_1',
            type: 'end',
            name: 'End',
            description: '',
            parameters: {
              // Return the args passed to the nested workflow
              output: '{{ $lastOutputOf("__initial__")[0].json }}',
            },
          },
        ],
        edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
        metadata: {},
      };
    }

    it('should fail when missing environment variables', async () => {
      await expect(executeToolWithMockEnv({ targetSlug: 'demo' }, {})).rejects.toThrow('baseUrl is required');
    });

    it('should fail without auth token', async () => {
      const env = { BASE_URL: 'https://api.test.com', STARSHIP_ID: 's1' };
      await expect(executeToolWithMockEnv({ targetSlug: 'demo' }, env as never)).rejects.toThrow('authToken is required');
    });

    it('should fail without starship ID', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 't' };
      await expect(executeToolWithMockEnv({ targetSlug: 'demo' }, env as never)).rejects.toThrow('starshipId is required');
    });

    it('should fail when targetSlug is missing', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 't', STARSHIP_ID: 's1' };
      await expect(executeToolWithMockEnv({}, env)).rejects.toThrow('targetSlug is required');
    });

    it('should execute nested tool blueprint and return result with duration', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-9' };
      const input = {
        targetSlug: 'demo',
        arguments: { foo: 'bar', n: 7 },
      };

      const nested = makeNestedEchoBlueprint();
      // HttpRequest returns HttpResponse with body = responseBody
      (global.fetch as jest.Mock).mockImplementation(async () => createMockResponse({ blueprint: nested }));

      const result = (await executeToolWithMockEnv(input, env)) as {
        ok: boolean;
        durationMs: number;
        result: Record<string, unknown>;
      };

      expect(result).toBeDefined();
      expect(result.ok).toBe(true);
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.result).toEqual({ foo: 'bar', n: 7 });

      // Verify correct API call was made
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/starships/star-9/tools/demo',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer abc',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle HTTP errors gracefully', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-9' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Tool not found' }),
        text: async () => JSON.stringify({ error: 'Tool not found' }),
      });

      await expect(executeToolWithMockEnv({ targetSlug: 'missing' }, env)).rejects.toThrow('HTTP request failed');
    });

    it('should handle network failure', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-9' };
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error: Connection refused'));
      await expect(executeToolWithMockEnv({ targetSlug: 'demo' }, env)).rejects.toThrow('Network error');
    });

    it('should handle trailing slashes in BASE_URL', async () => {
      const env = { BASE_URL: 'https://api.example.com///', AUTH_TOKEN: 'abc', STARSHIP_ID: 'ship-1' };
      const nested = makeNestedEchoBlueprint();
      (global.fetch as jest.Mock).mockImplementation(async () => createMockResponse({ blueprint: nested }));

      await executeToolWithMockEnv({ targetSlug: 'demo', arguments: {} }, env);
      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/starships/ship-1/tools/demo', expect.any(Object));
    });

    it('should pass through provided arguments to nested workflow', async () => {
      const env = { BASE_URL: 'https://api.test.io', AUTH_TOKEN: 'tok', STARSHIP_ID: 'ship-xyz' };
      const nested = makeNestedEchoBlueprint();
      (global.fetch as jest.Mock).mockImplementation(async () => createMockResponse({ blueprint: nested }));

      const args = { a: 1, b: { deep: true } };
      const result = (await executeToolWithMockEnv({ targetSlug: 'echoer', arguments: args }, env)) as {
        ok: boolean;
        result: Record<string, unknown>;
      };
      expect(result.ok).toBe(true);
      expect(result.result).toEqual(args);
    });
  });

  describe('Blueprint Implementation Details', () => {
    it('should have correct prepare node implementation', () => {
      const bp = toolSmokeTestTool.blueprint;
      const node = bp.nodes.find((n) => n.ref === 'prepare');
      expect(node).toBeDefined();
      expect(node?.type).toBe('code');

      const params = (node?.parameters || {}) as { code?: string };
      expect(params.code).toBeDefined();
      expect(params.code).toContain("method: 'GET'");
      expect(params.code).toContain('Authorization');
      expect(params.code).toContain('targetSlug');
    });

    it('should use http_get_tool response body.blueprint for nested run', () => {
      const bp = toolSmokeTestTool.blueprint;
      const run = bp.nodes.find((n) => n.ref === 'run_tool');
      expect(run?.type).toBe('workflow');
      const params = (run?.parameters || {}) as Record<string, unknown>;
      // Ensure the template references body.blueprint (HttpRequest wraps JSON under .body)
      expect(JSON.stringify(params)).toContain('http_get_tool');
      expect(JSON.stringify(params)).toContain('body');
      expect(JSON.stringify(params)).toContain('blueprint');
    });

    it('should compute duration in end node', () => {
      const bp = toolSmokeTestTool.blueprint;
      const end = bp.nodes.find((n) => n.ref === 'end_1');
      expect(end?.type).toBe('end');
      const params = (end?.parameters || {}) as Record<string, unknown>;
      expect(JSON.stringify(params)).toContain('durationMs');
      expect(JSON.stringify(params)).toContain('mark_time');
    });
  });
});
