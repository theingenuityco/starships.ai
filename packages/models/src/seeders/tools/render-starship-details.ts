import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Render Starship Details
 *
 * Creates (or reuses) a deterministic widget that renders a starship details form
 * (name, description, websiteUrl) inline in chat, then emits a `ui_action` to render it.
 *
 * The widget itself performs the API update from the client on submit.
 */
export const renderStarshipDetailsTool: ToolParams = {
  name: 'Render Starship Details',
  slug: 'render-starship-details',
  description:
    'Render an inline widget showing starship details (name, description, website URL) and allowing updates. Creates or reuses a saved widget with a deterministic slug and emits render_widget.',
  parameters: {
    type: 'object',
    properties: {},
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'build_widget_meta',
        type: 'code',
        name: 'Build Widget Meta',
        description: 'Build deterministic slug + widget payload for this starship',
        parameters: {
          code: `
            async function main(ctx) {
              const starshipId = ctx.env('STARSHIP_ID');
              if (!starshipId || typeof starshipId !== 'string' || !starshipId.trim()) throw new Error('STARSHIP_ID is required');

              const slug = 'starship-details';
              const widgetType = 'StarshipDetails';
              const props = { starshipId: String(starshipId).trim() };

              return {
                starshipId: String(starshipId).trim(),
                slug,
                widgetType,
                props,
                name: 'Starship details',
                description: 'View and update your starship name, description, and website URL',
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'search_widgets',
        type: 'connector_action',
        name: 'Search Widgets',
        description: 'Look up existing widget by deterministic slug',
        parameters: {
          connector: 'starships',
          action: 'search-widgets',
          failOnNon2xx: true,
          args: {
            starshipId: '{{ (lastOutputOf("build_widget_meta") || {}).starshipId }}',
            slug: '{{ (lastOutputOf("build_widget_meta") || {}).slug }}',
            limit: 1,
          },
          timeout: 5000,
        },
      },
      {
        ref: 'extract_found_widget',
        type: 'code',
        name: 'Extract Found Widget',
        description: 'Extract first widget if it exists, else null',
        parameters: {
          code: `
            async function main(ctx) {
              const raw = ctx.input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;
              const data = (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) ? payload.data : payload;
              const widgets = Array.isArray(data) ? data : (data && typeof data === 'object' && Array.isArray(data.widgets)) ? data.widgets : null;
              if (!widgets || !Array.isArray(widgets) || widgets.length === 0) return null;
              return widgets[0];
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'widget_exists?',
        type: 'conditional',
        name: 'Widget exists?',
        description: 'Branch: reuse existing widget or create it',
        parameters: {
          condition: '{{ lastOutputOf("extract_found_widget") ? "exists" : "missing" }}',
        },
      },
      {
        ref: 'update_existing_widget',
        type: 'connector_action',
        name: 'Update Widget (Meta)',
        description: 'Update existing widget name/description/props',
        parameters: {
          connector: 'starships',
          action: 'update-widget',
          failOnNon2xx: true,
          args: {
            widgetId: '{{ (lastOutputOf("extract_found_widget") || {}).id }}',
            name: '{{ (lastOutputOf("build_widget_meta") || {}).name }}',
            description: '{{ (lastOutputOf("build_widget_meta") || {}).description }}',
            props: '{{ (lastOutputOf("build_widget_meta") || {}).props }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'extract_updated_widget',
        type: 'code',
        name: 'Extract Updated Widget',
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
        ref: 'emit_existing',
        type: 'ui_action',
        name: 'Emit render_widget (existing)',
        description: 'Render existing widget in the conversation UI',
        parameters: {
          action: 'render_widget',
          payload: {
            widget: '{{ lastOutputOf("extract_updated_widget") }}',
          },
        },
      },
      {
        ref: 'create_widget',
        type: 'connector_action',
        name: 'Create Widget',
        description: 'Create the starship details form widget (deterministic slug)',
        parameters: {
          connector: 'starships',
          action: 'create-widget',
          failOnNon2xx: true,
          args: {
            starshipId: '{{ (lastOutputOf("build_widget_meta") || {}).starshipId }}',
            slug: '{{ (lastOutputOf("build_widget_meta") || {}).slug }}',
            name: '{{ (lastOutputOf("build_widget_meta") || {}).name }}',
            description: '{{ (lastOutputOf("build_widget_meta") || {}).description }}',
            widgetType: '{{ (lastOutputOf("build_widget_meta") || {}).widgetType }}',
            props: '{{ (lastOutputOf("build_widget_meta") || {}).props }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'extract_created_widget',
        type: 'code',
        name: 'Extract Created Widget',
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
        ref: 'emit_created',
        type: 'ui_action',
        name: 'Emit render_widget (created)',
        description: 'Render newly created widget in the conversation UI',
        parameters: {
          action: 'render_widget',
          payload: {
            widget: '{{ lastOutputOf("extract_created_widget") }}',
          },
        },
      },
      {
        ref: 'ok_output',
        type: 'code',
        name: 'OK Output',
        description: 'Return minimal tool output',
        parameters: {
          code: `
            async function main() {
              return { ok: true };
            }
          `,
          timeout: 1000,
        },
      },
      {
        ref: 'fetch_starship',
        type: 'connector_action',
        name: 'Fetch Starship',
        description: 'Fetch current starship details (name/description/websiteUrl) to return as tool output',
        parameters: {
          connector: 'starships',
          action: 'get-starship',
          failOnNon2xx: true,
          args: {
            starshipId: '{{ (lastOutputOf("build_widget_meta") || {}).starshipId }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'extract_starship',
        type: 'code',
        name: 'Extract Starship',
        description: 'Extract starship model from API response',
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
          output: '{{ lastOutputOf("ok_output") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'build_widget_meta' },
      { ref: 'e2', from: 'build_widget_meta', to: 'search_widgets' },
      { ref: 'e3', from: 'search_widgets', to: 'extract_found_widget' },
      { ref: 'e4', from: 'extract_found_widget', to: 'widget_exists?' },

      { ref: 'e_exists', from: 'widget_exists?', to: 'update_existing_widget', condition: 'exists' },
      { ref: 'e_missing', from: 'widget_exists?', to: 'create_widget', condition: 'missing' },

      { ref: 'e_update', from: 'update_existing_widget', to: 'extract_updated_widget' },
      { ref: 'e_emit_existing', from: 'extract_updated_widget', to: 'emit_existing' },

      { ref: 'e_create', from: 'create_widget', to: 'extract_created_widget' },
      { ref: 'e_emit_created', from: 'extract_created_widget', to: 'emit_created' },

      { ref: 'e_after_emit_existing', from: 'emit_existing', to: 'ok_output' },
      { ref: 'e_after_emit_created', from: 'emit_created', to: 'ok_output' },
      { ref: 'e_end', from: 'ok_output', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const renderStarshipDetailsToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: renderStarshipDetailsTool.name,
  description: renderStarshipDetailsTool.description,
  parameters: renderStarshipDetailsTool.parameters,
  blueprint: renderStarshipDetailsTool.blueprint,

  slug: renderStarshipDetailsTool.slug,
  version: '1.0.1',
  category: 'automation',
  exampleUsage: '{}',
  requiresApiKey: false,
  configurationFields: [],
};
