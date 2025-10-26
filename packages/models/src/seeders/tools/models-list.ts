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
- Array of models with { id, name, description, context_length, pricing, architecture }
- Model IDs use provider/model format (e.g., "anthropic/claude-sonnet-4.5", "openai/gpt-4o")

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
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            if (!authToken) throw new Error('authToken is required');

            return {
              url: \`\${baseUrl}/openrouter/models\`,
              method: 'GET',
              headers: {
                'Authorization': \`Bearer \${authToken}\`,
                'Content-Type': 'application/json'
              }
            };
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
            // Input is the HttpResponse from http_list
            const http = input;
            const body = http && typeof http === 'object' ? http.body : http;
            // Server sendSuccess returns { data: T }, so prefer body.data when present
            const data = (body && typeof body === 'object' && Array.isArray(body.data))
              ? body.data
              : (Array.isArray(body) ? body : []);

            // Return useful model information
            return data.map((m) => ({
              id: m && m.id,
              name: m && m.name,
              description: m && m.description,
              context_length: m && m.context_length,
              pricing: m && m.pricing,
              architecture: m && m.architecture,
              supported_parameters: m && m.supported_parameters,
            }));
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
  category: 'automation',
  exampleUsage: '{} // returns array of available models with id, name, description, context_length, pricing, etc.',
  requiresApiKey: false,
  configurationFields: [],
};
