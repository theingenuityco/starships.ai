/**
 * Tool List Tool Tests
 * End-to-end tests using real autopilot Tool execution with minimal HTTP mocking
 */

import { toolListTool, toolListToolTemplate } from '../list-tools';
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
      expect(toolListTool.name).toBe('List Tools');
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
      expect(nodeTypes).toContain('code'); // summarize
      expect(nodeTypes).toContain('integration');

      // Verify node connectivity
      const nodeRefs = new Set(blueprint.nodes.map((n) => n.ref));
      for (const edge of blueprint.edges) {
        expect(nodeRefs.has(edge.from)).toBe(true);
        expect(nodeRefs.has(edge.to)).toBe(true);
      }
    });

    it('should have sequential flow: start -> integration -> summarize -> end', () => {
      const blueprint = toolListTool.blueprint;
      const edges = blueprint.edges;

      const hasCorrectFlow = [
        edges.some((e: Edge) => e.from === 'start_1' && e.to === 'integration_list'),
        edges.some((e: Edge) => e.from === 'integration_list' && e.to === 'summarize'),
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

      expect(toolListToolTemplate.slug).toBe('list-tools');
      expect(toolListToolTemplate.category).toBe('automation');
      expect(toolListToolTemplate.requiresApiKey).toBe(false);
      expect(toolListToolTemplate.exampleUsage).toBeDefined();
    });
  });

  describe('Real Tool Execution (connector-backed)', () => {
    async function executeToolWithMockConnector(
      input: unknown,
      callConnector: (args: { slug: string; payload: Record<string, unknown> }) => Promise<unknown>
    ) {
      const options: NodeHandlerOptions = {
        eventCallback: jest.fn(),
        callConnector,
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

    it('should successfully execute with mocked connector response', async () => {
      const tools = [
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
      ];

      const callConnector = jest.fn(async ({ slug, payload }) => {
        expect(slug).toBe('starships-ai');
        expect(payload.operation).toBe('tools.list');
        return tools;
      });

      const result = await executeToolWithMockConnector({}, callConnector);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // Verify the result structure shape produced by summarize node
      const toolList = result as Array<{
        slug: string;
        name: string;
        description: string;
        isEnabled: boolean;
      }>;

      // Ensure we received an array and, when items exist, they have expected shape
      if (toolList.length > 0) {
        expect(toolList[0]).toHaveProperty('slug');
        expect(toolList[0]).toHaveProperty('name');
        expect(toolList[0]).toHaveProperty('description');
        expect(toolList[0]).toHaveProperty('isEnabled');
      }

      expect(callConnector).toHaveBeenCalledTimes(1);
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

describe('Tool.execute return value - list-tools', () => {
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
      runtimeConfig: mockEnv,
      execution: ExecutionItemUtils.createExecution(),
    };

    const toolNode = new Tool(toolListTool, options);
    const raw = await toolNode.execute([{ json: {}, pairedItem: { item: 0 } } as ExecutionItem]);

    // Raw ExecutionItem[] assertions
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).toHaveLength(1);

    const item = raw[0];
    expect(item.pairedItem).toEqual({ item: 0 });

    // Final result should be the summarized array produced by the "summarize" code node
    const expected = mockResponseData.data.map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      isEnabled: t.isEnabled,
    }));
    expect(item.json).toEqual(expected);
  });
});
