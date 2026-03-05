import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Upsert Dataset Rows
 * Append or upsert rows to a dataset.
 */
export const upsertDatasetRowsTool: ToolParams = {
  name: 'Upsert Dataset Rows',
  slug: 'upsert-dataset-rows',
  description:
    'Append or upsert rows in a dataset. For upserts, the dataset must define primaryKey. Accepts { datasetSlug|datasetId, rows, mode? }.',
  parameters: {
    type: 'object',
    properties: {
      starshipId: { type: 'string', description: 'Starship ID (optional; defaults to runtime STARSHIP_ID)' },
      datasetId: { type: 'string', description: 'Dataset id (optional if datasetSlug provided)' },
      datasetSlug: { type: 'string', description: 'Dataset slug (optional if datasetId provided)' },
      rows: { type: 'array', description: 'Array of row objects' },
      mode: { type: 'string', description: '"append" (default) or "upsert"' },
    },
    required: ['rows'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare',
        description: 'Validate input and resolve starshipId',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const datasetId = typeof input.datasetId === 'string' ? input.datasetId.trim() : '';
              const datasetSlug = typeof input.datasetSlug === 'string' ? input.datasetSlug.trim() : '';
              const datasetIdOrSlug = datasetSlug || datasetId;
              if (!datasetIdOrSlug) throw new Error('datasetSlug or datasetId is required');
              const rows = Array.isArray(input.rows) ? input.rows : null;
              if (!rows || rows.length === 0) throw new Error('rows is required (non-empty array)');
              const mode = typeof input.mode === 'string' && input.mode.trim() ? input.mode.trim() : 'append';
              if (mode !== 'append' && mode !== 'upsert') throw new Error('mode must be "append" or "upsert"');

              const starshipId = typeof input.starshipId === 'string' && input.starshipId.trim()
                ? input.starshipId.trim()
                : ctx.env('STARSHIP_ID');
              if (!starshipId || typeof starshipId !== 'string' || !String(starshipId).trim()) throw new Error('STARSHIP_ID is required');

              const out = { starshipId: String(starshipId).trim(), rows, mode };
              if (datasetSlug) out.datasetSlug = datasetSlug;
              if (!datasetSlug) out.datasetId = datasetIdOrSlug;
              return out;
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'upsert',
        type: 'connector_action',
        name: 'Upsert Dataset Rows (Starships)',
        description: 'Write dataset rows via Starships connector action',
        parameters: {
          connector: 'starships',
          action: 'upsert-dataset-rows',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("prepare") }}',
          timeout: 30000,
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
      { ref: 'e2', from: 'prepare', to: 'upsert' },
      { ref: 'e3', from: 'upsert', to: 'unwrap' },
      { ref: 'e4', from: 'unwrap', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const upsertDatasetRowsToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: upsertDatasetRowsTool.name,
  description: upsertDatasetRowsTool.description,
  parameters: upsertDatasetRowsTool.parameters,
  blueprint: upsertDatasetRowsTool.blueprint,
  slug: upsertDatasetRowsTool.slug,
  version: '1.0.0',
  category: 'data',
  exampleUsage: '{ "datasetSlug": "leads", "mode": "upsert", "rows": [{ "email": "a@b.com", "status": "new" }] }',
  requiresApiKey: false,
  configurationFields: [],
};

