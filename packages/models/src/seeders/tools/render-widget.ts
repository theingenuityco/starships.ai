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
    'Render an existing saved widget by slug in the conversation UI by emitting a ui_action (render_widget). Looks up the widget for the current STARSHIP_ID and renders it.',
  parameters: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Widget slug to render (within current starship)' },
    },
    required: ['slug'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Validate widget slug',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
              if (!slug) throw new Error('slug is required');
              const starshipId = ctx.env('STARSHIP_ID');
              if (!starshipId || typeof starshipId !== 'string' || !starshipId.trim()) throw new Error('STARSHIP_ID is required');
              return { slug, starshipId: starshipId.trim(), limit: 1 };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'fetch_widget',
        type: 'connector_action',
        name: 'Fetch Widget',
        description: 'Find the widget by slug in the current starship',
        parameters: {
          connector: 'starships',
          action: 'search-widgets',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("validate_input") }}',
          timeout: 5000,
        },
      },
      {
        ref: 'extract_widget',
        type: 'code',
        name: 'Extract Widget',
        description: 'Extract the first widget from the API response',
        parameters: {
          code: `
            async function main(ctx) {
              const raw = ctx.input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;
              const data = (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) ? payload.data : payload;
              const widgets = Array.isArray(data) ? data : (data && typeof data === 'object' && Array.isArray(data.widgets)) ? data.widgets : null;
              if (!widgets || !Array.isArray(widgets) || widgets.length === 0) {
                throw new Error('Widget not found for slug');
              }
              return widgets[0];
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
            widget: '{{ lastOutputOf("extract_widget") }}',
          },
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ lastOutputOf("extract_widget") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate_input' },
      { ref: 'e2', from: 'validate_input', to: 'fetch_widget' },
      { ref: 'e3', from: 'fetch_widget', to: 'extract_widget' },
      { ref: 'e4', from: 'extract_widget', to: 'emit_ui_action' },
      { ref: 'e5', from: 'emit_ui_action', to: 'end_1' },
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
  version: '1.1.0',
  category: 'utility',
  exampleUsage:
    '{ "slug": "revenue-by-month" }',
  requiresApiKey: false,
  configurationFields: [],
};

