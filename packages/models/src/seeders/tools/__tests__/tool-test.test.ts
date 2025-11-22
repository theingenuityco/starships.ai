/**
 * Test Tool - E2E
 * Executes test-tool using real Autopilot execution with mocked HTTP only
 */

import { toolTestTool, toolTestToolTemplate } from '../test-tool';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, NodeHandlerOptions, HostRuntime } from '@starships/autopilot';

// Helper to create a realistic HttpResponse-like object for our HttpRequest node
function createMockResponse(
  body: unknown,
  {
    status = 200,
    statusText = 'OK',
    url = 'https://api.test.com/starships/test-starship/tools/demo',
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
    headers: headers ?? {},
    url,
    body,
  };
}

describe('Tool Test Tool', () => {
  describe('Tool Structure Validation', () => {
    it('should have valid tool structure', () => {
      expect(toolTestTool.name).toBe('Test Tool');
      expect(toolTestTool.description).toContain('Execute another tool');
      expect(toolTestTool.parameters).toBeDefined();
      expect(toolTestTool.blueprint).toBeDefined();
    });

    it('should require targetSlug parameter', () => {
      const req = toolTestTool.parameters.required || [];
      expect(req).toEqual(expect.arrayContaining(['targetSlug']));
    });

    it('should have the expected nodes and connectivity', () => {
      const bp = toolTestTool.blueprint;
      const nodeRefs = new Set(bp.nodes.map((n) => n.ref));

      // Required nodes present
      const requiredRefs = ['start_1', 'prepare', 'http_get_tool', 'prepare_test', 'emit_args', 'run_tool', 'end_1'];
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
      expect(toolTestToolTemplate.name).toBe(toolTestTool.name);
      expect(toolTestToolTemplate.description).toBe(toolTestTool.description);
      expect(toolTestToolTemplate.parameters).toEqual(toolTestTool.parameters);
      expect(toolTestToolTemplate.blueprint).toEqual(toolTestTool.blueprint);
      expect(toolTestToolTemplate.slug).toBe('test-tool');
      expect(toolTestToolTemplate.category).toBe('automation');
      expect(toolTestToolTemplate.requiresApiKey).toBe(false);
    });
  });

  describe('Real Tool Execution', () => {
    async function executeToolWithMockConfig(input: unknown, hostRuntime: HostRuntime) {
      const options: NodeHandlerOptions = {
        eventCallback: jest.fn(),
        runtimeEnv: { STARSHIP_ID: 'test-starship' },
        hostRuntime,
        execution: ExecutionItemUtils.createExecution(),
      };

      const toolNode = new Tool(toolTestTool, options);

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
              output: '{{ lastOutputOf("__initial__") }}',
            },
          },
        ],
        edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
        metadata: {},
      };
    }

    it('should fail when targetSlug is missing', async () => {
      const hostRuntime: HostRuntime = {
        http: jest.fn(async () => createMockResponse({})) as unknown as HostRuntime['http'],
      };
      await expect(executeToolWithMockConfig({}, hostRuntime)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('targetSlug is required'),
      });
    });

    it('should execute nested tool blueprint and return result with duration', async () => {
      const input = {
        targetSlug: 'demo',
        arguments: { foo: 'bar', n: 7 },
      };

      const nested = makeNestedEchoBlueprint();
      const hostRuntime: HostRuntime = {
        http: jest.fn(async ({ method, url, connector }) => {
          expect(method).toBe('GET');
          expect(connector).toBe('starships');
          expect(url).toBe('/starships/test-starship/tools/demo');

          // Tools API contract: { data: Tool }
          return createMockResponse({
            data: {
              name: 'Nested Echo Tool',
              slug: 'nested-echo',
              description: 'Echo initial arguments from __initial__',
              parameters: { type: 'object', properties: {} },
              blueprint: nested,
            },
          });
        }) as unknown as HostRuntime['http'],
      };

      const result = (await executeToolWithMockConfig(input, hostRuntime)) as {
        ok: boolean;
        durationMs: number;
        result: Record<string, unknown>;
      };

      expect(result).toBeDefined();
      expect(result.ok).toBe(true);
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.result).toEqual({ foo: 'bar', n: 7 });
    });

    it('should pass through provided arguments to nested workflow', async () => {
      const nested = makeNestedEchoBlueprint();
      const hostRuntime: HostRuntime = {
        http: jest.fn(async () =>
          createMockResponse({
            data: {
              name: 'Nested Echo Tool',
              slug: 'nested-echo',
              description: 'Echo initial arguments from __initial__',
              parameters: { type: 'object', properties: {} },
              blueprint: nested,
            },
          })
        ) as unknown as HostRuntime['http'],
      };

      const args = { a: 1, b: { deep: true } };
      const result = (await executeToolWithMockConfig({ targetSlug: 'echoer', arguments: args }, hostRuntime)) as {
        ok: boolean;
        result: Record<string, unknown>;
      };
      expect(result.ok).toBe(true);
      expect(result.result).toEqual(args);
    });
  });

  describe('Blueprint Implementation Details', () => {
    it('should have correct prepare node implementation', () => {
      const bp = toolTestTool.blueprint;
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
      const bp = toolTestTool.blueprint;
      const run = bp.nodes.find((n) => n.ref === 'run_tool');
      expect(run?.type).toBe('tool');
      const params = (run?.parameters || {}) as Record<string, unknown>;
      // Template references the resolved tool definition from prepare_test
      expect(JSON.stringify(params)).toContain('prepare_test');
      expect(JSON.stringify(params)).toContain('toolDef');
      expect(JSON.stringify(params)).toContain('blueprint');
    });

    it('should compute duration in end node', () => {
      const bp = toolTestTool.blueprint;
      const end = bp.nodes.find((n) => n.ref === 'end_1');
      expect(end?.type).toBe('end');
      const params = (end?.parameters || {}) as Record<string, unknown>;
      expect(JSON.stringify(params)).toContain('durationMs');
      expect(JSON.stringify(params)).toContain('prepare_test');
    });
  });
});

describe('Tool.execute return value - test-tool', () => {
  it('should return a single ExecutionItem with final test result and preserve pairedItem', async () => {
    // Nested blueprint echoes initial args
    const nested = {
      nodes: [
        { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
        {
          ref: 'end_1',
          type: 'end',
          name: 'End',
          description: '',
          parameters: {
            output: '{{ lastOutputOf("__initial__") }}',
          },
        },
      ],
      edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
      metadata: {},
    };

    const hostRuntime: HostRuntime = {
      http: jest.fn(async () =>
        createMockResponse({
          data: {
            name: 'Nested Echo Tool',
            slug: 'nested-echo',
            description: 'Echo initial arguments from __initial__',
            parameters: { type: 'object', properties: {} },
            blueprint: nested,
          },
        })
      ) as unknown as HostRuntime['http'],
    };
    const args = { x: 1, y: { deep: true } };
    const options: NodeHandlerOptions = {
      eventCallback: jest.fn(),
      runtimeEnv: {},
      hostRuntime,
      execution: ExecutionItemUtils.createExecution(),
    };

    const toolNode = new Tool(toolTestTool, options);
    const raw = await toolNode.execute([{ json: { targetSlug: 'demo', arguments: args }, pairedItem: { item: 7 } } as ExecutionItem]);

    // Raw ExecutionItem[] assertions
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).toHaveLength(1);

    const item = raw[0];
    expect(item.pairedItem).toEqual({ item: 7 });

    // Final payload should be the End node "output" extracted by Engine, not wrapped
    const payload = item.json as { ok: boolean; durationMs: number; result: Record<string, unknown> };
    expect(payload).toBeDefined();
    expect(payload.ok).toBe(true);
    expect(typeof payload.durationMs).toBe('number');
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);
    expect(payload.result).toEqual(args);
  });
});
