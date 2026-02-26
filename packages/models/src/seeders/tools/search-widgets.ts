import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Search Widgets
 * Query saved widgets for the current starship.
 *
 * IMPORTANT: This tool does NOT emit UI actions and should NOT be used to render widgets.
 * Render widgets via Views (persist a view root and use the Views runtime).
 */
export const searchWidgetsTool: ToolParams = {
  name: 'Search Widgets',
  slug: 'search-widgets',
  description:
    'Search saved widgets for the current starship by name/slug/widgetType. Returns matching widget records (including widgetType + props). Does not render anything.',
  parameters: {
    type: 'object',
    properties: {
      starshipId: { type: 'string', description: 'Starship ID (optional; defaults to runtime STARSHIP_ID)' },
      name: { type: 'string', description: 'Name contains (case-insensitive)' },
      slug: { type: 'string', description: 'Exact slug match' },
      widgetType: { type: 'string', description: 'Exact widgetType match (e.g. "BarChart")' },
      limit: { type: 'number', description: 'Max results (default server-side)' },
      offset: { type: 'number', description: 'Offset for pagination' },
    },
    required: [],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Normalize search params',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const starshipId = typeof input.starshipId === 'string' && input.starshipId.trim() ? input.starshipId.trim() : ctx.env('STARSHIP_ID');
              const name = typeof input.name === 'string' ? input.name.trim() : '';
              const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
              const widgetType = typeof input.widgetType === 'string' ? input.widgetType.trim() : '';

              const limit = input.limit == null ? undefined : Number(input.limit);
              const offset = input.offset == null ? undefined : Number(input.offset);
              const out = { starshipId, ...(name ? { name } : {}), ...(slug ? { slug } : {}), ...(widgetType ? { widgetType } : {}) };
              if (Number.isFinite(limit) && limit > 0) out.limit = limit;
              if (Number.isFinite(offset) && offset >= 0) out.offset = offset;
              return out;
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'search_widgets',
        type: 'connector_action',
        name: 'Search Widgets',
        description: 'Query widgets via API',
        parameters: {
          connector: 'starships',
          action: 'search-widgets',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("validate_input") }}',
          timeout: 5000,
        },
      },
      {
        ref: 'extract_result',
        type: 'code',
        name: 'Extract Result',
        description: 'Extract data from API response',
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
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ lastOutputOf("extract_result") }}' } },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate_input' },
      { ref: 'e2', from: 'validate_input', to: 'search_widgets' },
      { ref: 'e3', from: 'search_widgets', to: 'extract_result' },
      { ref: 'e4', from: 'extract_result', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const searchWidgetsToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: searchWidgetsTool.name,
  description: searchWidgetsTool.description,
  parameters: searchWidgetsTool.parameters,
  blueprint: searchWidgetsTool.blueprint,

  slug: 'search-widgets',
  version: '1.0.0',
  category: 'utility',
  exampleUsage: '{ "name": "Revenue", "widgetType": "BarChart", "limit": 10 }',
  requiresApiKey: false,
  configurationFields: [],
};

