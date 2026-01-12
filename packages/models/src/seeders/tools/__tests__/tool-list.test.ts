/**
 * Tool List Tool Tests
 * End-to-end tests using real autopilot Tool execution with minimal HTTP mocking
 */

import { toolListTool, toolListToolTemplate } from '../list-tools';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, NodeHandlerOptions, Edge, HostRuntime } from '@starships/autopilot';
import { TOOL_DESCRIPTION_MAX_LENGTH } from '@/constants/toolValidation';

// Helper to create a realistic HttpResponse-like object for our HttpRequest node
function createMockResponse(
  body: unknown,
  {
    ok = true,
    status = 200,
    statusText = 'OK',
    url = 'https://api.test.com/starships/test-starship-123/tools',
    headers = {},
  }: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    url?: string;
    headers?: Record<string, unknown>;
  } = {}
) {
  return {
    ok,
    status,
    statusText,
    headers: headers ?? {},
    url,
    body,
  };
}

describe('Tool List Tool', () => {
  describe('Tool Structure Validation', () => {
    it('should have valid tool structure', () => {
      expect(toolListTool.name).toBe('List Tools');
      expect(toolListTool.description).toContain('List all tools deployed');
      expect(toolListTool.description.length).toBeGreaterThan(10);
      expect(toolListTool.description.length).toBeLessThanOrEqual(TOOL_DESCRIPTION_MAX_LENGTH);
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
      expect(nodeTypes).toContain('connector_action');

      // Verify node connectivity
      const nodeRefs = new Set(blueprint.nodes.map((n) => n.ref));
      for (const edge of blueprint.edges) {
        expect(nodeRefs.has(edge.from)).toBe(true);
        expect(nodeRefs.has(edge.to)).toBe(true);
      }
    });

    it('should have sequential flow: start -> http_list -> summarize -> end', () => {
      const blueprint = toolListTool.blueprint;
      const edges = blueprint.edges;

      const hasCorrectFlow = [
        edges.some((e: Edge) => e.from === 'start_1' && e.to === 'http_list'),
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

      expect(toolListToolTemplate.slug).toBe('list-tools');
      expect(toolListToolTemplate.category).toBe('automation');
      expect(toolListToolTemplate.requiresApiKey).toBe(false);
      expect(toolListToolTemplate.exampleUsage).toBeDefined();
    });
  });

  describe('Blueprint Implementation Details', () => {
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
      }
    });

    it('should have correct HTTP request node configuration', () => {
      const blueprint = toolListTool.blueprint;
      const httpNode = blueprint.nodes.find((n) => n.ref === 'http_list');

      expect(httpNode).toBeDefined();
      expect(httpNode?.type).toBe('connector_action');

      if (httpNode?.parameters) {
        const params = httpNode.parameters as Record<string, unknown>;
        expect(params.timeout).toBeDefined();
        expect(params.connector).toBe('starships');
        expect(params.action).toBe('list-tools');
      }
    });
  });
});

describe('Tool.execute return value - list-tools', () => {
  it('should return a single ExecutionItem with summarized tool list and preserved pairedItem', async () => {
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

    // Local HostRuntime mock for this test
    const hostRuntime: HostRuntime = {
      http: jest.fn(async () =>
        createMockResponse(mockResponseData, {
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.test.com/starships/test-starship-123/tools',
        })
      ) as unknown as HostRuntime['http'],
      connectorAction: jest.fn(async () =>
        createMockResponse(mockResponseData, {
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'connector://starships/list-tools',
        })
      ) as unknown as HostRuntime['connectorAction'],
    };

    const options: NodeHandlerOptions = {
      eventCallback: jest.fn(),
      runtimeEnv: {
        STARSHIP_ID: 'test-starship-123',
      },
      hostRuntime,
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
      category: (t as { category?: string }).category,
    }));
    expect(item.json).toEqual(expected);
  });
});
