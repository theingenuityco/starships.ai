/**
 * Tool Get Tool Tests
 * E2E tests using real autopilot execution with mocked HTTP
 */

import { toolGetTool, toolGetToolTemplate } from '../get-tool';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, HostRuntime, NodeHandlerOptions } from '@starships/autopilot';

// Helper to create a realistic HostRuntime HTTP response for our HttpRequest node
function createMockHttpResponse(
  body: unknown,
  {
    status = 200,
    statusText = 'OK',
    url = '/starships/self/tools/calc',
    headers = {},
  }: {
    status?: number;
    statusText?: string;
    url?: string;
    headers?: Record<string, unknown>;
  } = {}
) {
  return {
    status,
    statusText,
    url,
    headers,
    body,
  };
}

describe('Tool Get Tool', () => {
  describe('Tool Structure Validation', () => {
    it('should have valid tool structure', () => {
      expect(toolGetTool.name).toBe('Get Tool');
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
      expect(toolGetToolTemplate.slug).toBe('get-tool');
      expect(toolGetToolTemplate.category).toBe('automation');
      expect(toolGetToolTemplate.requiresApiKey).toBe(false);
      expect(toolGetToolTemplate.exampleUsage).toBeDefined();
    });
  });

  describe('Real Tool Execution', () => {
    async function executeToolWithMockRuntime(input: unknown, hostRuntime: HostRuntime) {
      const options: NodeHandlerOptions = {
        eventCallback: jest.fn(),
        runtimeConfig: {},
        hostRuntime,
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

    it('should fail when slug is missing', async () => {
      const hostRuntime: HostRuntime = {
        http: jest.fn(async () => createMockHttpResponse({})) as HostRuntime['http'],
      };

      await expect(executeToolWithMockRuntime({}, hostRuntime)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('slug is required'),
      });
    });

    it('should successfully fetch tool by slug with mocked API response', async () => {
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

      const httpMock = jest.fn(async ({ method, url, connectorSlug }) => {
        expect(method).toBe('GET');
        expect(connectorSlug).toBe('starships');
        expect(url).toBe('/starships/self/tools/calc');

        return createMockHttpResponse(apiPayload, {
          url: 'https://api.test.com/starships/test-starship/tools/calc',
        });
      }) as HostRuntime['http'];

      const hostRuntime: HostRuntime = { http: httpMock };

      const result = await executeToolWithMockRuntime({ slug: 'calc' }, hostRuntime);

      expect(result).toBeDefined();
      const tool = result as { id: string; slug: string; name: string };
      expect(tool.slug).toBe('calc');
      expect(tool.name).toBe('Calculator');
      expect(httpMock).toHaveBeenCalledTimes(1);
    });

    it('should handle HTTP errors gracefully', async () => {
      const httpMock = jest.fn(async ({ url }) =>
        createMockHttpResponse(
          { error: 'Not Found' },
          {
            status: 404,
            statusText: 'Not Found',
            url,
          }
        )
      ) as HostRuntime['http'];

      const hostRuntime: HostRuntime = { http: httpMock };

      await expect(executeToolWithMockRuntime({ slug: 'missing' }, hostRuntime)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('404 Not Found'),
      });
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
      expect(params.code).toContain('slug');
      expect(params.code).toContain('slug is required and must be a string');
    });

    it('should configure HTTP node correctly', () => {
      const bp = toolGetTool.blueprint;
      const http = bp.nodes.find((n) => n.ref === 'http_get');
      expect(http?.type).toBe('http_request');
      const params = (http?.parameters || {}) as Record<string, unknown>;
      expect(params.url).toBeDefined();
      expect(params.method).toBeDefined();
      expect(params.timeout).toBeDefined();
      expect(params.method).toBe('GET');
      expect(params.url).toBe('{{ "/starships/self/tools/" + $lastOutputOf("prepare")[0].json.slug }}');
      expect(params.connectorSlug).toBe('starships');
    });
  });
});
