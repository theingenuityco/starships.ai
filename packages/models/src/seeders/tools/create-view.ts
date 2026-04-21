import type { ToolParams } from '@starships/autopilot';

/**
 * Tool: Create View
 * Creates a persisted dynamic view with { root, runtimeConfig }.
 */
export const createViewTool: ToolParams = {
  name: 'Create View',
  slug: 'create-view',
  description: 'Create a view for the current starship. Accepts { name, slug?, description, root?, runtimeConfig? }.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'View name' },
      slug: { type: 'string', description: 'Optional view slug (kebab-case)' },
      description: { type: 'string', description: 'View description' },
      root: { type: 'object', description: 'Widget tree root node (WidgetInstanceNode)' },
      runtimeConfig: { type: 'object', description: 'Runtime config (scripts/queries/permissions)' },
    },
    required: ['name', 'description'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Validate name/description; attach STARSHIP_ID',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const name = typeof input.name === 'string' ? input.name.trim() : '';
              const description = typeof input.description === 'string' ? input.description.trim() : '';
              const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
              const root = input.root && typeof input.root === 'object' ? input.root : undefined;
              const runtimeConfig = input.runtimeConfig && typeof input.runtimeConfig === 'object' ? input.runtimeConfig : undefined;
              if (!name) throw new Error('name is required');
              if (!description) throw new Error('description is required');
              const starshipId = ctx.env('STARSHIP_ID');
              if (!starshipId || typeof starshipId !== 'string' || !starshipId.trim()) throw new Error('STARSHIP_ID is required');
              const out = { starshipId: starshipId.trim(), name, description };
              if (slug) out.slug = slug;
              if (root) out.root = root;
              if (runtimeConfig) out.runtimeConfig = runtimeConfig;
              return out;
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'create_view',
        type: 'connector_action',
        name: 'Create View (Starships)',
        description: 'Create view via Starships connector',
        parameters: {
          connector: 'starships',
          action: 'create-view',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("validate_input") }}',
          timeout: 10000,
        },
      },
      {
        ref: 'extract',
        type: 'code',
        name: 'Extract Payload',
        description: 'Return connector payload (prefer data when present)',
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
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ lastOutputOf("extract") }}' } },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate_input' },
      { ref: 'e2', from: 'validate_input', to: 'create_view' },
      { ref: 'e3', from: 'create_view', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};
