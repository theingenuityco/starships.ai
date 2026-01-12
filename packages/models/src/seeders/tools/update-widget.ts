import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Update Widget
 * Updates an existing widget's props (merges with existing props).
 */
export const updateWidgetTool: ToolParams = {
  name: 'Update Widget',
  slug: 'update-widget',
  description:
    "Update an existing widget by id with partial changes (props are merged, not replaced; optional name/description). Returns the updated widget record.",
  parameters: {
    type: 'object',
    properties: {
      widgetId: { type: 'string', description: 'Widget ID to update' },
      props: { type: 'object', description: 'Props to merge with existing props' },
      name: { type: 'string', description: 'Update widget name (optional)' },
      description: { type: 'string', description: 'Update widget description (optional)' },
    },
    required: ['widgetId'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Validate update inputs',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const widgetId = typeof input.widgetId === 'string' ? input.widgetId.trim() : '';
              const props = input.props && typeof input.props === 'object' ? input.props : null;
              const name = typeof input.name === 'string' ? input.name.trim() : null;
              const description = typeof input.description === 'string' ? input.description.trim() : null;

              if (!widgetId) throw new Error('widgetId is required');

              // At least one field must be provided for update
              if (!props && !name && !description) {
                throw new Error('At least one of props, name, or description must be provided');
              }

              const updateData = {};
              if (props) updateData.props = props;
              if (name) updateData.name = name;
              if (description) updateData.description = description;

              return { widgetId, ...updateData };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'update_widget',
        type: 'connector_action',
        name: 'Update Widget',
        description: 'Update widget via API',
        parameters: {
          connector: 'starships',
          action: 'update-widget',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("validate_input") }}',
          timeout: 5000,
        },
      },
      {
        ref: 'extract_result',
        type: 'code',
        name: 'Extract Result',
        description: 'Extract updated widget',
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
      { ref: 'e2', from: 'validate_input', to: 'update_widget' },
      { ref: 'e3', from: 'update_widget', to: 'extract_result' },
      { ref: 'e4', from: 'extract_result', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const updateWidgetToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: updateWidgetTool.name,
  description: updateWidgetTool.description,
  parameters: updateWidgetTool.parameters,
  blueprint: updateWidgetTool.blueprint,

  slug: 'update-widget',
  version: '1.0.1',
  category: 'utility',
  exampleUsage: '{ "widgetId": "wdgt_abc123", "props": { "title": "Q4 Sales" } }',
  requiresApiKey: false,
  configurationFields: [],
};
