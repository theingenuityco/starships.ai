/**
 * Tool Get Tool Tests
 * E2E tests using real autopilot execution with mocked HTTP
 */

import { toolGetTool, toolGetToolTemplate } from '../tool-get';
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
    url = 'https://api.test.com/starships/test-starship/tools/calc',
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

describe('Tool Get Tool', () => {
  beforeEach(() => {
    // Mock fetch globally for HTTP requests
    global.fetch = jest.fn() as unknown as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Tool Structure Validation', () => {
    it('should have valid tool structure', () => {
      expect(toolGetTool.name).toBe('tool_get');
      expect(toolGetTool.description).toContain('Get full details');
      expect(toolGetTool.parameters).toBeDefined();
      expect(toolGetTool.blueprint).toBeDefined();
    });

    it('should require slug parameter', () => {
      const req = toolGetTool.parameters.required || [];
      expect(req).toEqual(expect.arrayContaining(['slug']));
    });

    it('should have valid blueprint structure', () => {
      const bp = toolGetTool.blueprint;
      // Basic structure
      expect(Array.isArray(bp.nodes)).toBe(true);
      expect(Array.isArray(bp.edges)).toBe(true);
      // Required nodes present
      const nodeRefs = new Set(bp.nodes.map((n) => n.ref));
      ['start_1', 'prepare', 'http_get', 'extract', 'end_1'].forEach((r) => expect(nodeRefs.has(r)).toBe(true));
      // Edges reference valid nodes
      for (const e of bp.edges) {
        expect(nodeRefs.has(e.from)).toBe(true);
        expect(nodeRefs.has(e.to)).toBe(true);
      }
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      expect(toolGetToolTemplate.name).toBe(toolGetTool.name);
      expect(toolGetToolTemplate.description).toBe(toolGetTool.description);
      expect(toolGetToolTemplate.parameters).toEqual(toolGetTool.parameters);
      expect(toolGetToolTemplate.blueprint).toEqual(toolGetTool.blueprint);
      expect(toolGetToolTemplate.slug).toBe('tool-get');
      expect(toolGetToolTemplate.category).toBe('automation');
      expect(toolGetToolTemplate.requiresApiKey).toBe(false);
      expect(toolGetToolTemplate.exampleUsage).toBeDefined();
    });
  });

  describe('Real Tool Execution', () => {
    async function executeToolWithMockEnv(input: unknown, mockEnv: Record<string, string>) {
      const options: NodeHandlerOptions = {
        eventCallback: jest.fn(),
        secureEnv: mockEnv,
        execution: ExecutionItemUtils.createExecution(),
      };

      const toolNode = new Tool(toolGetTool, options);

      const validation = toolNode.validate();
      expect(validation.valid).toBe(true);

      const executionItem: ExecutionItem = {
        json: input || {},
        pairedItem: { item: 0 },
      };

      const result = await toolNode.execute([executionItem]);
      return ExecutionItemUtils.unwrapSingle(result);
    }

    it('should fail when missing environment variables', async () => {
      await expect(executeToolWithMockEnv({ slug: 'calc' }, {})).rejects.toThrow('baseUrl is required');
    });

    it('should fail without auth token', async () => {
      const env = { BASE_URL: 'https://api.test.com', STARSHIP_ID: 'test-starship' };
      await expect(executeToolWithMockEnv({ slug: 'calc' }, env as never)).rejects.toThrow('authToken is required');
    });

    it('should fail without starship ID', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 't' };
      await expect(executeToolWithMockEnv({ slug: 'calc' }, env as never)).rejects.toThrow('starshipId is required');
    });

    it('should fail when slug is missing', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 't', STARSHIP_ID: 's1' };
      await expect(executeToolWithMockEnv({}, env)).rejects.toThrow('slug is required');
    });

    it('should successfully fetch tool by slug with mocked API response', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'mock-auth-token', STARSHIP_ID: 'test-starship' };

      const apiPayload = {
        data: {
          id: 'tool-1',
          slug: 'calc',
          name: 'Calculator',
          description: 'Perform mathematical calculations',
          isEnabled: true,
          blueprint: { nodes: [], edges: [] },
        },
      };

      (global.fetch as jest.Mock).mockImplementation(async () => createMockResponse(apiPayload));

      const result = await executeToolWithMockEnv({ slug: 'calc' }, env);

      expect(result).toBeDefined();
      const tool = result as { id: string; slug: string; name: string };
      expect(tool.slug).toBe('calc');
      expect(tool.name).toBe('Calculator');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/starships/test-starship/tools/calc',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-auth-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle trailing slashes in BASE_URL', async () => {
      const env = { BASE_URL: 'https://api.example.com///', AUTH_TOKEN: 'abc', STARSHIP_ID: 'ship-1' };

      const apiPayload = { data: { id: 't', slug: 'calc', name: 'Calculator', blueprint: { nodes: [], edges: [] } } };
      (global.fetch as jest.Mock).mockImplementation(async () =>
        createMockResponse(apiPayload, { url: 'https://api.example.com/starships/ship-1/tools/calc' })
      );

      await executeToolWithMockEnv({ slug: 'calc' }, env);

      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/starships/ship-1/tools/calc', expect.any(Object));
    });

    it('should handle HTTP errors gracefully', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-9' };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Not Found' }),
        text: async () => JSON.stringify({ error: 'Not Found' }),
      });

      await expect(executeToolWithMockEnv({ slug: 'missing' }, env)).rejects.toThrow();
    });
  });

  describe('Blueprint Implementation Details', () => {
    it('should have correct prepare node implementation', () => {
      const bp = toolGetTool.blueprint;
      const node = bp.nodes.find((n) => n.ref === 'prepare');
      expect(node).toBeDefined();
      expect(node?.type).toBe('code');

      const params = (node?.parameters || {}) as { code?: string };
      expect(params.code).toBeDefined();
      expect(params.code).toContain("method: 'GET'");
      expect(params.code).toContain('Authorization');
      expect(params.code).toContain('slug');
    });

    it('should configure HTTP node correctly', () => {
      const bp = toolGetTool.blueprint;
      const http = bp.nodes.find((n) => n.ref === 'http_get');
      expect(http?.type).toBe('http_request');
      const params = (http?.parameters || {}) as Record<string, unknown>;
      expect(params.url).toBeDefined();
      expect(params.method).toBeDefined();
      expect(params.headers).toBeDefined();
      expect(params.timeout).toBeDefined();
    });
  });
});
