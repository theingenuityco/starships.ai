import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: models_list
 * List all available OpenRouter models via the Starships API proxy
 */
export const modelsListTool: ToolParams = {
  name: 'List Models',
  slug: 'models-list',
  description: `List all available LLM models.

When to use:
- Before creating or editing an agent to choose the most appropriate model
- To discover new models that have been added to OpenRouter
- To check model capabilities, pricing, and context windows

Inputs:
- {} (no arguments)

Implicit environment (do not pass as arguments):
- BASE_URL: derived from agent.state.baseUrl
- AUTH_TOKEN: derived from agent.state.authToken (sent as Bearer)

Output:
  - Array of strings: model IDs (provider/model), e.g., "anthropic/claude-sonnet-4.5"
  - Returns only identifiers to minimize payload size and be directly usable

Model Selection Guidelines:
- For coding tasks: Look for models with "code" or "coding" in description
- For creative tasks: Use models with higher context windows and creative capabilities
- For fast responses: Choose smaller models (lower pricing usually indicates smaller size)
- For complex reasoning: Use frontier models like Claude Opus, GPT-4o, or o1-preview
- For cost efficiency: Compare pricing.prompt and pricing.completion fields

Behavior and limits:
- Read-only and idempotent
- Cached on server for 6 hours
- Timeouts: prepare 3s, HTTP 10s
- Typical failures: missing env, 401/403, network errors, OpenRouter API unavailability`,
  parameters: {
    type: 'object',
    properties: {},
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL and headers for OpenRouter models endpoint',
        parameters: {
          code: `
            async function main(ctx) {
              const baseUrl = (ctx.$env('BASE_URL') || '').replace(/\\/+$/, '');
              if (!baseUrl) throw new Error('BASE_URL is required');
              const authToken = ctx.$env('AUTH_TOKEN');
              if (!authToken) throw new Error('AUTH_TOKEN is required');

              return {
                url: String(baseUrl) + '/openrouter/models',
                method: 'GET',
                headers: {
                  'Authorization': 'Bearer ' + String(authToken),
                  'Content-Type': 'application/json'
                }
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_list',
        type: 'http_request',
        name: 'Fetch Models',
        description: 'GET /openrouter/models',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 10000,
        },
      },
      {
        ref: 'process',
        type: 'code',
        name: 'Process Models',
        description: 'Extract and format model data for easy consumption',
        parameters: {
          code: `
            async function main(ctx) {
              // Input is the HttpResponse from http_list
              const http = ctx.$input;
              const body = http && typeof http === 'object' ? http.body : http;
              // Server sendSuccess returns { data: T }, so prefer body.data when present
              const data = (body && typeof body === 'object' && Array.isArray(body.data))
                ? body.data
                : (Array.isArray(body) ? body : []);

              // Return only model identifiers (prefer id, fallback to name)
              const ids = (Array.isArray(data) ? data : [])
                .map((m) => (m && (m.id || m.name)))
                .filter((v) => typeof v === 'string' && v.length > 0);
              return ids;
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return model list',
        parameters: {
          output: '{{ $lastOutputOf("process")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_list' },
      { ref: 'e3', from: 'http_list', to: 'process' },
      { ref: 'e4', from: 'process', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const modelsListToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: modelsListTool.name,
  description: modelsListTool.description,
  parameters: modelsListTool.parameters,
  blueprint: modelsListTool.blueprint,

  slug: 'models-list',
  version: '1.0.0',
  category: 'automation',
  exampleUsage: '{} // returns array of model IDs as strings (e.g., "anthropic/claude-sonnet-4.5")',
  requiresApiKey: false,
  configurationFields: [],
};
