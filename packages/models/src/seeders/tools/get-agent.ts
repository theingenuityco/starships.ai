import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: get-agent
 * Fetch a specific agent by slug with full details
 */
export const agentGetTool: ToolParams = {
  name: 'Get Agent',
  slug: 'get-agent',
  description: `Fetch complete agent details by slug from the current starship.

When to use:
- Inspect agent configuration before modification
- Retrieve full agent details including blueprint, system prompt, assigned tools
- Validate agent existence before operations

Inputs:
- slug (required): Agent slug to fetch

Implicit environment (do not pass as arguments):
- BASE_URL: derived from agent.state.baseUrl
- AUTH_TOKEN: derived from agent.state.authToken (sent as Bearer)
- STARSHIP_ID: derived from agent.state.starshipId

Output:
- Complete agent object with all fields (id, name, slug, description, model, systemPrompt, temperature, maxTokens, blueprint, assignedToolSlugs, status, etc.)

Behavior and limits:
- Read-only and idempotent
- Timeouts: prepare 3s, HTTP 5s
- Typical failures: missing env, 401/403, 404 (agent not found), network errors`,
  parameters: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'Unique kebab-case identifier of the agent to fetch',
      },
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
        description: 'Build URL and headers',
        parameters: {
          code: `
            async function main(ctx) {
              const baseUrl = (ctx.$env('BASE_URL') || '').replace(/\\/+$/, '');
              if (!baseUrl) throw new Error('BASE_URL is required');
              const authToken = ctx.$env('AUTH_TOKEN');
              const starshipId = ctx.$env('STARSHIP_ID');
              if (!authToken) throw new Error('AUTH_TOKEN is required');
              if (!starshipId) throw new Error('STARSHIP_ID is required');

              const slug = ctx.$input && ctx.$input.slug;
              if (!slug || typeof slug !== 'string') throw new Error('slug is required');

              return {
                url: baseUrl + '/starships/' + String(starshipId) + '/agents/' + String(slug),
                method: 'GET',
                headers: {
                  'Authorization': 'Bearer ' + String(authToken),
                  'Content-Type': 'application/json'
                }
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_get',
        type: 'http_request',
        name: 'Get Agent',
        description: 'GET /starships/:starshipId/agents/:slug',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 5000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return complete agent details',
        parameters: {
          output: '{{ $lastOutputOf("http_get")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_get' },
      { ref: 'e3', from: 'http_get', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const agentGetToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentGetTool.name,
  description: agentGetTool.description,
  parameters: agentGetTool.parameters,
  blueprint: agentGetTool.blueprint,

  slug: 'get-agent',
  category: 'automation',
  exampleUsage: '{ "slug": "customer-support" } // returns complete agent details',
  requiresApiKey: false,
  configurationFields: [],
};
