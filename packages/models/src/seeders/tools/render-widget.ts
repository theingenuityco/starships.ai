import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Render Widget
 *
 * Emits a `ui_action` that the client consumes to render a widget.
 *
 * IMPORTANT:
 * - This tool is intentionally UI-driven and tool-name agnostic on the client.
 * - It does NOT create/update widgets in the database.
 * - To create/update saved widgets, use create-widget / update-widget.
 */
export const renderWidgetTool: ToolParams = {
  name: 'Render Widget',
  slug: 'render-widget',
  description:
    'Render a widget in the conversation UI by emitting a ui_action (render_widget). Accepts a widget payload (widgetType + props + optional metadata). Does not persist data.',
  parameters: {
    type: 'object',
    properties: {
      widget: {
        type: 'object',
        description: 'Widget payload to render (must include widgetType + props)',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          widgetType: { type: 'string' },
          props: { type: 'object' },
        },
        required: ['widgetType', 'props'],
      },
      // Optional: allow callers to pass a stable key for dedupe, or metadata like toolCallId
      toolCallId: { type: 'string', description: 'Optional tool call id (for correlation/dedupe)' },
    },
    required: ['widget'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Validate widget payload shape',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const widget = input.widget && typeof input.widget === 'object' ? input.widget : null;
              if (!widget) throw new Error('widget is required');
              const widgetType = typeof widget.widgetType === 'string' ? widget.widgetType.trim() : '';
              const props = widget.props && typeof widget.props === 'object' ? widget.props : null;
              if (!widgetType) throw new Error('widget.widgetType is required');
              if (!props) throw new Error('widget.props is required');
              const name = typeof widget.name === 'string' ? widget.name.trim() : undefined;
              const description = typeof widget.description === 'string' ? widget.description : undefined;
              const id = typeof widget.id === 'string' ? widget.id.trim() : undefined;
              const toolCallId = typeof input.toolCallId === 'string' ? input.toolCallId.trim() : undefined;
              return { widget: { ...(id ? { id } : {}), ...(name ? { name } : {}), ...(description ? { description } : {}), widgetType, props }, ...(toolCallId ? { toolCallId } : {}) };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'emit_ui_action',
        type: 'ui_action',
        name: 'Emit render_widget',
        description: 'Emit ui_action consumed by the client to render a widget',
        parameters: {
          action: 'render_widget',
          payload: {
            widget: '{{ (lastOutputOf("validate_input") || {}).widget }}',
            toolCallId: '{{ (lastOutputOf("validate_input") || {}).toolCallId }}',
          },
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ lastOutputOf("validate_input") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate_input' },
      { ref: 'e2', from: 'validate_input', to: 'emit_ui_action' },
      { ref: 'e3', from: 'emit_ui_action', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const renderWidgetToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: renderWidgetTool.name,
  description: renderWidgetTool.description,
  parameters: renderWidgetTool.parameters,
  blueprint: renderWidgetTool.blueprint,

  slug: 'render-widget',
  version: '1.0.0',
  category: 'utility',
  exampleUsage:
    '{ "widget": { "name": "Revenue chart", "widgetType": "BarChart", "props": { "title": "Revenue", "data": [{ "name": "Jan", "value": 120 }] } } }',
  requiresApiKey: false,
  configurationFields: [],
};

