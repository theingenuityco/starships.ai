import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: deploy-agents-from-marketplace
 * Deploy an agent template from the marketplace onto the current starship.
 */
export const deployAgentsFromMarketplaceTool: ToolParams = {
  name: 'Deploy Agents From Marketplace',
  slug: 'deploy-agents-from-marketplace',
  description:
    'Deploy an agent template from the marketplace onto this starship. Creates a new agent instance from a template ID.',
  parameters: {
    type: 'object',
    required: ['templateId'],
    properties: {
      templateId: {
        type: 'string',
        description: 'Agent template ID from the marketplace (e.g., returned by list-agents-from-marketplace)',
      },
      starshipId: {
        type: 'string',
        description: 'Optional starship ID/slug to deploy to (defaults to the current starship)',
      },
    },
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Validate inputs and normalize ids',
        parameters: {
          code: `
            async function main(ctx) {
              const templateId = String(ctx.input?.templateId ?? '').trim();
              if (!templateId) throw new Error('templateId is required');

              const starshipIdRaw = ctx.input?.starshipId;
              const starshipId = typeof starshipIdRaw === 'string' ? starshipIdRaw.trim() : '';

              return { templateId, starshipId, ok: true };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_deploy',
        type: 'connector_action',
        name: 'Deploy Agent Template',
        description: 'POST /agent-templates/:templateId/agents',
        parameters: {
          connector: 'starships',
          action: 'deploy-agents-from-marketplace',
          failOnNon2xx: true,
          args: {
            templateId: '{{ lastOutputOf("prepare").templateId }}',
            starshipId: '{{ lastOutputOf("prepare").starshipId }}',
          },
          timeout: 15000,
        },
      },
      {
        ref: 'summarize',
        type: 'code',
        name: 'Summarize Agent',
        description: 'Return a lean representation of the created agent',
        parameters: {
          code: `
            async function main(ctx) {
              const http = ctx.input;
              const body = http && typeof http === 'object' ? http.body : http;
              const data = body && typeof body === 'object' && body.data && typeof body.data === 'object'
                ? body.data
                : body;

              return {
                id: data && data.id,
                slug: data && data.slug,
                name: data && data.name,
                description: data && data.description,
                category: data && data.category,
                role: data && data.role
              };
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
      { ref: 'e2', from: 'prepare', to: 'http_deploy' },
      { ref: 'e3', from: 'http_deploy', to: 'summarize' },
      { ref: 'e4', from: 'summarize', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const deployAgentsFromMarketplaceToolTemplate: Omit<
  ToolTemplateModel,
  'id' | 'createdAt' | 'updatedAt' | 'usageCount'
> = {
  name: deployAgentsFromMarketplaceTool.name,
  description: deployAgentsFromMarketplaceTool.description,
  parameters: deployAgentsFromMarketplaceTool.parameters,
  blueprint: deployAgentsFromMarketplaceTool.blueprint,

  slug: 'deploy-agents-from-marketplace',
  version: '1.0.0',
  category: 'automation',
  exampleUsage: '{ "templateId": "tpl_123" } // creates a new agent on the current starship from a marketplace template',
  requiresApiKey: false,
  configurationFields: [],
};

