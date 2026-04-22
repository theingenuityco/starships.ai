import type { ToolParams } from '@starships/autopilot';

/**
 * Tool: List Datasets
 * Lists datasets for the current starship.
 */
export const listDatasetsTool: ToolParams = {
  name: 'List Datasets',
  slug: 'list-datasets',
  description: 'List datasets for the current starship. Optionally include archived datasets.',
  parameters: {
    type: 'object',
    properties: {
      starshipId: { type: 'string', description: 'Starship ID (optional; defaults to runtime STARSHIP_ID)' },
      includeArchived: { type: 'boolean', description: 'Include archived datasets' },
    },
    required: [],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare',
        description: 'Resolve starshipId and normalize flags',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const starshipId = typeof input.starshipId === 'string' && input.starshipId.trim()
                ? input.starshipId.trim()
                : ctx.env('STARSHIP_ID');
              if (!starshipId || typeof starshipId !== 'string' || !String(starshipId).trim()) throw new Error('STARSHIP_ID is required');
              const includeArchived = input.includeArchived == null ? undefined : Boolean(input.includeArchived);
              const out = { starshipId: String(starshipId).trim() };
              if (includeArchived !== undefined) out.includeArchived = includeArchived;
              return out;
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'list',
        type: 'connector_action',
        name: 'List Datasets (Starships)',
        description: 'List datasets via Starships connector action',
        parameters: {
          connector: 'starships',
          action: 'list-datasets',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("prepare") }}',
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
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ lastOutputOf("unwrap") }}' } },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'list' },
      { ref: 'e3', from: 'list', to: 'unwrap' },
      { ref: 'e4', from: 'unwrap', to: 'end_1' },
    ],
    metadata: {},
  },
};
