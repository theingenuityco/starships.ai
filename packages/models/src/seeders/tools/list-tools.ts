import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: List Tools
 * List all tools for the specified starship using server REST API
 */
export const toolListTool: ToolParams = {
  name: 'List Tools',
  slug: 'list-tools',
  description:
    'List all tools deployed on the current starship for discovery (not a permission list). Returns a lean array (slug, name, description, category) without heavy fields like blueprint.',
  parameters: {
    type: 'object',
    properties: {},
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'http_list',
        type: 'connector_action',
        name: 'List Tools (Starships)',
        description: 'List tools via Starships connector action',
        parameters: {
          connector: 'starships',
          action: 'list-tools',
          failOnNon2xx: true,
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'summarize',
        type: 'code',
        name: 'Summarize Tools',
        description: 'Strip heavy fields (e.g., blueprint) and return a lean list',
        parameters: {
          code: `
            async function main(ctx) {
              // Expect the HTTP node to return a response object with { status, headers, body, url }.
              // The body may be a bare array of tools or an object with a data array property.
              const raw = ctx.input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;

              const isObject = payload && typeof payload === 'object';
              const data = isObject && Array.isArray(payload.data)
                ? payload.data
                : (Array.isArray(payload) ? payload : []);

              // Return a lean summary to avoid leaking large/templated blueprint contents
              return data.map((t) => ({
                slug: t && t.slug,
                name: t && t.name,
                description: t && t.description,
                category: t && t.category,
              }));
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ lastOutputOf("summarize") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'http_list' },
      { ref: 'e2', from: 'http_list', to: 'summarize' },
      { ref: 'e3', from: 'summarize', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const toolListToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolListTool.name,
  description: toolListTool.description,
  parameters: toolListTool.parameters,
  blueprint: toolListTool.blueprint,

  slug: 'list-tools',
  version: '1.0.6',
  category: 'automation',
  exampleUsage: '{} // returns a lean array of tools; env (baseUrl, authToken, starshipId) is inferred',
  requiresApiKey: false,
  configurationFields: [],
};
