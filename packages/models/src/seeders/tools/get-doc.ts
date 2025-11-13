import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Get Doc
 * Fetch a single documentation page by slug via server REST API
 */
export const docsGetDocTool: ToolParams = {
  name: 'Get Doc',
  slug: 'get-doc',
  description: `Fetch the raw markdown content for a documentation page by slug.

Inputs:
- slug: string (doc slug; nested slugs supported, e.g., "core-concepts/tools")

Implicit environment (do not pass as arguments):
- BASE_URL: derived from agent.state.baseUrl (must include /api/v1)
- AUTH_TOKEN: derived from agent.state.authToken (optional for public docs)

Output:
- { slug: string, title: string, content: string }

Behavior and limits:
- Read-only and idempotent
- Timeouts: prepare 3s, HTTP 5s
- Typical failures: missing baseUrl, invalid slug, not found (404), network errors`,
  parameters: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Documentation slug to fetch (no .md/.mdx extension)' },
    },
    required: ['slug'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL and headers for GET /docs/:slug',
        parameters: {
          code: `
            async function main(ctx) {
              const baseUrl = (ctx.$env('BASE_URL') || '').replace(/\\/+$/, '');
              if (!baseUrl) throw new Error('baseUrl is required');
              const authToken = ctx.$env('AUTH_TOKEN');

              const slug = ctx.$input && typeof ctx.$input.slug === 'string' ? ctx.$input.slug.trim() : '';
              if (!slug) throw new Error('slug is required');

              const headers = { 'Content-Type': 'application/json' };
              if (authToken) headers['Authorization'] = 'Bearer ' + authToken;

              return {
                url: baseUrl + '/docs/' + slug.replace(/^\\/+/, ''),
                method: 'GET',
                headers,
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_get',
        type: 'http_request',
        name: 'Get Doc',
        description: 'GET /docs/:slug',
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
        description: 'Return the server payload (prefer body.data when present)',
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
      { ref: 'e2', from: 'prepare', to: 'http_get' },
      { ref: 'e3', from: 'http_get', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const docsGetDocToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: docsGetDocTool.name,
  description: docsGetDocTool.description,
  parameters: docsGetDocTool.parameters,
  blueprint: docsGetDocTool.blueprint,

  slug: 'get-doc',
  version: '1.0.1',
  category: 'data',
  exampleUsage: '{ "slug": "core-concepts/tools" } // returns markdown content; env baseUrl inferred',
  requiresApiKey: false,
  configurationFields: [],
};


