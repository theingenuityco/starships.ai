import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Tool
 * Edit the currently focused tool with partial updates. Designed for incremental tool development.
 */
export const toolEditTool: ToolParams = {
  name: 'Edit Tool',
  slug: 'edit-tool',
  description:
    'Update an existing tool by slug with partial fields (name, description, parameters, blueprint) on the current starship. Returns a lean tool summary (no blueprint).',
  parameters: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'Tool slug to update (kebab-case)',
      },
      name: {
        type: 'string',
        description: 'New tool name',
      },
      description: {
        type: 'string',
        description: 'New tool description',
      },
      parameters: {
        type: 'object',
        description: 'New JSON Schema for tool parameters',
      },
      blueprint: {
        type: 'object',
        description: 'New Autopilot blueprint { nodes, edges }',
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
        name: 'Prepare Update Request',
        description: 'Build URL, headers and partial body for tool update',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              if (!input.slug) {
                throw new Error('slug is required');
              }

              // Build partial update body with only provided and non-empty fields
              const body = {};
              if (typeof input.name === 'string' && input.name.trim().length > 0) body.name = input.name.trim();
              if (typeof input.description === 'string' && input.description.trim().length > 0) body.description = input.description.trim();
              if (input.parameters && typeof input.parameters === 'object' && Object.keys(input.parameters).length > 0) body.parameters = input.parameters;
              if (input.blueprint && typeof input.blueprint === 'object') {
                const hasNodes = Array.isArray(input.blueprint.nodes) && input.blueprint.nodes.length > 0;
                const hasEdges = Array.isArray(input.blueprint.edges) && input.blueprint.edges.length > 0;
                if (hasNodes || hasEdges) body.blueprint = input.blueprint;
              }

              if (Object.keys(body).length === 0) {
                throw new Error('At least one field must be provided for update');
              }

              return {
                slug: input.slug,
                body,
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'fetch_tool',
        type: 'connector_action',
        name: 'Fetch Tool by Slug',
        description: 'GET /starships/:starshipId/tools/:slug to resolve tool ID',
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
        ref: 'prepare_update',
        type: 'code',
        name: 'Prepare Update Request',
        description: 'Extract tool ID and prepare PUT request',
        parameters: {
          code: `
            async function main(ctx) {
              const fetchResponse = ctx.lastOutputOf('fetch_tool') || {};
              const toolData = fetchResponse.body?.data || fetchResponse.body;

              if (!toolData || !toolData.id) {
                throw new Error('Failed to resolve tool by slug');
              }

              const prep = ctx.lastOutputOf('prepare') || {};

              return {
                toolId: String(toolData.id),
                ...(prep.body || {})
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_update',
        type: 'connector_action',
        name: 'Update Tool',
        description: 'PUT /tools/:id with partial updates',
        parameters: {
          connector: 'starships',
          action: 'update-tool',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("prepare_update") }}',
          timeout: 10000,
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
        name: 'Slim Tool',
        description: 'Return a lean tool summary (omit heavy/unneeded fields like blueprint)',
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
        description: 'Return lean updated tool summary',
        parameters: {
          output: '{{ lastOutputOf("slim") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'fetch_tool' },
      { ref: 'e3', from: 'fetch_tool', to: 'prepare_update' },
      { ref: 'e4', from: 'prepare_update', to: 'http_update' },
      { ref: 'e5', from: 'http_update', to: 'unwrap' },
      { ref: 'e6', from: 'unwrap', to: 'slim' },
      { ref: 'e7', from: 'slim', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: edit-tool
 */
export const toolEditToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolEditTool.name,
  description: toolEditTool.description,
  parameters: toolEditTool.parameters,
  blueprint: toolEditTool.blueprint,

  slug: 'edit-tool',
  version: '1.0.4',
  category: 'automation',
  exampleUsage: '{ "slug": "weather-lookup", "description": "Updated description" } // partial updates by slug',
  requiresApiKey: false,
  configurationFields: [],
};
