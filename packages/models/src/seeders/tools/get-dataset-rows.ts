import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Get Dataset Rows
 * Fetch a page of rows from a dataset.
 */
export const getDatasetRowsTool: ToolParams = {
  name: 'Get Dataset Rows',
  slug: 'get-dataset-rows',
  description: 'Get rows for a dataset (paginated). Returns { columns, data, pagination }. ',
  parameters: {
    type: 'object',
    properties: {
      starshipId: { type: 'string', description: 'Starship ID (optional; defaults to runtime STARSHIP_ID)' },
      datasetId: { type: 'string', description: 'Dataset id (optional if datasetSlug provided)' },
      datasetSlug: { type: 'string', description: 'Dataset slug (optional if datasetId provided)' },
      limit: { type: 'number', description: 'Max rows to return (0-200)' },
      offset: { type: 'number', description: 'Offset (0+) for pagination' },
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
        description: 'Validate datasetId; normalize limit/offset; resolve starshipId',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const datasetId = typeof input.datasetId === 'string' ? input.datasetId.trim() : '';
              const datasetSlug = typeof input.datasetSlug === 'string' ? input.datasetSlug.trim() : '';
              const datasetIdOrSlug = datasetSlug || datasetId;
              if (!datasetIdOrSlug) throw new Error('datasetSlug or datasetId is required');

              const starshipId = typeof input.starshipId === 'string' && input.starshipId.trim()
                ? input.starshipId.trim()
                : ctx.env('STARSHIP_ID');
              if (!starshipId || typeof starshipId !== 'string' || !String(starshipId).trim()) throw new Error('STARSHIP_ID is required');

              const limit = input.limit == null ? undefined : Math.max(0, Math.min(200, Math.floor(Number(input.limit))));
              if (limit !== undefined && !Number.isFinite(limit)) throw new Error('limit must be a number');
              const offset = input.offset == null ? undefined : Math.max(0, Math.floor(Number(input.offset)));
              if (offset !== undefined && !Number.isFinite(offset)) throw new Error('offset must be a number');

              const out = { starshipId: String(starshipId).trim() };
              if (datasetSlug) out.datasetSlug = datasetSlug;
              if (!datasetSlug) out.datasetId = datasetIdOrSlug;
              if (limit !== undefined) out.limit = limit;
              if (offset !== undefined) out.offset = offset;
              return out;
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'get_rows',
        type: 'connector_action',
        name: 'List Dataset Rows (Starships)',
        description: 'Fetch dataset rows via Starships connector action',
        parameters: {
          connector: 'starships',
          action: 'list-dataset-rows',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("prepare") }}',
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
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ lastOutputOf("unwrap") }}' } },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'get_rows' },
      { ref: 'e3', from: 'get_rows', to: 'unwrap' },
      { ref: 'e4', from: 'unwrap', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const getDatasetRowsToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: getDatasetRowsTool.name,
  description: getDatasetRowsTool.description,
  parameters: getDatasetRowsTool.parameters,
  blueprint: getDatasetRowsTool.blueprint,
  slug: getDatasetRowsTool.slug,
  version: '1.0.0',
  category: 'data',
  exampleUsage: '{ "datasetSlug": "leads", "limit": 50, "offset": 0 }',
  requiresApiKey: false,
  configurationFields: [],
};

