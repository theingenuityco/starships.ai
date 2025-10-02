/**
 * Tool List Tool Tests
 * End-to-end tests using real autopilot Tool execution with minimal HTTP mocking
 */

import { toolListTool, toolListToolTemplate } from '../tool-list';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, NodeHandlerOptions, Edge, BatchExecutionResult } from '@starships/autopilot';

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

describe('Tool List Tool', () => {
  beforeEach(() => {
    // Mock fetch globally for HTTP requests
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Tool Structure Validation', () => {
    it('should have valid tool structure', () => {
      expect(toolListTool.name).toBe('tool_list');
      expect(toolListTool.description).toContain('List all tools');
      expect(toolListTool.description.length).toBeGreaterThan(10);
      expect(toolListTool.parameters).toBeDefined();
      expect(toolListTool.blueprint).toBeDefined();
    });

    it('should have no required parameters', () => {
      expect(toolListTool.parameters.required).toBeUndefined();
      expect(toolListTool.parameters.properties).toEqual({});
    });

    it('should have valid blueprint structure', () => {
      const blueprint = toolListTool.blueprint;

      // Check basic structure
      expect(Array.isArray(blueprint.nodes)).toBe(true);
      expect(Array.isArray(blueprint.edges)).toBe(true);

      // Check for required nodes
      const nodeTypes = blueprint.nodes.map((n) => n.type);
      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('end');
      expect(nodeTypes).toContain('code'); // prepare and summarize
      expect(nodeTypes).toContain('http_request');

      // Verify node connectivity
      const nodeRefs = new Set(blueprint.nodes.map((n) => n.ref));
      for (const edge of blueprint.edges) {
        expect(nodeRefs.has(edge.from)).toBe(true);
        expect(nodeRefs.has(edge.to)).toBe(true);
      }
    });

    it('should have sequential flow: prepare -> http -> summarize -> end', () => {
      const blueprint = toolListTool.blueprint;
      const edges = blueprint.edges;

      const hasCorrectFlow = [
        edges.some((e: Edge) => e.from === 'prepare' && e.to === 'http_list'),
        edges.some((e: Edge) => e.from === 'http_list' && e.to === 'summarize'),
        edges.some((e: Edge) => e.from === 'summarize' && e.to === 'end_1'),
      ];

      expect(hasCorrectFlow.every(Boolean)).toBe(true);
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      expect(toolListToolTemplate.name).toBe(toolListTool.name);
      expect(toolListToolTemplate.description).toBe(toolListTool.description);
      expect(toolListToolTemplate.parameters).toEqual(toolListTool.parameters);
      expect(toolListToolTemplate.blueprint).toEqual(toolListTool.blueprint);

      expect(toolListToolTemplate.slug).toBe('tool-list');
      expect(toolListToolTemplate.category).toBe('automation');
      expect(toolListToolTemplate.requiresApiKey).toBe(false);
      expect(toolListToolTemplate.exampleUsage).toBeDefined();
    });
  });

  describe('Real Tool Execution', () => {
    async function executeToolWithMockEnv(input: unknown, mockEnv: Record<string, string>) {
      const options: NodeHandlerOptions = {
        eventCallback: jest.fn(),
        secureEnv: mockEnv,
        // Force in-process execution so HTTP mocking (global.fetch) works reliably in tests
        // This still runs the full Autopilot engine, only avoids child process isolation
        execution: ExecutionItemUtils.createExecution(),
      };

      const toolNode = new Tool(toolListTool, options);

      // Validate tool first
      const validation = toolNode.validate();
      expect(validation.valid).toBe(true);

      const inputData = input || {};
      const executionItem: ExecutionItem = {
        json: inputData,
        pairedItem: { item: 0 },
      };

      const result = await toolNode.execute([executionItem]);
      return ExecutionItemUtils.unwrapSingle(result);
    }

    it('should handle missing environment variables gracefully', async () => {
      const result = await executeToolWithMockEnv({}, {}) as BatchExecutionResult;
      expect(result).toMatchObject({
        successful: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            data: expect.any(Array)
          })
        ])
      });
      // Tool now succeeds but returns empty array when env vars are missing
      expect(result.successful[0].data).toEqual([]);
    });

    it('should handle missing auth token gracefully', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.test.com',
        STARSHIP_ID: 'test-starship-123',
        // Missing AUTH_TOKEN
      };

      const result = await executeToolWithMockEnv({}, mockEnv) as BatchExecutionResult;
      expect(result).toMatchObject({
        successful: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            data: expect.any(Array)
          })
        ])
      });
      // Tool now succeeds but returns empty array when auth token is missing
      expect(result.successful[0].data).toEqual([]);
    });

    it('should handle missing starship ID gracefully', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.test.com',
        AUTH_TOKEN: 'mock-token',
        // Missing STARSHIP_ID
      };

      const result = await executeToolWithMockEnv({}, mockEnv) as BatchExecutionResult;
      expect(result).toMatchObject({
        successful: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            data: expect.any(Array)
          })
        ])
      });
      // Tool now succeeds but returns empty array when starship ID is missing
      expect(result.successful[0].data).toEqual([]);
    });

    it('should successfully execute with mocked API response', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.test.com',
        AUTH_TOKEN: 'mock-auth-token',
        STARSHIP_ID: 'test-starship-123',
      };

      // Mock successful API response
      const mockResponseData = {
        data: [
          {
            id: 'tool-1',
            slug: 'calculator',
            name: 'Calculator',
            description: 'Perform mathematical calculations',
            isEnabled: true,
          },
          {
            id: 'tool-2',
            slug: 'echo',
            name: 'Echo',
            description: 'Echo back the input',
            isEnabled: true,
          },
        ],
      };

      (global.fetch as jest.Mock).mockImplementation(async () => createMockResponse(mockResponseData));

      const result = await executeToolWithMockEnv({}, mockEnv) as BatchExecutionResult;

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        successful: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            data: expect.any(Array)
          })
        ])
      });

      // Extract the data from the successful result for further validation
      const successfulResult = result.successful?.[0];
      if (successfulResult && Array.isArray(successfulResult.data) && successfulResult.data.length > 0) {
        const toolList = successfulResult.data;
        expect(toolList[0]).toHaveProperty('slug');
        expect(toolList[0]).toHaveProperty('name');
        expect(toolList[0]).toHaveProperty('description');
        expect(toolList[0]).toHaveProperty('isEnabled');
      }

      // Verify correct API call was made
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/starships/test-starship-123/tools',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-auth-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle API failure gracefully', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.test.com',
        AUTH_TOKEN: 'mock-auth-token',
        STARSHIP_ID: 'test-starship-123',
      };

      // Mock network failure
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error: Connection refused'));

      const result = await executeToolWithMockEnv({}, mockEnv) as BatchExecutionResult;
      expect(result).toMatchObject({
        successful: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            data: expect.any(Array)
          })
        ])
      });
      // Tool now succeeds but returns empty array on network failure
      expect(result.successful[0].data).toEqual([]);
    });

    it('should handle trailing slashes in BASE_URL', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.example.com///',
        AUTH_TOKEN: 'test-token',
        STARSHIP_ID: 'starship-123',
      };

      const mockResponseData = { data: [] };
      (global.fetch as jest.Mock).mockImplementation(async () => createMockResponse(mockResponseData));

      const result = await executeToolWithMockEnv({}, mockEnv) as BatchExecutionResult;

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        successful: expect.arrayContaining([
          expect.objectContaining({
            data: expect.any(Array)
          })
        ])
      });

      // Verify URL was cleaned up properly (no double slashes)
      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/starships/starship-123/tools', expect.any(Object));
    });

    it('should handle malformed input gracefully', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.test.com',
        AUTH_TOKEN: 'mock-auth-token',
        STARSHIP_ID: 'test-starship-123',
      };

      const mockResponseData = { data: [] };
      // Reuse the same successful mock for multiple iterations
      (global.fetch as jest.Mock).mockImplementation(async () => createMockResponse(mockResponseData));

      // Tool doesn't require input parameters, so various inputs should work
      const inputs = [{ invalid: 'parameter' }, 123, 'string-input', null, undefined];

      for (const input of inputs) {
        await expect(executeToolWithMockEnv(input, mockEnv)).resolves.toBeDefined();
      }
    });

    it('should handle HTTP errors gracefully', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.test.com',
        AUTH_TOKEN: 'mock-auth-token',
        STARSHIP_ID: 'test-starship-123',
      };

      // Mock HTTP error response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Starship not found' }),
        text: async () => JSON.stringify({ error: 'Starship not found' }),
      });

      const result = await executeToolWithMockEnv({}, mockEnv) as BatchExecutionResult;
      expect(result).toMatchObject({
        successful: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            data: expect.any(Array)
          })
        ])
      });
      // Tool now succeeds but returns empty array on HTTP errors
      expect(result.successful[0].data).toEqual([]);
    });
  });

  describe('Blueprint Implementation Details', () => {
    it('should have correct prepare node implementation', () => {
      const blueprint = toolListTool.blueprint;
      const prepareNode = blueprint.nodes.find((n) => n.ref === 'prepare');

      expect(prepareNode).toBeDefined();
      expect(prepareNode?.type).toBe('code');

      if (prepareNode?.parameters) {
        const params = prepareNode.parameters as { code: string };
        expect(params.code).toBeDefined();
        expect(params.code).toContain('baseUrl');
        expect(params.code).toContain('authToken');
        expect(params.code).toContain('starshipId');
        expect(params.code).toContain("method: 'GET'");
        expect(params.code).toContain('Authorization');
        expect(params.code).toContain('Bearer');
      }
    });

    it('should have correct summarize node implementation', () => {
      const blueprint = toolListTool.blueprint;
      const summarizeNode = blueprint.nodes.find((n) => n.ref === 'summarize');

      expect(summarizeNode).toBeDefined();
      expect(summarizeNode?.type).toBe('code');

      if (summarizeNode?.parameters) {
        const params = summarizeNode.parameters as { code: string };
        expect(params.code).toBeDefined();
        expect(params.code).toContain('map'); // Should process array
        expect(params.code).toContain('slug');
        expect(params.code).toContain('name');
        expect(params.code).toContain('description');
        expect(params.code).toContain('isEnabled');
      }
    });

    it('should have correct HTTP request node configuration', () => {
      const blueprint = toolListTool.blueprint;
      const httpNode = blueprint.nodes.find((n) => n.ref === 'http_list');

      expect(httpNode).toBeDefined();
      expect(httpNode?.type).toBe('http_request');

      if (httpNode?.parameters) {
        const params = httpNode.parameters as Record<string, unknown>;
        expect(params.url).toBeDefined();
        expect(params.method).toBeDefined();
        expect(params.headers).toBeDefined();
        expect(params.timeout).toBeDefined();
      }
    });
  });
});

describe('Tool.execute return value - tool_list', () => {
  it('should return a single ExecutionItem with summarized tool list and preserved pairedItem', async () => {
    const mockEnv = {
      BASE_URL: 'https://api.test.com',
      AUTH_TOKEN: 'mock-auth-token',
      STARSHIP_ID: 'test-starship-123',
    };

    const mockResponseData = {
      data: [
        {
          id: 'tool-1',
          slug: 'calculator',
          name: 'Calculator',
          description: 'Perform mathematical calculations',
          isEnabled: true,
        },
        {
          id: 'tool-2',
          slug: 'echo',
          name: 'Echo',
          description: 'Echo back the input',
          isEnabled: true,
        },
      ],
    };

    // Local fetch mock for this test
    global.fetch = jest.fn() as unknown as jest.Mock;
    (global.fetch as jest.Mock).mockImplementation(async () => createMockResponse(mockResponseData));

    const options: NodeHandlerOptions = {
      eventCallback: jest.fn(),
      secureEnv: mockEnv,
      execution: ExecutionItemUtils.createExecution(),
    };

    const toolNode = new Tool(toolListTool, options);
    const raw = await toolNode.execute([{ json: {}, pairedItem: { item: 0 } } as ExecutionItem]);

    // Tool execution returns ExecutionItem[] where batch result is in the json property
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).toHaveLength(1);

    const item = raw[0];
    expect(item.pairedItem).toEqual({ item: 0 });
    
    // The batch result is nested inside the json property
    const batchResult = item.json as BatchExecutionResult;
    expect(batchResult).toMatchObject({
      successful: expect.arrayContaining([
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      ])
    });

    // Extract the data from the successful result
    const successfulResult = batchResult.successful?.[0];
    expect(successfulResult).toBeDefined();
    
    // Final result should be the summarized array produced by the "summarize" code node
    const expected = mockResponseData.data.map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      isEnabled: t.isEnabled,
    }));
    expect(successfulResult.data).toEqual(expected);
  });
});
