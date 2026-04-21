import type { ToolParams } from '@starships/autopilot';

/**
 * Tool: Get View
 * Fetch a view by id.
 */
export const getViewTool: ToolParams = {
  name: 'Get View',
  slug: 'get-view',
  description: 'Get a view by id.',
  parameters: {
    type: 'object',
    properties: {
      viewId: { type: 'string', description: 'View id' },
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
        description: 'Validate viewId',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const viewId = typeof input.viewId === 'string' ? input.viewId.trim() : '';
              if (!viewId) throw new Error('viewId is required');
              return { viewId };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'get_view',
        type: 'connector_action',
        name: 'Get View (Starships)',
        description: 'Fetch view via Starships connector',
        parameters: {
          connector: 'starships',
          action: 'get-view',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("validate_input") }}',
          timeout: 5000,
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
      { ref: 'e2', from: 'validate_input', to: 'get_view' },
      { ref: 'e3', from: 'get_view', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};
