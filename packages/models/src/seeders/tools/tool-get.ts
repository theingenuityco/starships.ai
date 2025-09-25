import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: tool_get
 * Get full tool details (including blueprint) by slug for the specified starship using server REST API
 */
export const toolGetTool: ToolParams = {
  name: 'tool_get',
  description: `Get full details for a tool on the current starship by slug.

Inputs:
- slug: string (tool slug on this starship)

Implicit environment (do not pass as arguments):
- BASE_URL: derived from agent.state.baseUrl
- AUTH_TOKEN: derived from agent.state.authToken (sent as Bearer)
- STARSHIP_ID: derived from agent.state.starshipId

Output:
- Full tool model as returned by GET /starships/:starshipId/tools/:slug (includes blueprint)

Behavior and limits:
- Read-only and idempotent
- Timeouts: prepare 3s, HTTP 5s
- Typical failures: missing env, 401/403, not found (404), network errors`,
  parameters: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Tool slug to fetch' },
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
        description: 'Build URL and headers for GET /starships/:starshipId/tools/:slug',
        parameters: {
          code: `
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            const starshipId = env('STARSHIP_ID');
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            const slug = input && input.slug;
            if (!slug || typeof slug !== 'string') throw new Error('slug is required');

            return {
              url: \`\${baseUrl}/starships/\${starshipId}/tools/\${slug}\`,
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
        ref: 'http_get',
        type: 'http_request',
        name: 'Get Tool',
        description: 'GET /starships/:starshipId/tools/:slug',
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
        description: 'Return the tool model (prefer body.data when present)',
        parameters: {
          code: `
            const http = input;
            const body = http && typeof http === 'object' ? http.body : http;
            // Server sendSuccess returns { data: T }, prefer data when present
            if (body && typeof body === 'object' && body.data !== undefined) {
              return body.data;
            }
            return body;
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

export const toolGetToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolGetTool.name,
  description: toolGetTool.description,
  parameters: toolGetTool.parameters,
  blueprint: toolGetTool.blueprint,

  slug: 'tool-get',
  category: 'automation',
  exampleUsage: '{ "slug": "calc" } // returns full tool model; env (baseUrl, authToken, starshipId) is inferred',
  requiresApiKey: false,
  configurationFields: [],
};
