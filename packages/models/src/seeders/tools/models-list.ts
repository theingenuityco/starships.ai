import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: models_list
 * List all available OpenRouter models via the Starships HTTP API.
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
        ref: 'http_models',
        type: 'http_request',
        name: 'List Models (Starships)',
        description: 'List models via Starships OpenRouter proxy API',
        parameters: {
          method: 'GET',
          // Relative path; HostRuntime will prefix SERVER_URL/api/v1 and inject auth.
          url: '/openrouter/models',
          connectorSlug: 'starships',
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
              const raw = ctx.$input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;
              const isObject = payload && typeof payload === 'object';
              const data = isObject && Array.isArray(payload.data)
                ? payload.data
                : (Array.isArray(payload) ? payload : []);

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
      { ref: 'e1', from: 'start_1', to: 'http_models' },
      { ref: 'e2', from: 'http_models', to: 'process' },
      { ref: 'e3', from: 'process', to: 'end_1' },
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
  version: '1.0.1',
  category: 'automation',
  exampleUsage: '{} // returns array of model IDs as strings (e.g., "anthropic/claude-sonnet-4.5")',
  requiresApiKey: false,
  configurationFields: [],
};
