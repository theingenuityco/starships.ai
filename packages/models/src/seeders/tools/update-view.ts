import type { ToolParams } from '@starships/autopilot';

/**
 * Tool: Update View
 * Updates a persisted view by id (partial updates supported).
 */
export const updateViewTool: ToolParams = {
  name: 'Update View',
  slug: 'update-view',
  description: 'Update a view by id. Supports { name, description, root, runtimeConfig, version }.',
  parameters: {
    type: 'object',
    properties: {
      viewId: { type: 'string', description: 'View id to update' },
      name: { type: 'string', description: 'New name (optional)' },
      description: { type: 'string', description: 'New description (optional)' },
      root: { type: 'object', description: 'Widget tree root node (optional; full tree)' },
      runtimeConfig: { type: 'object', description: 'Runtime config (optional)' },
      version: { type: 'number', description: 'Optional optimistic version number' },
    },
    required: ['viewId'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Validate viewId; ensure at least one update field present',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const viewId = typeof input.viewId === 'string' ? input.viewId.trim() : '';
              if (!viewId) throw new Error('viewId is required');
              const out = { viewId };
              if (typeof input.name === 'string' && input.name.trim()) out.name = input.name.trim();
              if (typeof input.description === 'string') out.description = input.description;
              if (input.root && typeof input.root === 'object') out.root = input.root;
              if (input.runtimeConfig && typeof input.runtimeConfig === 'object') out.runtimeConfig = input.runtimeConfig;
              if (input.version != null && Number.isFinite(Number(input.version))) out.version = Number(input.version);
              const keys = Object.keys(out);
              if (keys.length <= 1) throw new Error('At least one of name, description, root, runtimeConfig, or version must be provided');
              return out;
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'update_view',
        type: 'connector_action',
        name: 'Update View (Starships)',
        description: 'Update view via Starships connector',
        parameters: {
          connector: 'starships',
          action: 'update-view',
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
      { ref: 'e2', from: 'validate_input', to: 'update_view' },
      { ref: 'e3', from: 'update_view', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};
