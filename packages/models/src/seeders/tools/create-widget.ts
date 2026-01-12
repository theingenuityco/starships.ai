import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Create Widget (Simplified)
 * Creates a widget with a type and props extracted from the user prompt.
 *
 * Two modes:
 * 1. Search mode: Provide 'query' to search for components
 * 2. Create mode: Provide 'widgetType' + 'props' to create widget
 */
export const createWidgetTool: ToolParams = {
  name: 'Create Widget',
  slug: 'create-widget',
  description:
    'Create a widget by either searching component docs (query) or creating directly (widgetType + props). Always include name + description; returns search results or the created widget record.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Widget display name' },
      description: { type: 'string', description: 'Widget purpose' },
      query: { type: 'string', description: 'Component search query (search mode)' },
      widgetType: { type: 'string', description: 'Widget type (create mode)' },
      props: { type: 'object', description: 'Component props with data (create mode)' },
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
        description: 'Validate widget creation inputs and determine mode',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const name = typeof input.name === 'string' ? input.name.trim() : '';
              const description = typeof input.description === 'string' ? input.description.trim() : '';
              const query = typeof input.query === 'string' ? input.query.trim() : '';
              const widgetType = typeof input.widgetType === 'string' ? input.widgetType.trim() : '';
              const props = input.props && typeof input.props === 'object' ? input.props : null;

              if (!name) throw new Error('name is required');
              if (!description) throw new Error('description is required');

              // Mode: 'search' if query provided without widgetType, 'create' if widgetType + props provided
              const mode = query && !widgetType ? 'search' : 'create';

              if (mode === 'search') {
                if (!query) throw new Error('query is required for component search');
              } else {
                // create mode
                if (!widgetType) throw new Error('widgetType is required for widget creation');
                if (!props) throw new Error('props is required for widget creation');
              }

              return { name, description, query, widgetType, props: props || {}, mode, starshipId: ctx.env('STARSHIP_ID') };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'route_mode',
        type: 'conditional',
        name: 'Route Mode',
        description: 'Route to search or create based on mode',
        parameters: {
          condition: '{{ lastOutputOf("validate_input").mode === "search" }}',
        },
      },
      {
        ref: 'search_components',
        type: 'connector_action',
        name: 'Search Component Docs',
        description: 'Search component documentation',
        parameters: {
          connector: 'starships',
          action: 'search-docs',
          args: {
            q: '{{ (lastOutputOf("validate_input") || {}).query }}',
            limit: 10,
          },
          timeout: 5000,
        },
      },
      {
        ref: 'extract_search_results',
        type: 'code',
        name: 'Extract Search Results',
        description: 'Extract search results from response',
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
      {
        ref: 'save_widget',
        type: 'connector_action',
        name: 'Save Widget',
        description: 'Save widget to database via API',
        parameters: {
          connector: 'starships',
          action: 'create-widget',
          args: {
            name: '{{ (lastOutputOf("validate_input") || {}).name }}',
            description: '{{ (lastOutputOf("validate_input") || {}).description }}',
            widgetType: '{{ (lastOutputOf("validate_input") || {}).widgetType }}',
            props: '{{ (lastOutputOf("validate_input") || {}).props }}',
            starshipId: '{{ (lastOutputOf("validate_input") || {}).starshipId }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'extract_result',
        type: 'code',
        name: 'Extract Result',
        description: 'Extract widget data from API response',
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
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ lastOutputOf("extract_result") || lastOutputOf("extract_search_results") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate_input' },
      { ref: 'e2', from: 'validate_input', to: 'route_mode' },
      { ref: 'e3', from: 'route_mode', to: 'search_components', condition: 'true' },
      { ref: 'e4', from: 'search_components', to: 'extract_search_results' },
      { ref: 'e5', from: 'extract_search_results', to: 'end_1' },
      { ref: 'e6', from: 'route_mode', to: 'save_widget', condition: 'false' },
      { ref: 'e7', from: 'save_widget', to: 'extract_result' },
      { ref: 'e8', from: 'extract_result', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const createWidgetToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: createWidgetTool.name,
  description: createWidgetTool.description,
  parameters: createWidgetTool.parameters,
  blueprint: createWidgetTool.blueprint,

  slug: 'create-widget',
  version: '1.0.0',
  category: 'utility',
  exampleUsage: 'Step 1 (search): { "name": "Sales Chart", "description": "Pie chart showing sales", "query": "pie chart" }\nStep 2 (create): { "name": "Sales Chart", "description": "Pie chart showing sales", "widgetType": "PieChart", "props": { "title": "Q4 Sales", "segments": [{ "label": "Electronics", "value": 40 }] } }',
  requiresApiKey: false,
  configurationFields: [],
};
