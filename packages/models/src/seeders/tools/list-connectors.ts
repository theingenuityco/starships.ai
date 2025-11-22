import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: List Connectors
 * List all connectors for the current starship via the Starships HTTP API.
 */
export const connectorsListTool: ToolParams = {
  name: 'List Connectors',
  slug: 'list-connectors',
  description: `List all connectors configured (or available) for the current starship, including their connection status and required environment variable coverage.

When to use:
- Before creating or editing tools that rely on third-party services (LinkedIn, Discord, Starships API)
- To verify which connectors are connected, pending, or disconnected
- To inspect which managed environment keys are present or missing for each connector

Inputs:
- {} (no arguments)

Implicit environment (do not pass as arguments):
- STARSHIP_ID: derived from the current starship context

Output:
- Array of connectors with:
  - provider: connector provider id (e.g., "linkedin", "discord", "starships")
  - status: "connected" | "pending" | "disconnected" | "error"
  - managedEnvKeys: [{ key, present }] describing required/optional env keys and whether they are set
  - lastError: last error message (if any)

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
        name: 'Summarize Connectors',
        description: 'Normalize ConnectorListResponse into a concise, safe structure for agents',
        parameters: {
          code: `
            async function main(ctx) {
              // Expect the HTTP node to return a response object with { status, headers, body, url }.
              // The body is a ConnectorListResponse: { starshipId, connectors: ConnectorListItem[] }.
              const raw = ctx.$input;
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;

              const isObject = payload && typeof payload === 'object';
              const data = isObject && Array.isArray(payload.connectors)
                ? payload.connectors
                : (Array.isArray(payload) ? payload : []);

              return (Array.isArray(data) ? data : []).map((c) => ({
                provider: c && c.provider,
                status: c && c.status,
                managedEnvKeys: Array.isArray(c && c.managedEnvKeys)
                  ? c.managedEnvKeys.map((k) => ({
                      key: k && k.key,
                      present: !!(k && k.present),
                    }))
                  : [],
                lastError: c && c.lastError,
              }));
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
          output: '{{ $lastOutputOf("summarize")[0].json }}',
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
  version: '1.0.0',
  category: 'automation',
  exampleUsage: '{} // returns array of connectors with provider, status, managedEnvKeys, and lastError (if any); env is inferred',
  requiresApiKey: false,
  configurationFields: [],
};
