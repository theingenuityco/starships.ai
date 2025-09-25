/**
 * Tool Update Tool Tests
 * End-to-end tests using real autopilot Tool execution with minimal HTTP mocking
 */

import { toolUpdateTool, toolUpdateToolTemplate } from '../tool-update';
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
    url = 'https://api.test.com/tools/tool-123',
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

describe('Tool Update Tool', () => {
  beforeEach(() => {
    // Mock fetch globally for HTTP requests
    global.fetch = jest.fn() as unknown as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Tool Structure Validation', () => {
    it('should have valid tool structure', () => {
      expect(toolUpdateTool.name).toBe('tool_update');
      expect(toolUpdateTool.description).toContain('Update an existing Tool');
      expect(toolUpdateTool.parameters).toBeDefined();
      expect(toolUpdateTool.blueprint).toBeDefined();
    });

    it('should have no required parameters (all patch fields optional)', () => {
      expect(toolUpdateTool.parameters.required).toEqual([]);
    });

    it('should have valid blueprint nodes and flow', () => {
      const bp = toolUpdateTool.blueprint;
      const nodeTypes = bp.nodes.map((n) => n.type);
      expect(nodeTypes).toEqual(expect.arrayContaining(['start', 'code', 'conditional', 'http_request', 'end']));

      const refs = new Set(bp.nodes.map((n) => n.ref));
      for (const e of bp.edges) {
        expect(refs.has(e.from)).toBe(true);
        expect(refs.has(e.to)).toBe(true);
      }

      const edges = bp.edges;
      const hasKeyFlowSegments = [
        edges.some((e: Edge) => e.from === 'start_1' && e.to === 'validate'),
        edges.some((e: Edge) => e.from === 'validate' && e.to === 'resolve_decision'),
        edges.some((e: Edge) => e.from === 'resolve_decision' && e.to === 'maybe_fetch_by_slug'),
        edges.some((e: Edge) => e.from === 'resolve_decision' && e.to === 'prepare_update'),
        edges.some((e: Edge) => e.from === 'maybe_fetch_by_slug' && e.to === 'prepare_update'),
        edges.some((e: Edge) => e.from === 'prepare_update' && e.to === 'http_update'),
        edges.some((e: Edge) => e.from === 'http_update' && e.to === 'end_1'),
      ];
      expect(hasKeyFlowSegments.every(Boolean)).toBe(true);
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      expect(toolUpdateToolTemplate.name).toBe(toolUpdateTool.name);
      expect(toolUpdateToolTemplate.description).toBe(toolUpdateTool.description);
      expect(toolUpdateToolTemplate.parameters).toEqual(toolUpdateTool.parameters);
      expect(toolUpdateToolTemplate.blueprint).toEqual(toolUpdateTool.blueprint);
      expect(toolUpdateToolTemplate.slug).toBe('tool-update');
      expect(toolUpdateToolTemplate.category).toBe('automation');
      expect(toolUpdateToolTemplate.requiresApiKey).toBe(false);
    });
  });

  describe('Real Tool Execution', () => {
    async function executeToolWithMockEnv(input: unknown, mockEnv: Record<string, string>) {
      const options: NodeHandlerOptions = {
        eventCallback: jest.fn(),
        secureEnv: mockEnv,
        execution: ExecutionItemUtils.createExecution(),
      };

      const toolNode = new Tool(toolUpdateTool, options);
      const validation = toolNode.validate();
      expect(validation.valid).toBe(true);

      const executionItem: ExecutionItem = { json: input || {}, pairedItem: { item: 0 } };
      const result = await toolNode.execute([executionItem]);
      return ExecutionItemUtils.unwrapSingle(result);
    }

    it('should fail when missing BASE_URL', async () => {
      await expect(executeToolWithMockEnv({ slug: 'calc', name: 'N' }, {})).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('baseUrl is required'),
      });
    });

    it('should fail without auth token', async () => {
      const env = { BASE_URL: 'https://api.test.com' };
      await expect(executeToolWithMockEnv({ slug: 'calc', name: 'N' }, env as never)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('authToken is required'),
      });
    });

    it('should fail without starship ID when resolving by slug', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 't' };
      await expect(executeToolWithMockEnv({ slug: 'calc', name: 'N' }, env as never)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('starshipId is required'),
      });
    });

    it('should succeed updating by slug when server wraps response in ApiResponse', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-1' };

      (global.fetch as jest.Mock)
        // Resolve slug -> ApiResponse-wrapped tool
        .mockResolvedValueOnce(
          createMockResponse({ data: { id: 'resolved-id' } }, { url: 'https://api.test.com/starships/star-1/tools/calc' })
        )
        // Update tool
        .mockResolvedValueOnce(
          createMockResponse({ id: 'resolved-id', name: 'Updated' }, { url: 'https://api.test.com/tools/resolved-id' })
        );

      const input = { slug: 'calc', name: 'Updated' };
      const result = await executeToolWithMockEnv(input, env as never);

      expect(result).toBeDefined();
    });

    it('should resolve id by slug then update', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-1' };

      // First call resolves slug - return a tool object with id
      // Second call performs the update
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(createMockResponse({ id: 'resolved-id' }, { url: 'https://api.test.com/starships/star-1/tools/calc' }))
        .mockResolvedValueOnce(
          createMockResponse({ id: 'resolved-id', isEnabled: false }, { url: 'https://api.test.com/tools/resolved-id' })
        );

      const input = { slug: 'calc', isEnabled: false };
      const result = await executeToolWithMockEnv(input, env);

      expect(result).toBeDefined();

      // Verify calls
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(2);
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://api.test.com/starships/star-1/tools/calc');
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('https://api.test.com/tools/resolved-id');

      const updateOpts = (global.fetch as jest.Mock).mock.calls[1][1] as RequestInit;
      const updateBody = JSON.parse(String((updateOpts as unknown as Record<string, unknown>).body));
      expect(updateBody).toMatchObject({ isEnabled: false });
    });

    it('should error when no update fields provided', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-1' };
      await expect(executeToolWithMockEnv({ slug: 'tool-1' }, env)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('No update fields provided'),
      });
    });

    it('should handle HTTP errors gracefully (update request)', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-1' };

      (global.fetch as jest.Mock)
        // slug resolve OK
        .mockResolvedValueOnce(createMockResponse({ id: 'resolved-id' }, { url: 'https://api.test.com/starships/star-1/tools/nope' }))
        // update fails
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({ error: 'Not found' }),
          text: async () => JSON.stringify({ error: 'Not found' }),
        });

      await expect(executeToolWithMockEnv({ slug: 'nope', name: 'N' }, env)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('HTTP request failed'),
      });
    });

    it('should handle network failure', async () => {
      const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-1' };
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error: Connection refused'));

      await expect(executeToolWithMockEnv({ slug: 'x', name: 'N' }, env)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('Network error'),
      });
    });

    it('should handle trailing slashes in BASE_URL', async () => {
      const env = { BASE_URL: 'https://api.example.com///', AUTH_TOKEN: 't', STARSHIP_ID: 'star-1' };
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(createMockResponse({ id: 'tool-123' }))
        .mockResolvedValueOnce(createMockResponse({ id: 'tool-123', name: 'N' }));

      await executeToolWithMockEnv({ slug: 'calc', name: 'N' }, env);

      // Verify trimmed baseUrl for both GET and PUT
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://api.example.com/starships/star-1/tools/calc');
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('https://api.example.com/tools/tool-123');
    });
  });

  describe('Blueprint Implementation Details', () => {
    it('should have correct validate node implementation', () => {
      const bp = toolUpdateTool.blueprint;
      const validateNode = bp.nodes.find((n) => n.ref === 'validate');
      expect(validateNode).toBeDefined();
      expect(validateNode?.type).toBe('code');

      const params = (validateNode?.parameters || {}) as { code?: string };
      expect(params.code).toBeDefined();
      expect(params.code).toContain('baseUrl');
      expect(params.code).toContain('authToken');
      expect(params.code).toContain('starshipId');
      expect(params.code).toContain('hasSlugResolve');
      expect(params.code).toContain('patch');
    });

    it('should have resolve_decision conditional and HTTP nodes configured', () => {
      const bp = toolUpdateTool.blueprint;

      const conditional = bp.nodes.find((n) => n.ref === 'resolve_decision');
      expect(conditional?.type).toBe('conditional');

      const httpMaybe = bp.nodes.find((n) => n.ref === 'maybe_fetch_by_slug');
      const httpUpdate = bp.nodes.find((n) => n.ref === 'http_update');
      expect(httpMaybe?.type).toBe('http_request');
      expect(httpUpdate?.type).toBe('http_request');

      const httpParams = (httpUpdate?.parameters || {}) as Record<string, unknown>;
      expect(httpParams.url).toBeDefined();
      expect(httpParams.method).toBeDefined();
      expect(httpParams.headers).toBeDefined();
      expect(httpParams.timeout).toBeDefined();
    });
  });
});

describe('Tool.execute return value - tool_update', () => {
  it('should return a single ExecutionItem with HttpResponse and preserve pairedItem (update by slug)', async () => {
    const env = { BASE_URL: 'https://api.test.com', AUTH_TOKEN: 'abc', STARSHIP_ID: 'star-1' };

    // Mock GET (slug resolve) then PUT (update)
    global.fetch = jest.fn() as unknown as jest.Mock;
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(createMockResponse({ id: 'tool-123' }, { url: 'https://api.test.com/starships/star-1/tools/calc' }))
      .mockResolvedValueOnce(createMockResponse({ id: 'tool-123', name: 'Updated' }, { url: 'https://api.test.com/tools/tool-123' }));

    const options: NodeHandlerOptions = {
      eventCallback: jest.fn(),
      secureEnv: env,
      execution: ExecutionItemUtils.createExecution(),
    };

    const toolNode = new Tool(toolUpdateTool, options);
    const raw = await toolNode.execute([{ json: { slug: 'calc', name: 'Updated' }, pairedItem: { item: 5 } } as ExecutionItem]);

    // Raw ExecutionItem[] assertions
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).toHaveLength(1);

    const item = raw[0];
    expect(item.pairedItem).toEqual({ item: 5 });

    // Ensure HttpResponse shape
    const http = item.json as { status: number; url: string; body?: unknown };
    expect(http).toBeDefined();
    expect(typeof http.status).toBe('number');
    expect(http.url).toBe('https://api.test.com/tools/tool-123');

    // Body should contain server payload
    const body = http.body as { id?: string; name?: string } | undefined;
    expect(body?.id).toBe('tool-123');
    expect(body?.name).toBe('Updated');
  });
});
