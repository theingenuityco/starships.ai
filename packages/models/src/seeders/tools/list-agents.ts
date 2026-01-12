import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: list-agents
 * List all agents for the specified starship using server REST API
 */
export const agentListTool: ToolParams = {
  name: 'List Agents',
  slug: 'list-agents',
  description:
    'List all agents on the current starship for discovery. Returns a lean array (slug, name, description, category) without heavy fields like blueprint.',
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
        description: 'Validate inputs',
        parameters: {
          code: `
            async function main(ctx) {
              return {
                ok: true
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_list',
        type: 'connector_action',
        name: 'List Agents',
        description: 'GET /starships/:starshipId/agents',
        parameters: {
          connector: 'starships',
          action: 'list-agents',
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
          },
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
              const http = ctx.input;
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

  slug: 'list-agents',
  version: '1.0.3',
  category: 'automation',
  exampleUsage: '{} // returns a lean array of agents; env (baseUrl, authToken, starshipId) is inferred',
  requiresApiKey: false,
  configurationFields: [],
};
