import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Search Docs
 * Query Starships documentation via server REST API
 */
export const docsSearchTool: ToolParams = {
  name: 'Search Docs',
  slug: 'search-docs',
  description: `Search Starships documentation and return a ranked list of matching docs.

Inputs:
- q: string (search query; empty returns a lightweight listing)
- limit?: number (max items to return; default 20)

Implicit environment (do not pass as arguments):
- BASE_URL: derived from agent.state.baseUrl (must include /api/v1)
- AUTH_TOKEN: derived from agent.state.authToken (optional for public docs)

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
        name: 'Prepare Request',
        description: 'Build URL and headers for GET /docs?q=...&limit=...',
        parameters: {
          code: `
            async function main(ctx) {
              const baseUrl = (ctx.$env('BASE_URL') || '').replace(/\\/+$/, '');
              if (!baseUrl) throw new Error('baseUrl is required');
              const authToken = ctx.$env('AUTH_TOKEN');

              const q = ctx.$input && typeof ctx.$input.q === 'string' ? ctx.$input.q : '';
              const limit = ctx.$input && typeof ctx.$input.limit === 'number' ? ctx.$input.limit : undefined;

              const params = new URLSearchParams();
              if (q) params.set('q', q);
              if (typeof limit === 'number') params.set('limit', String(limit));

              const headers = { 'Content-Type': 'application/json' };
              if (authToken) headers['Authorization'] = 'Bearer ' + authToken;

              return {
                url: baseUrl + '/docs' + (params.toString() ? ('?' + params.toString()) : ''),
                method: 'GET',
                headers,
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_search',
        type: 'http_request',
        name: 'Search Docs',
        description: 'GET /docs',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 5000,
        },
      },
      {
        ref: 'extract',
        type: 'code',
        name: 'Extract Payload',
        description: 'Return server payload (prefer body.data when present)',
        parameters: {
          code: `
            async function main(ctx) {
              const http = ctx.$input;
              const body = http && typeof http === 'object' ? http.body : http;
              if (body && typeof body === 'object' && body.data !== undefined) {
                return body.data;
              }
              return body;
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
      { ref: 'e2', from: 'prepare', to: 'http_search' },
      { ref: 'e3', from: 'http_search', to: 'extract' },
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
  category: 'data',
  exampleUsage: '{ "q": "tools", "limit": 10 } // returns search results; env baseUrl inferred',
  requiresApiKey: false,
  configurationFields: [],
};


