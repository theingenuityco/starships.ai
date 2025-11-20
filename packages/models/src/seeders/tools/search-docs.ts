import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Search Docs
 * Query Starships documentation via the internal starships-ai connector.
 */
export const docsSearchTool: ToolParams = {
  name: 'Search Docs',
  slug: 'search-docs',
  description: `Search Starships documentation and return a ranked list of matching docs.

Inputs:
- q: string (search query; empty returns a lightweight listing)
- limit?: number (max items to return; default 20)

Output:
- { query: string, count: number, results: Array<{ slug, title, excerpt? }>, sourceDir: string }

Behavior and limits:
- Read-only and idempotent
- Timeouts: prepare 3s, HTTP 5s
- Typical failures: missing baseUrl, network errors, server unavailability`,
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
              const input = ctx.$input && typeof ctx.$input === 'object' ? ctx.$input : {};
              const q = typeof input.q === 'string' ? input.q : '';
              const limit = typeof input.limit === 'number' ? input.limit : undefined;
              return { q, limit };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'integration_search',
        type: 'integration',
        name: 'Search Docs (Starships)',
        description: 'Search documentation via starships-ai connector',
        parameters: {
          connectorSlug: 'starships-ai',
          operation: 'docs.search',
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
              const payload = ctx.$input;
              if (payload && typeof payload === 'object' && payload.data !== undefined) {
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
          output: '{{ $lastOutputOf("extract")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'integration_search' },
      { ref: 'e3', from: 'integration_search', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const docsSearchToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: docsSearchTool.name,
  description: docsSearchTool.description,
  parameters: docsSearchTool.parameters,
  blueprint: docsSearchTool.blueprint,

  slug: 'search-docs',
  version: '1.0.1',
  category: 'data',
  exampleUsage: '{ "q": "tools", "limit": 10 } // returns search results; env baseUrl inferred',
  requiresApiKey: false,
  configurationFields: [],
};
