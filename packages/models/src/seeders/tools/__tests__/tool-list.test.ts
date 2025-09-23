/**
 * Tool List Tool Tests
 * End-to-end tests using real autopilot Tool execution with minimal HTTP mocking
 */

import { toolListTool, toolListToolTemplate } from '../tool-list';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, NodeHandlerOptions, Edge } from '@starships/autopilot';

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

    it('should fail when missing environment variables', async () => {
      await expect(executeToolWithMockEnv({}, {})).rejects.toThrow('baseUrl is required');
    });

    it('should fail without auth token', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.test.com',
        STARSHIP_ID: 'test-starship-123',
        // Missing AUTH_TOKEN
      };

      await expect(executeToolWithMockEnv({}, mockEnv)).rejects.toThrow('authToken is required');
    });

    it('should fail without starship ID', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.test.com',
        AUTH_TOKEN: 'mock-token',
        // Missing STARSHIP_ID
      };

      await expect(executeToolWithMockEnv({}, mockEnv)).rejects.toThrow('starshipId is required');
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

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseData,
        text: async () => JSON.stringify(mockResponseData),
      });

      const result = await executeToolWithMockEnv({}, mockEnv);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // Verify the result structure matches what summarize node should produce
      const toolList = result as Array<{
        id: string;
        slug: string;
        name: string;
        description: string;
        isEnabled: boolean;
      }>;

      expect(toolList.length).toBe(2);
      expect(toolList[0]).toEqual({
        id: 'tool-1',
        slug: 'calculator',
        name: 'Calculator',
        description: 'Perform mathematical calculations',
        isEnabled: true,
      });
      expect(toolList[1]).toEqual({
        id: 'tool-2',
        slug: 'echo',
        name: 'Echo',
        description: 'Echo back the input',
        isEnabled: true,
      });

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

      await expect(executeToolWithMockEnv({}, mockEnv)).rejects.toThrow('Network error');
    });

    it('should handle trailing slashes in BASE_URL', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.example.com///',
        AUTH_TOKEN: 'test-token',
        STARSHIP_ID: 'starship-123',
      };

      const mockResponseData = { data: [] };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseData,
        text: async () => JSON.stringify(mockResponseData),
      });

      const result = await executeToolWithMockEnv({}, mockEnv);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseData,
        text: async () => JSON.stringify(mockResponseData),
      });

      // Tool doesn't require input parameters, so various inputs should work
      const inputs = [{ invalid: 'parameter' }, 123, 'string-input', null, undefined];

      for (const input of inputs) {
        const result = await executeToolWithMockEnv(input, mockEnv);
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
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

      await expect(executeToolWithMockEnv({}, mockEnv)).rejects.toThrow();
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
        expect(params.code).toContain('id');
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
