import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Search Views
 * Search views for the current starship.
 */
export const searchViewsTool: ToolParams = {
  name: 'Search Views',
  slug: 'search-views',
  description: 'Search views for the current starship by name/slug. Returns matching view records.',
  parameters: {
    type: 'object',
    properties: {
      starshipId: { type: 'string', description: 'Starship id (optional; defaults to STARSHIP_ID)' },
      name: { type: 'string', description: 'Name contains (case-insensitive)' },
      slug: { type: 'string', description: 'Exact slug match' },
      limit: { type: 'number', description: 'Max results' },
      offset: { type: 'number', description: 'Offset for pagination' },
    },
    required: [],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Payload',
        description: 'Normalize search params; default starshipId from env',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const starshipId = typeof input.starshipId === 'string' && input.starshipId.trim() ? input.starshipId.trim() : ctx.env('STARSHIP_ID');
              if (!starshipId || typeof starshipId !== 'string' || !starshipId.trim()) throw new Error('STARSHIP_ID is required');
              const name = typeof input.name === 'string' ? input.name.trim() : '';
              const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
              const limit = input.limit == null ? undefined : Number(input.limit);
              const offset = input.offset == null ? undefined : Number(input.offset);
              const out = { starshipId: starshipId.trim(), ...(name ? { name } : {}), ...(slug ? { slug } : {}) };
              if (Number.isFinite(limit) && limit > 0) out.limit = limit;
              if (Number.isFinite(offset) && offset >= 0) out.offset = offset;
              return out;
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'search',
        type: 'connector_action',
        name: 'Search Views (Starships)',
        description: 'Search views via Starships connector',
        parameters: {
          connector: 'starships',
          action: 'search-views',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("prepare") }}',
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
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'search' },
      { ref: 'e3', from: 'search', to: 'extract' },
      { ref: 'e4', from: 'extract', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const searchViewsToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: searchViewsTool.name,
  description: searchViewsTool.description,
  parameters: searchViewsTool.parameters,
  blueprint: searchViewsTool.blueprint,
  slug: searchViewsTool.slug,
  version: '1.0.0',
  category: 'utility',
  exampleUsage: '{ "name": "Dashboard", "limit": 10 }',
  requiresApiKey: false,
  configurationFields: [],
};

