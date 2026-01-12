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
    'List connectors available/configured for the current starship, including connection status and scopes/keys where applicable. Useful before building tools that rely on third-party services.',
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
        name: 'Normalize Connector Response',
        description: 'Unwrap the HTTP ApiResponse and return the ConnectorListResponse payload as-is for agents',
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

              // Return the HTTP response schema's payload (ConnectorListResponse)
              return payload.data;
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
  version: '1.0.4',
  category: 'automation',
  exampleUsage:
    '{} // returns ConnectorListResponse { connectors[] }, where each connector has provider, status, scopes (if applicable), and lastError (if any); env is inferred',
  requiresApiKey: false,
  configurationFields: [],
};
