import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Open Tool (Create or Open)
 * Creates a new tool (active) when provided name + description (slug not accepted), or opens an existing tool by slug
 */
export const toolOpenTool: ToolParams = {
  name: 'Open Tool',
  slug: 'open-tool',
  description:
    'Create a new tool (provide name + description; server generates slug) or open an existing tool by slug on the current starship. Returns a lean tool summary (no blueprint).',
  parameters: {
    type: 'object',
    properties: {
      // Open existing
      slug: {
        type: 'string',
        description: 'Unique kebab-case identifier of the tool to open',
      },
      // Create new
      name: {
        type: 'string',
        description: 'Human-readable name (required when creating a new tool)',
      },
      description: {
        type: 'string',
        description: 'Description (required when creating a new tool; max 320 characters)',
      },
    },
    required: [],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL, headers and body based on mode (create or open)',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const hasName = typeof input.name === 'string' && input.name.trim().length > 0;
              const hasSlug = typeof input.slug === 'string' && input.slug.trim().length > 0;

              if (hasName) {
                // Create tool (active by default)
                const name = input.name.trim();
                const description = (input && typeof input.description === 'string' ? input.description.trim() : '');
                if (!description) throw new Error('description is required when creating a new tool');
                const args = {
                  starshipId: String(ctx.env && ctx.env('STARSHIP_ID')),
                  name,
                  description,
                  status: 'active'
                };
                return {
                  mode: 'create',
                  args,
                  timeout: 10000
                };
              }

              // Open existing
              if (!hasSlug) throw new Error('slug is required to open an existing tool');
              return {
                mode: 'open',
                slug: input.slug,
                timeout: 5000
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'route_mode',
        type: 'conditional',
        name: 'Route Mode',
        description: 'Route to create vs open based on prepare.mode',
        parameters: {
          condition: '{{ (lastOutputOf("prepare") || {}).mode === "create" }}',
        },
      },
      {
        ref: 'create_tool',
        type: 'connector_action',
        name: 'Create Tool (Starships)',
        description: 'POST /starships/:starshipId/tools via Starships connector endpoint catalog',
        parameters: {
          connector: 'starships',
          action: 'create-tool',
          failOnNon2xx: true,
          args: '{{ (lastOutputOf("prepare") || {}).args }}',
          timeout: '{{ (lastOutputOf("prepare") || {}).timeout }}',
        },
      },
      {
        ref: 'get_tool',
        type: 'connector_action',
        name: 'Get Tool (Starships)',
        description: 'GET /starships/:starshipId/tools/:slug via Starships connector endpoint catalog',
        parameters: {
          connector: 'starships',
          action: 'get-tool',
          failOnNon2xx: true,
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
            slug: '{{ (lastOutputOf("prepare") || {}).slug }}',
          },
          timeout: '{{ (lastOutputOf("prepare") || {}).timeout }}',
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
              const resp = ctx.lastOutputOf('create_tool') || ctx.lastOutputOf('get_tool') || {};
              const body = resp && typeof resp === 'object' ? resp.body : undefined;

              if (body && typeof body === 'object') {
                if (body.success === true) return body.data ?? body;
                if (body.success === false) return body.error ?? body;
              }
              return body ?? resp;
            }
          `,
          timeout: 3000,
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

              // ToolModel fields are not consistent across all endpoints; keep this defensive.
              const t = tool;
              const out = {};

              // Core identity
              if (typeof t.slug === 'string') out.slug = t.slug;
              if (typeof t.name === 'string') out.name = t.name;
              if (typeof t.description === 'string') out.description = t.description;
              if (typeof t.category === 'string') out.category = t.category;

              // Status/versioning
              if (typeof t.status === 'string') out.status = t.status;
              if (typeof t.version === 'string') out.version = t.version;

              // Schema (useful for downstream tool editing)
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
        description: 'Return lean tool summary (created or fetched)',
        parameters: {
          output: '{{ lastOutputOf("slim") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'route_mode' },
      { ref: 'e3', from: 'route_mode', to: 'create_tool', condition: 'true' },
      { ref: 'e4', from: 'create_tool', to: 'unwrap' },
      { ref: 'e5', from: 'route_mode', to: 'get_tool', condition: 'false' },
      { ref: 'e6', from: 'get_tool', to: 'unwrap' },
      { ref: 'e7', from: 'unwrap', to: 'slim' },
      { ref: 'e8', from: 'slim', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: open-tool
 */
export const toolOpenToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolOpenTool.name,
  description: toolOpenTool.description,
  parameters: toolOpenTool.parameters,
  blueprint: toolOpenTool.blueprint,

  slug: 'open-tool',
  version: '1.0.8',
  category: 'automation',
  exampleUsage:
    '{ "slug": "weather-lookup" } // open existing\n{ "name": "My Tool", "description": "Does something useful" } // create new (server generates slug; env inferred)',
  requiresApiKey: false,
  configurationFields: [],
};
