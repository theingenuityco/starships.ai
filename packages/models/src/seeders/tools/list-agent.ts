import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: list-agent
 * List all agents for the specified starship using server REST API
 */
export const agentListTool: ToolParams = {
  name: 'List Agents',
  slug: 'list-agent',
  description: `List all agents on the current starship via the Starships API.

When to use:
- Inventory, discovery, or to find an agent id/slug before creation/update/testing.

Inputs:
- {} (no arguments)

Implicit environment (do not pass as arguments):
- BASE_URL: derived from agent.state.baseUrl
- AUTH_TOKEN: derived from agent.state.authToken (sent as Bearer)
- STARSHIP_ID: derived from agent.state.starshipId

Output:
- Array of { slug, name, description, category, model } (deliberately lean; heavy fields like blueprint are omitted)

Behavior and limits:
- Read-only and idempotent
- Timeouts: prepare 3s, HTTP 5s
- Typical failures: missing env, 401/403, network errors, server unavailability`,
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
        description: 'Build URL and headers',
        parameters: {
          code: `
            async function main(ctx) {
              const baseUrl = (ctx.$env('BASE_URL') || '').replace(/\\/+$/, '');
              if (!baseUrl) throw new Error('baseUrl is required');
              const authToken = ctx.$env('AUTH_TOKEN');
              const starshipId = ctx.$env('STARSHIP_ID');
              if (!authToken) throw new Error('authToken is required');
              if (!starshipId) throw new Error('starshipId is required');

              return {
                url: \`\${baseUrl}/starships/\${starshipId}/agents\`,
                method: 'GET',
                headers: {
                  'Authorization': \`Bearer \${authToken}\`,
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
        name: 'List Agents',
        description: 'GET /starships/:starshipId/agents',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 5000,
        },
      },
      {
        ref: 'summarize',
        type: 'code',
        name: 'Summarize Agents',
        description: 'Strip heavy fields (e.g., blueprint) and return a lean list',
        parameters: {
          code: `
            async function main(ctx) {
              // Input is the HttpResponse from http_list (see HttpRequest node contract)
              const http = ctx.$input;
              const body = http && typeof http === 'object' ? http.body : http;
              // Server sendSuccess returns { data: T }, so prefer body.data when present
              const data = body && typeof body === 'object' && Array.isArray(body.data)
                ? body.data
                : (Array.isArray(body) ? body : []);

              // Return a lean summary to avoid leaking large/templated blueprint contents
              return data.map((a) => ({
                slug: a && a.slug,
                name: a && a.name,
                description: a && a.description,
                category: a && a.category,
                model: a && a.model,
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
          output: '{{ $lastOutputOf("summarize")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_list' },
      { ref: 'e3', from: 'http_list', to: 'summarize' },
      { ref: 'e4', from: 'summarize', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const agentListToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentListTool.name,
  description: agentListTool.description,
  parameters: agentListTool.parameters,
  blueprint: agentListTool.blueprint,

  slug: 'list-agent',
  category: 'automation',
  exampleUsage: '{} // returns a lean array of agents; env (baseUrl, authToken, starshipId) is inferred',
  requiresApiKey: false,
  configurationFields: [],
};
