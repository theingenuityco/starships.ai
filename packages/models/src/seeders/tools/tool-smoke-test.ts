import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: tool_smoke_test
 * Fetch a tool by slug from the server and execute its blueprint with provided arguments.
 * Returns { ok, durationMs, result }.
 */
export const toolSmokeTestTool: ToolParams = {
  name: 'tool_smoke_test',
  description: 'Execute another tool (by slug) with provided arguments and return pass/fail with duration.',
  parameters: {
    type: 'object',
    properties: {
      targetSlug: { type: 'string', description: 'Slug of the tool to execute' },
      arguments: {
        type: 'object',
        description: 'Arguments object to pass to the target tool blueprint',
        properties: {},
      },
      timeoutMs: { type: 'number', description: 'Optional timeout for the nested run (ms)' },
    },
    required: ['targetSlug'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },

      // Build URL and headers
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL and headers for GET /starships/:starshipId/tools/:slug',
        parameters: {
          code: `
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            const starshipId = env('STARSHIP_ID');
            const targetSlug = input.targetSlug;
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');
            if (!targetSlug) throw new Error('targetSlug is required');

            return {
              url: \`\${baseUrl}/starships/\${starshipId}/tools/\${targetSlug}\`,
              method: 'GET',
              headers: {
                'Authorization': \`Bearer \${authToken}\`,
                'Content-Type': 'application/json',
              }
            };
          `,
          timeout: 3000,
        },
      },

      // Fetch the tool instance JSON (expects blueprint property)
      {
        ref: 'http_get_tool',
        type: 'http_request',
        name: 'Get Tool',
        description: 'GET /starships/:starshipId/tools/:slug',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 8000,
        },
      },

      // Capture original "arguments" (from __initial__) into current stream as "dummy"
      {
        ref: 'capture_args',
        type: 'transform',
        name: 'Capture Arguments',
        description: 'Attach initial arguments under dummy for later extraction',
        parameters: {
          transforms: [
            {
              operation: 'add',
              path: '/dummy',
              value: '{{ $lastOutputOf("__initial__")[0].json.arguments ?? {} }}',
            },
          ],
        },
      },

      // Mark t0 and expose args in a clean envelope
      {
        ref: 'mark_time',
        type: 'code',
        name: 'Mark Start Time',
        description: 'Record t0 and carry args forward',
        parameters: {
          code: `
            return {
              t0: Date.now(),
              args: (input && typeof input === 'object' && input !== null) ? (input.dummy ?? {}) : {}
            };
          `,
          timeout: 2000,
        },
      },

      // Emit only the args object so the nested Workflow receives them as initial input
      {
        ref: 'emit_args',
        type: 'code',
        name: 'Emit Arguments',
        description: 'Return plain args for nested workflow input',
        parameters: {
          code: `
            return (input && typeof input === 'object' && input !== null) ? (input.args ?? {}) : {};
          `,
          timeout: 2000,
        },
      },

      // Run the fetched tool's blueprint as a nested workflow with the provided args
      {
        ref: 'run_tool',
        type: 'workflow',
        name: 'Run Target Tool',
        description: 'Execute target tool blueprint with provided arguments',
        parameters: {
          name: 'Nested Tool Execution',
          description: 'Smoke test runner',
          // Blueprint reference from fetch step (server returns ApiResponse<ToolModel> { data: ToolModel })
          blueprint: '{{ $lastOutputOf("http_get_tool")[0].json.body.data.blueprint }}',
          // If you want to allow timeout override via inputs:
          // timeout: '{{ $lastOutputOf("__initial__")[0].json.timeoutMs ?? 60000 }}'
          timeout: 60000,
        },
      },

      // Return summary
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: {
            ok: true,
            durationMs: '{{ Date.now() - $lastOutputOf("mark_time")[0].json.t0 }}',
            result: '{{ $lastOutputOf("run_tool")[0].json }}',
          },
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_get_tool' },
      { ref: 'e3', from: 'http_get_tool', to: 'capture_args' },
      { ref: 'e4', from: 'capture_args', to: 'mark_time' },
      { ref: 'e5', from: 'mark_time', to: 'emit_args' },
      { ref: 'e6', from: 'emit_args', to: 'run_tool' },
      { ref: 'e7', from: 'run_tool', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: tool_smoke_test
 */
export const toolSmokeTestToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolSmokeTestTool.name,
  description: toolSmokeTestTool.description,
  parameters: toolSmokeTestTool.parameters,
  blueprint: toolSmokeTestTool.blueprint,

  slug: 'tool-smoke-test',
  category: 'automation',
  exampleUsage: 'Smoke test: { "targetSlug": "my-tool", "arguments": { ... } } (starshipId/baseUrl/authToken inferred from state)',
  requiresApiKey: false,
  configurationFields: [],
};
