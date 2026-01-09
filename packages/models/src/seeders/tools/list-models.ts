import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: list_models
 * List canonical models from the Starships model catalog.
 */
export const modelsListTool: ToolParams = {
  name: 'List Models',
  slug: 'list-models',
  description: `List all available LLM models.

When to use:
- Before creating or editing an agent to choose the most appropriate model
- To check which canonical models are enabled on this instance

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
- Backed by the instance model catalog (DB)
- Timeouts: prepare 3s, HTTP 10s
- Typical failures: 401/403, network errors`,
  parameters: {
    type: 'object',
    properties: {},
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'http_models',
        type: 'connector_action',
        name: 'List Models (Starships)',
        description: 'List models via Starships model catalog',
        parameters: {
          connector: 'starships',
          action: 'list-models',
          args: {},
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
              const raw = ctx.input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;
              const isObject = payload && typeof payload === 'object';
              const data = isObject && Array.isArray(payload.data)
                ? payload.data
                : (Array.isArray(payload) ? payload : []);

              // Return only model identifiers (prefer canonical model id).
              const ids = (Array.isArray(data) ? data : [])
                .map((m) => (m && (m.model || m.id || m.name)))
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
          output: '{{ lastOutputOf("process") }}',
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

  slug: 'list-models',
  version: '1.0.4',
  category: 'automation',
  exampleUsage: '{} // returns array of model IDs as strings (e.g., "anthropic/claude-sonnet-4.5")',
  requiresApiKey: false,
  configurationFields: [],
};


