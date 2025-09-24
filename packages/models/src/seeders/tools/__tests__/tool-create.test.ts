/**
 * Tool Create Tool Tests
 * End-to-end tests using real autopilot Tool execution with minimal HTTP mocking
 */

import { toolCreateTool, toolCreateToolTemplate } from '../tool-create';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, NodeHandlerOptions, Edge } from '@starships/autopilot';

// Helper to create a realistic Fetch Response-like object for our HttpRequest node
function createMockResponse(
  body: unknown,
  {
    ok = true,
    status = 200,
    statusText = 'OK',
    contentType = 'application/json; charset=utf-8',
    url = 'https://api.test.com/starships/test-starship-123/tools',
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

describe('Tool Create Tool', () => {
  beforeEach(() => {
    // Mock fetch globally for HTTP requests
    global.fetch = jest.fn() as unknown as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Tool Structure Validation', () => {
    it('should have valid tool structure', () => {
      expect(toolCreateTool.name).toBe('tool_create');
      expect(toolCreateTool.description).toContain('Create a new Tool');
      expect(toolCreateTool.parameters).toBeDefined();
      expect(toolCreateTool.blueprint).toBeDefined();
    });

    it('should require essential parameters', () => {
      const req = toolCreateTool.parameters.required || [];
      expect(req).toEqual(expect.arrayContaining(['name', 'slug', 'description', 'parameters', 'blueprint']));
    });

    it('should have valid blueprint nodes and flow', () => {
      const bp = toolCreateTool.blueprint;
      const nodeTypes = bp.nodes.map((n) => n.type);
      expect(nodeTypes).toEqual(expect.arrayContaining(['start', 'code', 'http_request', 'end']));

      const refs = new Set(bp.nodes.map((n) => n.ref));
      for (const e of bp.edges) {
        expect(refs.has(e.from)).toBe(true);
        expect(refs.has(e.to)).toBe(true);
      }

      const edges = bp.edges;
      const hasCorrectFlow = [
        edges.some((e: Edge) => e.from === 'start_1' && e.to === 'prepare'),
        edges.some((e: Edge) => e.from === 'prepare' && e.to === 'http_create'),
        edges.some((e: Edge) => e.from === 'http_create' && e.to === 'end_1'),
      ];
      expect(hasCorrectFlow.every(Boolean)).toBe(true);
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      expect(toolCreateToolTemplate.name).toBe(toolCreateTool.name);
      expect(toolCreateToolTemplate.description).toBe(toolCreateTool.description);
      expect(toolCreateToolTemplate.parameters).toEqual(toolCreateTool.parameters);
      expect(toolCreateToolTemplate.blueprint).toEqual(toolCreateTool.blueprint);
      expect(toolCreateToolTemplate.slug).toBe('tool-create');
      expect(toolCreateToolTemplate.category).toBe('automation');
      expect(toolCreateToolTemplate.requiresApiKey).toBe(false);
    });
  });

  describe('Real Tool Execution', () => {
    async function executeToolWithMockEnv(input: unknown, mockEnv: Record<string, string>) {
      const options: NodeHandlerOptions = {
        eventCallback: jest.fn(),
        secureEnv: mockEnv,
        execution: ExecutionItemUtils.createExecution(),
      };

      const toolNode = new Tool(toolCreateTool, options);
      const validation = toolNode.validate();
      expect(validation.valid).toBe(true);

      const executionItem: ExecutionItem = { json: input || {}, pairedItem: { item: 0 } };
      const result = await toolNode.execute([executionItem]);
      return ExecutionItemUtils.unwrapSingle(result);
    }

    it('should fail when missing environment variables', async () => {
      await expect(executeToolWithMockEnv({}, {})).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('baseUrl is required'),
      });
    });

    it('should fail without auth token', async () => {
      const env = { BASE_URL: 'https://api.test.com', STARSHIP_ID: 's1' };
      await expect(executeToolWithMockEnv({}, env as never)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('authToken is required'),
      });
    });

    it('should fail without starship ID', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 't' };
      await expect(executeToolWithMockEnv({}, env as never)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('starshipId is required'),
      });
    });

    it('should fail when required input fields are missing', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 't', STARSHIP_ID: 's1' };
      await expect(executeToolWithMockEnv({ slug: 'x' }, env)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('name is required'),
      });
    });

    it('should successfully create tool with mocked API response', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-1' };
      const input = {
        name: 'Calculator',
        slug: 'calculator',
        description: 'Perform calculations',
        parameters: { type: 'object', properties: { a: { type: 'number' } } },
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
            { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: 42 } },
          ],
          edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
          metadata: {},
        },
        configuration: { region: 'us' },
        isEnabled: true,
      };

      const responseBody = { id: 'tool-1', slug: 'calculator', name: 'Calculator' };
      (global.fetch as jest.Mock).mockImplementation(async () => createMockResponse({ data: responseBody }));

      const result = await executeToolWithMockEnv(input, env);
      expect(result).toBeDefined();
      // HttpRequest returns an HttpResponse object with body
      const httpResp = result as { body?: unknown; status?: number };
      expect(httpResp).toHaveProperty('body');
      if (httpResp.body && typeof httpResp.body === 'object') {
        const body = httpResp.body as { data?: { id: string } } | undefined;
        if (body?.data) {
          expect(body.data.id).toBe('tool-1');
        }
      }

      // Verify API call
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/starships/star-1/tools',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer abc',
            'Content-Type': 'application/json',
          }),
        })
      );

      // Verify request body fields
      const call = (global.fetch as jest.Mock).mock.calls[0];
      const opts = call[1] as RequestInit;
      const sent = JSON.parse(String((opts as unknown as Record<string, unknown>).body));
      expect(sent).toMatchObject({
        name: 'Calculator',
        slug: 'calculator',
        description: 'Perform calculations',
        isEnabled: true,
      });
    });

    it('should handle HTTP errors gracefully', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-1' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'Invalid' }),
        text: async () => JSON.stringify({ error: 'Invalid' }),
      });
      await expect(
        executeToolWithMockEnv(
          {
            name: 'N',
            slug: 's',
            description: 'd',
            parameters: { type: 'object', properties: {} },
            blueprint: { nodes: [], edges: [], metadata: {} },
          },
          env
        )
      ).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('HTTP request failed'),
      });
    });

    it('should handle network failure', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-1' };
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error: Connection refused'));
      await expect(
        executeToolWithMockEnv(
          {
            name: 'N',
            slug: 's',
            description: 'd',
            parameters: { type: 'object', properties: {} },
            blueprint: { nodes: [], edges: [], metadata: {} },
          },
          env
        )
      ).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('Network error'),
      });
    });

    it('should handle trailing slashes in BASE_URL', async () => {
      const env = { BASE_URL: 'https://api.example.com///', AUTH_TOKEN: 't', STARSHIP_ID: 'ship-9' };
      (global.fetch as jest.Mock).mockImplementation(async () => createMockResponse({ data: {} }));
      const input = {
        name: 'N',
        slug: 's',
        description: 'd',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [], edges: [], metadata: {} },
      };
      await executeToolWithMockEnv(input, env);
      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/starships/ship-9/tools', expect.any(Object));
    });
  });

  describe('Blueprint Implementation Details', () => {
    it('should have correct prepare node', () => {
      const bp = toolCreateTool.blueprint;
      const n = bp.nodes.find((n) => n.ref === 'prepare');
      expect(n?.type).toBe('code');
      const params = (n?.parameters || {}) as { code?: string };
      expect(params.code).toContain("method: 'POST'");
      expect(params.code).toContain('Authorization');
      expect(params.code).toContain('Bearer');
      expect(params.code).toContain('body');
    });

    it('should have correct HTTP request node configuration', () => {
      const bp = toolCreateTool.blueprint;
      const http = bp.nodes.find((n) => n.ref === 'http_create');
      expect(http?.type).toBe('http_request');
      const params = (http?.parameters || {}) as Record<string, unknown>;
      expect(params.url).toBeDefined();
      expect(params.method).toBeDefined();
      expect(params.headers).toBeDefined();
      expect(params.timeout).toBeDefined();
    });
  });
});

describe('Tool.execute return value - tool_create', () => {
  it('should return a single ExecutionItem with HttpResponse and preserved pairedItem', async () => {
    const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-1' };
    const input = {
      name: 'Calculator',
      slug: 'calculator',
      description: 'Perform calculations',
      parameters: { type: 'object', properties: {} },
      blueprint: {
        nodes: [
          { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: 42 } },
        ],
        edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
        metadata: {},
      },
      configuration: {},
      isEnabled: true,
    };

    global.fetch = jest.fn() as unknown as jest.Mock;
    (global.fetch as jest.Mock).mockImplementation(async () =>
      createMockResponse({ data: { id: 'tool-1' } }, { url: 'https://api.test.com/starships/star-1/tools' })
    );

    const options: NodeHandlerOptions = {
      eventCallback: jest.fn(),
      secureEnv: env,
      execution: ExecutionItemUtils.createExecution(),
    };

    const toolNode = new Tool(toolCreateTool, options);
    const raw = await toolNode.execute([{ json: input, pairedItem: { item: 2 } } as ExecutionItem]);

    // Raw ExecutionItem[] assertions
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).toHaveLength(1);

    const item = raw[0];
    expect(item.pairedItem).toEqual({ item: 2 });

    // Ensure HttpResponse shape
    const http = item.json as { status: number; url: string; body?: unknown };
    expect(http).toBeDefined();
    expect(typeof http.status).toBe('number');
    expect(http.url).toBe('https://api.test.com/starships/star-1/tools');

    // Body should contain server payload
    const body = http.body as { data?: { id: string } } | undefined;
    expect(body?.data?.id).toBe('tool-1');
  });
});
