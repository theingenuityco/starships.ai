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
    'Create a new tool (provide name + description; server generates slug) or open an existing tool by slug on the current starship. Returns the tool model.',
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
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
            slug: '{{ (lastOutputOf("prepare") || {}).slug }}',
          },
          timeout: '{{ (lastOutputOf("prepare") || {}).timeout }}',
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return tool model (created or fetched)',
        parameters: {
          output: '{{ lastOutputOf("create_tool") || lastOutputOf("get_tool") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'route_mode' },
      { ref: 'e3', from: 'route_mode', to: 'create_tool', condition: 'true' },
      { ref: 'e4', from: 'create_tool', to: 'end_1' },
      { ref: 'e5', from: 'route_mode', to: 'get_tool', condition: 'false' },
      { ref: 'e6', from: 'get_tool', to: 'end_1' },
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
  version: '1.0.2',
  category: 'automation',
  exampleUsage:
    '{ "slug": "weather-lookup" } // open existing\n{ "name": "My Tool", "description": "Does something useful" } // create new (server generates slug; env inferred)',
  requiresApiKey: false,
  configurationFields: [],
};
