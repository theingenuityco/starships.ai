import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Get Tool
 * Get full tool details (including blueprint) by slug for the specified starship using the Starships HTTP API.
 */
export const toolGetTool: ToolParams = {
  name: 'Get Tool',
  slug: 'get-tool',
  description: 'Fetch full tool details by slug from the current starship (includes blueprint and parameters).',
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
        description: 'Validate slug and prepare relative URL for Starships connector',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
              const slug = input.slug;
              if (!slug || typeof slug !== 'string') {
                throw new Error('slug is required and must be a string');
              }
              return { slug };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'http_get',
        type: 'connector_action',
        name: 'Get Tool (Starships)',
        description: 'Fetch tool definition via Starships connector action',
        parameters: {
          connector: 'starships',
          action: 'get-tool',
          failOnNon2xx: true,
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
            slug: '{{ (lastOutputOf("prepare") || {}).slug }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'extract',
        type: 'code',
        name: 'Extract Payload',
        description: 'Return the connector payload body (preferring data when present)',
        parameters: {
          code: `
            async function main(ctx) {
              const raw = ctx.input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;
              if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) {
                return payload.data;
              }
              return payload;
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'slim',
        type: 'code',
        name: 'Slim Tool',
        description: 'Return full tool details but omit noisy/unneeded metadata (keep blueprint)',
        parameters: {
          code: `
            async function main(ctx) {
              const tool = ctx.input;

              // If this is already an error-like payload, pass through unchanged.
              if (tool && typeof tool === 'object') {
                const t = tool;
                if (typeof t.code === 'string' && typeof t.message === 'string') {
                  return t;
                }
              }

              if (!tool || typeof tool !== 'object') return tool;

              const t = tool;
              const out = {};

              if (typeof t.slug === 'string') out.slug = t.slug;
              if (typeof t.name === 'string') out.name = t.name;
              if (typeof t.description === 'string') out.description = t.description;
              if (typeof t.category === 'string') out.category = t.category;

              if (typeof t.status === 'string') out.status = t.status;
              if (typeof t.version === 'string') out.version = t.version;

              if (t.parameters && typeof t.parameters === 'object') out.parameters = t.parameters;
              if (t.blueprint && typeof t.blueprint === 'object') out.blueprint = t.blueprint;

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
        description: '',
        parameters: {
          output: '{{ lastOutputOf("slim") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_get' },
      { ref: 'e3', from: 'http_get', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'slim' },
      { ref: 'e5', from: 'slim', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const toolGetToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolGetTool.name,
  description: toolGetTool.description,
  parameters: toolGetTool.parameters,
  blueprint: toolGetTool.blueprint,

  slug: 'get-tool',
  version: '1.0.5',
  category: 'automation',
  exampleUsage: '{ "slug": "calc" } // returns full tool details including blueprint; connector infers starship context',
  requiresApiKey: false,
  configurationFields: [],
};
