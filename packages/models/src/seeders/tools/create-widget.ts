import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Create Widget (Simplified)
 * Creates a widget with a type and props extracted from the user prompt.
 */
export const createWidgetTool: ToolParams = {
  name: 'Create Widget',
  slug: 'create-widget',
  description:
    'Create (persist) a widget given a widgetType + props. Always include name + description; returns the created widget record.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Widget display name' },
      description: { type: 'string', description: 'Widget purpose' },
      widgetType: { type: 'string', description: 'Widget type (component name)' },
      props: { type: 'object', description: 'Component props with data' },
    },
    required: ['name', 'description', 'widgetType', 'props'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Validate widget creation inputs',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const name = typeof input.name === 'string' ? input.name.trim() : '';
              const description = typeof input.description === 'string' ? input.description.trim() : '';
              const widgetType = typeof input.widgetType === 'string' ? input.widgetType.trim() : '';
              const props = input.props && typeof input.props === 'object' ? input.props : null;

              if (!name) throw new Error('name is required');
              if (!description) throw new Error('description is required');
              if (!widgetType) throw new Error('widgetType is required for widget creation');
              if (!props) throw new Error('props is required for widget creation');

              return { name, description, widgetType, props: props || {}, starshipId: ctx.env('STARSHIP_ID') };
            }
          `,
          timeout: 3000,
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
          failOnNon2xx: true,
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
          output: '{{ lastOutputOf("extract_result") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate_input' },
      { ref: 'e2', from: 'validate_input', to: 'save_widget' },
      { ref: 'e3', from: 'save_widget', to: 'extract_result' },
      { ref: 'e4', from: 'extract_result', to: 'end_1' },
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
  version: '1.1.0',
  category: 'utility',
  exampleUsage:
    '{ "name": "Sales Chart", "description": "Pie chart showing sales", "widgetType": "PieChart", "props": { "title": "Q4 Sales", "segments": [{ "label": "Electronics", "value": 40 }] } }',
  requiresApiKey: false,
  configurationFields: [],
};
