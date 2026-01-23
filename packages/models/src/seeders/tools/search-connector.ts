import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Search Connector
 * Search connector templates (catalog) by query via the Starships HTTP API.
 */
export const connectorSearchTool: ToolParams = {
  name: 'Search Connector',
  slug: 'search-connector',
  description:
    'Search connector templates (catalog) by query and return a ranked list of matching connectors (supports limit; empty query returns a lightweight listing).',
  parameters: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Search query. Empty returns a lightweight listing.' },
      limit: { type: 'number', description: 'Maximum number of results to return (1-100).' },
    },
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Payload',
        description: 'Normalize query and limit for connector payload',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
              const q = typeof input.q === 'string' ? input.q : '';
              const limit = typeof input.limit === 'number' && input.limit >= 1 && input.limit <= 100 ? Math.floor(input.limit) : 20;
              return { q, limit };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'http_search',
        type: 'connector_action',
        name: 'Search Connectors (Starships)',
        description: 'Search connector templates via Starships connector endpoint',
        parameters: {
          connector: 'starships',
          action: 'search-connector',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("prepare") }}',
          timeout: 5000,
        },
      },
      {
        ref: 'extract',
        type: 'code',
        name: 'Extract Payload',
        description: 'Return connector payload (prefer data when present)',
        parameters: {
          code: `
            async function main(ctx) {
              const raw = ctx.input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;
              if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) {
                return payload.data;
              }
              return payload;
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
          output: '{{ lastOutputOf("extract") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_search' },
      { ref: 'e3', from: 'http_search', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const connectorSearchToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: connectorSearchTool.name,
  description: connectorSearchTool.description,
  parameters: connectorSearchTool.parameters,
  blueprint: connectorSearchTool.blueprint,

  slug: 'search-connector',
  version: '1.0.0',
  category: 'automation',
  exampleUsage: '{ "q": "slack", "limit": 10 } // returns search results; env baseUrl inferred',
  requiresApiKey: false,
  configurationFields: [],
};
