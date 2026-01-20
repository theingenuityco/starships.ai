import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Suggest Connectors
 *
 * Creates (or reuses) a deterministic widget that renders one or more connector cards,
 * then emits a `ui_action` to render it inline in the conversation.
 *
 * Uses the standard render_widget pipeline so the server can persist the association
 * in conversation_widgets and replay it on reload.
 */
export const suggestConnectorsTool: ToolParams = {
  name: 'Suggest Connectors',
  slug: 'suggest-connectors',
  description:
    'Suggest one or more connector providers by rendering connector cards inline in chat (via render_widget). Creates or reuses a saved widget with a deterministic slug.',
  parameters: {
    type: 'object',
    properties: {
      providers: { type: 'array', items: { type: 'string' }, description: 'Connector providers to suggest (e.g. ["slack","notion"])' },
    },
    required: ['providers'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate_input',
        type: 'code',
        name: 'Validate Input',
        description: 'Normalize providers and compute deterministic widget slug',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const raw = Array.isArray(input.providers) ? input.providers : [];
              const providers = raw
                .map((p) => String(p ?? '').trim().toLowerCase())
                .filter((p) => p.length > 0);

              // Dedup + stable order
              const unique = Array.from(new Set(providers)).sort();
              if (unique.length === 0) throw new Error('providers is required');

              // Cap to keep widget + slug bounded.
              const capped = unique.slice(0, 12);

              const starshipId = ctx.env('STARSHIP_ID');
              if (!starshipId || typeof starshipId !== 'string' || !starshipId.trim()) throw new Error('STARSHIP_ID is required');

              // Safe slug helpers: lower, hyphenate, strip unsafe chars.
              const safe = (s) => String(s || '')
                .trim()
                .toLowerCase()
                .replace(/_/g, '-')
                .replace(/[^a-z0-9-]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');

              const joined = capped.map(safe).filter(Boolean).join('-');

              // Small deterministic hash (FNV-1a-ish)
              const hash32 = (str) => {
                let h = 2166136261;
                for (let i = 0; i < str.length; i++) {
                  h ^= str.charCodeAt(i);
                  h = Math.imul(h, 16777619);
                }
                // unsigned
                return (h >>> 0).toString(16);
              };

              const base = 'connector-suggestions';
              const h = hash32(joined);
              // Keep under 100 chars (server validation).
              const middle = joined.length > 0 ? joined.slice(0, 60) : 'providers';
              const slug = safe(\`\${base}-\${middle}-\${h}\`).slice(0, 100);

              const props = {
                starshipId: String(starshipId).trim(),
                providers: capped,
                hideSearch: true,
                hideDisconnect: false,
              };

              return {
                starshipId: String(starshipId).trim(),
                slug,
                providers: capped,
                widgetType: 'ConnectorSuggestionCard',
                props,
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'fetch_catalog',
        type: 'http_request',
        name: 'Fetch Connector Catalog',
        description: 'Fetch connector catalog to map provider -> display name',
        parameters: {
          url: '{{ String(env("SERVER_URL") ?? "") + "/api/v1/connectors/catalog" }}',
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'extract_catalog',
        type: 'code',
        name: 'Extract Catalog',
        description: 'Extract connector catalog items (provider -> name)',
        parameters: {
          code: `
            async function main(ctx) {
              const raw = ctx.input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              let payload = hasBody ? raw.body : raw;
              if (typeof payload === 'string') {
                try {
                  payload = JSON.parse(payload);
                } catch (e) {
                  payload = {};
                }
              }
              const data = (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) ? payload.data : payload;
              const connectors = data && typeof data === 'object' && Array.isArray(data.connectors) ? data.connectors : [];
              return connectors
                .map((c) => ({
                  provider: c && typeof c === 'object' ? String(c.provider ?? '') : '',
                  name: c && typeof c === 'object' ? String(c.name ?? '') : '',
                }))
                .filter((c) => c.provider.trim().length > 0);
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'build_widget_meta',
        type: 'code',
        name: 'Build Widget Meta',
        description: 'Build widget name/description using connector display names',
        parameters: {
          code: `
            async function main(ctx) {
              const base = (ctx.lastOutputOf && ctx.lastOutputOf('validate_input')) || {};
              const providers = Array.isArray(base.providers) ? base.providers.map((p) => String(p)) : [];
              const catalog = (ctx.lastOutputOf && ctx.lastOutputOf('extract_catalog')) || [];

              const nameByProvider = new Map();
              for (const c of catalog) {
                if (!c || typeof c !== 'object') continue;
                const provider = String(c.provider ?? '').trim();
                const name = String(c.name ?? '').trim();
                if (provider) nameByProvider.set(provider, name || provider);
              }

              const display = providers.map((p) => nameByProvider.get(String(p)) || String(p));
              const list = display.filter((s) => String(s).trim().length > 0);
              const joined = list.join(', ');
              const title = list.length === 1 ? \`Connect \${list[0]}\` : \`Connectors: \${joined}\`;
              const description =
                list.length === 1
                  ? \`Suggested connector: \${list[0]}\`
                  : \`Suggested connectors: \${joined}\`;

              return {
                starshipId: String(base.starshipId || ''),
                slug: String(base.slug || ''),
                widgetType: String(base.widgetType || 'ConnectorSuggestionCard'),
                props: base.props && typeof base.props === 'object' ? base.props : { starshipId: String(base.starshipId || ''), providers },
                providers,
                name: title,
                description,
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
        name: 'Update Widget (Title)',
        description: 'Update existing widget name/description to use connector display names',
        parameters: {
          connector: 'starships',
          action: 'update-widget',
          failOnNon2xx: true,
          args: {
            id: '{{ (lastOutputOf("extract_found_widget") || {}).id }}',
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
        description: 'Create the suggestion widget (deterministic slug)',
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
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output:
            '{{ lastOutputOf("extract_updated_widget") ? lastOutputOf("extract_updated_widget") : lastOutputOf("extract_created_widget") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate_input' },
      { ref: 'e2', from: 'validate_input', to: 'fetch_catalog' },
      { ref: 'e3', from: 'fetch_catalog', to: 'extract_catalog' },
      {
        ref: 'e4',
        from: 'extract_catalog',
        to: 'build_widget_meta',
      },
      {
        ref: 'e5',
        from: 'build_widget_meta',
        to: 'search_widgets',
      },
      { ref: 'e6', from: 'search_widgets', to: 'extract_found_widget' },
      { ref: 'e7', from: 'extract_found_widget', to: 'widget_exists?' },

      { ref: 'e_exists', from: 'widget_exists?', to: 'update_existing_widget', condition: 'exists' },
      { ref: 'e_missing', from: 'widget_exists?', to: 'create_widget', condition: 'missing' },

      { ref: 'e_update', from: 'update_existing_widget', to: 'extract_updated_widget' },
      { ref: 'e_emit_existing', from: 'extract_updated_widget', to: 'emit_existing' },

      { ref: 'e_create', from: 'create_widget', to: 'extract_created_widget' },
      { ref: 'e_after_create', from: 'extract_created_widget', to: 'emit_created' },

      { ref: 'e_end_existing', from: 'emit_existing', to: 'end_1' },
      { ref: 'e_end_created', from: 'emit_created', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const suggestConnectorsToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: suggestConnectorsTool.name,
  description: suggestConnectorsTool.description,
  parameters: suggestConnectorsTool.parameters,
  blueprint: suggestConnectorsTool.blueprint,

  slug: 'suggest-connectors',
  version: '1.0.0',
  category: 'automation',
  exampleUsage: '{ "providers": ["slack", "notion"] }',
  requiresApiKey: false,
  configurationFields: [],
};
