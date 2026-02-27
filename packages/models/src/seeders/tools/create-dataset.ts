import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Create Dataset
 * Creates a starship-scoped dataset (tabular schema) that agents and humans can use.
 */
export const createDatasetTool: ToolParams = {
  name: 'Create Dataset',
  slug: 'create-dataset',
  description:
    'Create a dataset for the current starship. Accepts { name, description?, columns, primaryKey? } and returns the created dataset.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Dataset name' },
      description: { type: 'string', description: 'Dataset description' },
      columns: { type: 'array', description: 'Column definitions: [{ name, format?, type? }]' },
      primaryKey: { type: ['string', 'null'], description: 'Optional primary key column key (for upserts)' },
    },
    required: ['name', 'columns'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Validate dataset create args; attach STARSHIP_ID',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const name = typeof input.name === 'string' ? input.name.trim() : '';
              if (!name) throw new Error('name is required');

              const description = typeof input.description === 'string' ? input.description.trim() : '';

              const columns = Array.isArray(input.columns) ? input.columns : null;
              if (!columns || columns.length === 0) throw new Error('columns is required (non-empty array)');

              const primaryKey =
                input.primaryKey === null ? null : (typeof input.primaryKey === 'string' ? input.primaryKey.trim() : '');

              const starshipId = ctx.env('STARSHIP_ID');
              if (!starshipId || typeof starshipId !== 'string' || !starshipId.trim()) throw new Error('STARSHIP_ID is required');

              const out = { starshipId: starshipId.trim(), name, columns };
              if (description) out.description = description;
              if (input.primaryKey !== undefined) out.primaryKey = primaryKey || null;
              return out;
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'create_dataset',
        type: 'connector_action',
        name: 'Create Dataset (Starships)',
        description: 'Create dataset via Starships connector action',
        parameters: {
          connector: 'starships',
          action: 'create-dataset',
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
      { ref: 'e2', from: 'validate_input', to: 'create_dataset' },
      { ref: 'e3', from: 'create_dataset', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const createDatasetToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: createDatasetTool.name,
  description: createDatasetTool.description,
  parameters: createDatasetTool.parameters,
  blueprint: createDatasetTool.blueprint,
  slug: createDatasetTool.slug,
  version: '1.0.0',
  category: 'data',
  exampleUsage:
    '{ "name": "Leads", "description": "Sales leads", "primaryKey": "email", "columns": [{ "name": "email" }, { "name": "status" }] }',
  requiresApiKey: false,
  configurationFields: [],
};

