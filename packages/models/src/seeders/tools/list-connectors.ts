import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: List Connectors
 * List all connectors for the current starship via the Starships HTTP API.
 */
export const connectorsListTool: ToolParams = {
  name: 'List Connectors',
  slug: 'list-connectors',
  description:
    'List connectors available/configured for the current starship. Returns a lean array (provider, status, authType, scopes, actions). Useful before building tools that rely on third-party services.',
  parameters: {
    type: 'object',
    properties: {},
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'http_list_connectors',
        type: 'connector_action',
        name: 'List Connectors (Starships)',
        description: 'List connectors for the current starship via Starships connector endpoint',
        parameters: {
          connector: 'starships',
          action: 'list-connectors',
          failOnNon2xx: true,
          args: {
            starshipId: '{{ String(env("STARSHIP_ID") ?? "") }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'summarize',
        type: 'code',
        name: 'Summarize Connectors',
        description: 'Unwrap ApiResponse and return a lean connector list',
        parameters: {
          code: `
            async function main(ctx) {
              // Expect the HTTP node to return a response object with { status, headers, body, url }.
              // The body MUST be an ApiResponse<ConnectorListResponse>:
              //   { data: { connectors: ConnectorListItem[] } }
              const raw = ctx.input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;

              if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
                throw new Error('Invalid connector response shape: expected { data: { connectors: [] } }');
              }

              const data = payload.data;
              const connectors = data && typeof data === 'object' && Array.isArray(data.connectors) ? data.connectors : [];

              // Return a lean list to avoid sending connector template runtime fields (endpoints/baseUrl/etc)
              return connectors
                // Hide the internal Starships connector; it's always present and not actionable for users.
                .filter((c) => !(c && typeof c === 'object' && c.provider === 'starships'))
                .map((c) => {
                const template = c && typeof c === 'object' ? c.template : null;
                const auth = template && typeof template === 'object' ? template.auth : null;
                const authType = auth && typeof auth === 'object' && typeof auth.type === 'string' ? auth.type : undefined;
                const scopes = c && typeof c === 'object' && Array.isArray(c.scopes) ? c.scopes.filter((s) => typeof s === 'string') : undefined;
                const endpointsRaw = template && typeof template === 'object' && Array.isArray(template.endpoints) ? template.endpoints : undefined;
                const actions =
                  endpointsRaw && endpointsRaw.length > 0
                    ? endpointsRaw
                        .map((e) => {
                          if (!e || typeof e !== 'object') return null;
                          const name = typeof e.name === 'string' ? e.name : undefined;
                          const schema = e.parameters && typeof e.parameters === 'object' ? e.parameters : undefined;
                          if (!name) return null;
                          return { name, ...(schema ? { schema } : {}) };
                        })
                        .filter(Boolean)
                    : undefined;

                return {
                  provider: c && typeof c === 'object' ? c.provider : undefined,
                  status: c && typeof c === 'object' ? c.status : undefined,
                  authType,
                  ...(scopes && scopes.length > 0 ? { scopes } : {}),
                  ...(actions && actions.length > 0 ? { actions } : {}),
                };
              });
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
          output: '{{ lastOutputOf("summarize") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'http_list_connectors' },
      { ref: 'e2', from: 'http_list_connectors', to: 'summarize' },
      { ref: 'e3', from: 'summarize', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const connectorsListToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: connectorsListTool.name,
  description: connectorsListTool.description,
  parameters: connectorsListTool.parameters,
  blueprint: connectorsListTool.blueprint,

  slug: 'list-connectors',
  version: '1.0.10',
  category: 'automation',
  exampleUsage:
    '{} // returns lean connectors[]: { provider, status, authType?, scopes?, actions?: [{ name, schema? }] } (starships connector omitted)',
  requiresApiKey: false,
  configurationFields: [],
};
