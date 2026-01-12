import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: get-agent
 * Fetch a specific agent by slug with full details
 */
export const agentGetTool: ToolParams = {
  name: 'Get Agent',
  slug: 'get-agent',
  description:
    'Fetch complete agent details by slug from the current starship (includes blueprint, systemPrompt, assignedToolSlugs, and other configuration).',
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
        description: 'Validate inputs',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const slug = input.slug;
              if (!slug || typeof slug !== 'string') throw new Error('slug is required');

              return {
                slug: String(slug)
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_get',
        type: 'connector_action',
        name: 'Get Agent',
        description: 'GET /starships/:starshipId/agents/:slug',
        parameters: {
          connector: 'starships',
          action: 'get-agent',
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
            slug: '{{ (lastOutputOf("prepare") || {}).slug }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return complete agent details',
        parameters: {
          output: '{{ lastOutputOf("http_get") }}',
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
  version: '1.0.2',
  category: 'automation',
  exampleUsage: '{ "slug": "customer-support" } // returns complete agent details',
  requiresApiKey: false,
  configurationFields: [],
};
