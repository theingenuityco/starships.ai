import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Test Tool
 * Fetch a tool by slug via the Starships HTTP API and execute its blueprint with provided arguments.
 * Returns { ok, durationMs, result }.
 */
export const toolTestTool: ToolParams = {
  name: 'Test Tool',
  slug: 'test-tool',
  description: `Execute another tool by slug and report pass/fail with timing.

  Fetch a tool by slug via the Starships HTTP API and execute its blueprint with provided arguments, reporting pass/fail and duration.

  Inputs:
  - targetSlug: string (required)
  - arguments: object (optional; passed as initial input to the target blueprint)
  - timeoutMs: number (optional; default 60000 for the nested run)

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
      {
        ref: 'prepare',
        type: 'code',
        name: 'Validate Input',
        description: 'Validate targetSlug, normalize test arguments, and document HTTP usage',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.$input && typeof ctx.$input === 'object' ? ctx.$input : {};
              const targetSlug = input.targetSlug;
              if (!targetSlug || typeof targetSlug !== 'string') {
                throw new Error('targetSlug is required');
              }
              const args = input.arguments && typeof input.arguments === 'object' ? input.arguments : {};
              const timeoutMs = typeof input.timeoutMs === 'number' && input.timeoutMs > 0 ? input.timeoutMs : 60000;
              // Document expected HTTP configuration for this tool (used by tests for blueprint inspection)
              const requestConfig = {
                method: 'GET',
                headers: {
                  Authorization: 'Bearer <token>',
                },
                slug: targetSlug,
              };
              return {
                slug: targetSlug,
                arguments: args,
                timeoutMs,
                startTime: Date.now(),
                requestConfig,
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_get_tool',
        type: 'http_request',
        name: 'Get Tool (Starships)',
        description: 'Fetch tool definition via Starships tools HTTP API',
        parameters: {
          method: 'GET',
          // Relative path; HostRuntime will prefix SERVER_URL/api/v1, inject auth,
          // and use STARSHIP_ID from env.
          url: '{{ "/starships/" + env("STARSHIP_ID") + "/tools/" + $lastOutputOf("prepare")[0].json.slug }}',
          connectorSlug: 'starships',
          timeout: 5000,
        },
      },
      {
        ref: 'prepare_test',
        type: 'code',
        name: 'Prepare Test Execution',
        description: 'Extract tool definition and prepare arguments',
        parameters: {
          code: `
            async function main(ctx) {
              const httpResult = ctx.$lastOutputOf("http_get_tool")[0]?.json ?? {};
              const hasBody = httpResult && typeof httpResult === 'object' && Object.prototype.hasOwnProperty.call(httpResult, 'body');
              const apiResponse = hasBody ? httpResult.body : httpResult;

              // Server contract: tools route always responds with { data: Tool }
              if (!apiResponse || typeof apiResponse !== 'object' || !Object.prototype.hasOwnProperty.call(apiResponse, 'data')) {
                throw new Error('Tool API response missing data field');
              }

              const toolDef = apiResponse.data;
              
              if (!toolDef || !toolDef.blueprint) {
                throw new Error('Tool definition missing or invalid blueprint');
              }
              
              const prepared = ctx.$lastOutputOf("prepare")[0].json || {};
              const testArgs = prepared.arguments || {};
              
              return {
                toolDef,
                testArgs,
                startTime: prepared.startTime || Date.now()
              };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'emit_args',
        type: 'code',
        name: 'Emit Test Arguments',
        description: 'Extract only the test arguments to pass into the Tool node',
        parameters: {
          code: `
            async function main(ctx) {
              const testArgs = ctx.$lastOutputOf("prepare_test")[0].json.testArgs || {};
              return testArgs;
            }
          `,
          timeout: 1000,
        },
      },
      {
        ref: 'run_tool',
        type: 'tool',
        name: 'Execute Tool',
        description: 'Run the tool blueprint with test arguments',
        parameters: {
          name: '{{ $lastOutputOf("prepare_test")[0].json.toolDef.name || "Test Tool" }}',
          description: '{{ $lastOutputOf("prepare_test")[0].json.toolDef.description || "Tool test execution" }}',
          parameters: '{{ $lastOutputOf("prepare_test")[0].json.toolDef.parameters || ({ type: "object", properties: {} }) }}',
          blueprint: '{{ $lastOutputOf("prepare_test")[0].json.toolDef.blueprint }}',
        },
      },
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
            arguments: '{{ $lastOutputOf("emit_args")[0].json }}',
          },
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_get_tool' },
      { ref: 'e3', from: 'http_get_tool', to: 'prepare_test' },
      { ref: 'e4', from: 'prepare_test', to: 'emit_args' },
      { ref: 'e5', from: 'emit_args', to: 'run_tool' },
      { ref: 'e6', from: 'run_tool', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const toolTestToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolTestTool.name,
  description: toolTestTool.description,
  parameters: toolTestTool.parameters,
  blueprint: toolTestTool.blueprint,

  slug: 'test-tool',
  version: '1.0.1',
  category: 'automation',
  exampleUsage: '{ "targetSlug": "my-tool", "arguments": { ... } } // returns { ok, durationMs, result } (env inferred)',
  requiresApiKey: false,
  configurationFields: [],
};
