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
          failOnNon2xx: true,
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
            slug: '{{ (lastOutputOf("prepare") || {}).slug }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'unwrap',
        type: 'code',
        name: 'Unwrap',
        description: 'Return body.data/body.error where applicable; otherwise return body/resp',
        parameters: {
          code: `
            async function main(ctx) {
              const resp = ctx.input || {};
              const body = resp && typeof resp === 'object' ? resp.body : undefined;

              if (body && typeof body === 'object') {
                if (body.success === true) return body.data ?? body;
                if (body.success === false) return body.error ?? body;
              }
              return body ?? resp;
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'slim',
        type: 'code',
        name: 'Slim Agent',
        description: 'Return full agent config but omit noisy/internal metadata (keep blueprint)',
        parameters: {
          code: `
            async function main(ctx) {
              const agent = ctx.input;

              // Pass through structured errors unchanged.
              if (agent && typeof agent === 'object') {
                const a = agent;
                if (typeof a.code === 'string' && typeof a.message === 'string') return a;
              }

              if (!agent || typeof agent !== 'object') return agent;

              const a = agent;
              const out = {};

              if (typeof a.slug === 'string') out.slug = a.slug;
              if (typeof a.name === 'string') out.name = a.name;
              if (typeof a.role === 'string') out.role = a.role;
              if (typeof a.description === 'string') out.description = a.description;
              if (typeof a.category === 'string') out.category = a.category;

              if (typeof a.model === 'string') out.model = a.model;
              if (typeof a.systemPrompt === 'string') out.systemPrompt = a.systemPrompt;

              if (typeof a.temperature === 'number') out.temperature = a.temperature;
              if (typeof a.maxTokens === 'number') out.maxTokens = a.maxTokens;
              if (typeof a.timeout === 'number') out.timeout = a.timeout;

              if (typeof a.version === 'string') out.version = a.version;

              if (Array.isArray(a.previewPrompts)) {
                const prompts = a.previewPrompts.filter((p) => typeof p === 'string');
                out.previewPrompts = prompts;
              }

              if (Array.isArray(a.assignedToolSlugs)) {
                const slugs = a.assignedToolSlugs.filter((s) => typeof s === 'string');
                out.assignedToolSlugs = slugs;
              }

              if (a.blueprint && typeof a.blueprint === 'object') out.blueprint = a.blueprint;

              return out;
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return complete agent details',
        parameters: {
          output: '{{ lastOutputOf("slim") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_get' },
      { ref: 'e3', from: 'http_get', to: 'unwrap' },
      { ref: 'e4', from: 'unwrap', to: 'slim' },
      { ref: 'e5', from: 'slim', to: 'end_1' },
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
  version: '1.0.4',
  category: 'automation',
  exampleUsage: '{ "slug": "customer-support" } // returns complete agent details',
  requiresApiKey: false,
  configurationFields: [],
};
