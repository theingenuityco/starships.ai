import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: List Connectors
 * List all connectors for the current starship via the Starships HTTP API.
 */
export const connectorsListTool: ToolParams = {
  name: 'List Connectors',
  slug: 'list-connectors',
  description: `List all connectors configured (or available) for the current starship, including their connection status and OAuth scopes (where applicable).

When to use:
- Before creating or editing tools that rely on third-party services (LinkedIn, Discord, Starships API)
- To verify which connectors are connected, pending, or disconnected
- To inspect which managed environment keys are present or missing for each connector

Inputs:
- {} (no arguments)

Implicit environment (do not pass as arguments):
- STARSHIP_ID: derived from the current starship context

Output:
- HTTP response payload (ConnectorListResponse) from the Starships API:
  - { connectors: ConnectorListItem[] }

Behavior and limits:
- Read-only and idempotent
- Timeouts: prepare 3s, HTTP 5s
- Typical failures: missing env, 401/403, network errors, server unavailability`,
  parameters: {
    type: 'object',
    properties: {},
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'http_list_connectors',
        type: 'http_request',
        name: 'List Connectors (HTTP)',
        description: 'List connectors for the current starship via Starships HTTP API',
        parameters: {
          method: 'GET',
          // Relative path; HostRuntime/connector will prefix SERVER_URL/api/v1, inject auth,
          // and use STARSHIP_ID from env.
          url: '{{ "/starships/" + env("STARSHIP_ID") + "/connectors" }}',
          connector: 'starships',
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
  version: '1.0.2',
  category: 'automation',
  exampleUsage:
    '{} // returns ConnectorListResponse { connectors[] }, where each connector has provider, status, scopes (if applicable), and lastError (if any); env is inferred',
  requiresApiKey: false,
  configurationFields: [],
};
