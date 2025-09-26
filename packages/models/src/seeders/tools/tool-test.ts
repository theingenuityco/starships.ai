import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: tool_test
 * Fetch a tool by slug from the server and execute its blueprint with provided arguments.
 * Returns { ok, durationMs, result }.
 */
export const toolTestTool: ToolParams = {
  name: 'tool_test',
  description: `Execute another tool by slug and report pass/fail with timing.

  Fetch a tool by slug from the server and execute its blueprint with provided arguments, reporting pass/fail and duration.

  Inputs:
  - targetSlug: string (required)
  - arguments: object (optional; passed as initial input to the target blueprint)
  - timeoutMs: number (optional; default 60000 for the nested run)

  Implicit environment (do not pass):
  - BASE_URL, AUTH_TOKEN, STARSHIP_ID from agent.state

  Output:
  - { ok: boolean, durationMs: number, result: any }

  Notes:
  - Running a tool may cause side effects defined by its blueprint
  - Use safe, non-destructive test inputs`,
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

      // Simplified: Prepare test execution with timing
      {
        ref: 'prepare_test',
        type: 'code',
        name: 'Prepare Test Execution',
        description: 'Extract tool definition and prepare arguments',
        parameters: {
          code: `
            const httpResult = $lastOutputOf("http_get_tool")[0].json;
            const toolDef = httpResult.body?.data || httpResult.body;
            
            if (!toolDef || !toolDef.blueprint) {
              throw new Error('Tool definition missing or invalid blueprint');
            }
            
            const testArgs = $lastOutputOf("__initial__")[0].json.arguments || {};
            
            return {
              toolDef,
              testArgs,
              startTime: Date.now()
            };
          `,
          timeout: 2000,
        },
      },

      // Execute the tool using workflow node with test arguments
      {
        ref: 'run_tool',
        type: 'workflow',
        name: 'Execute Tool Blueprint',
        description: 'Run the tool blueprint with test arguments',
        parameters: {
          name: '{{ $lastOutputOf("prepare_test")[0].json.toolDef.name || "Test Tool" }}',
          description: 'Tool test execution',
          blueprint: '{{ $lastOutputOf("prepare_test")[0].json.toolDef.blueprint }}',
          timeout: '{{ $lastOutputOf("__initial__")[0].json.timeoutMs || 60000 }}',
        },
      },

      // Return test results with timing
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: {
            ok: '{{ !$exists($lastOutputOf("run_tool")[0].error) }}',
            durationMs: '{{ Date.now() - $lastOutputOf("prepare_test")[0].json.startTime }}',
            result: '{{ $lastOutputOf("run_tool")[0].json }}',
            error: '{{ $lastOutputOf("run_tool")[0].error || null }}',
            toolName: '{{ $lastOutputOf("prepare_test")[0].json.toolDef.name }}',
            arguments: '{{ $lastOutputOf("prepare_test")[0].json.testArgs }}',
          },
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_get_tool' },
      { ref: 'e3', from: 'http_get_tool', to: 'prepare_test' },
      { ref: 'e4', from: 'prepare_test', to: 'run_tool' },
      { ref: 'e5', from: 'run_tool', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: tool_test
 */
export const toolTestToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolTestTool.name,
  description: toolTestTool.description,
  parameters: toolTestTool.parameters,
  blueprint: toolTestTool.blueprint,

  slug: 'tool-test',
  category: 'automation',
  exampleUsage: '{ "targetSlug": "my-tool", "arguments": { ... } } // returns { ok, durationMs, result } (env inferred)',
  requiresApiKey: false,
  configurationFields: [],
};
