import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: List Tools
 * List all tools for the specified starship using server REST API
 */
export const toolListTool: ToolParams = {
  name: 'List Tools',
  slug: 'list-tools',
  description: `List all tools deployed on the current starship. This is a discovery list; it does not indicate which tools this agent can call.

When to use:
- Inventory and discovery of starship tools, e.g. to find a tool id/slug before creation/update/test.
- Note: This returns tools available on the starship, not the subset assigned to the calling agent.
- Note: Listing a tool does not grant permission to call it; only tools present in your available function list for this turn are callable.

Inputs:
- {} (no arguments)

Implicit environment (do not pass as arguments):
- BASE_URL: derived from agent.state.baseUrl
- AUTH_TOKEN: derived from agent.state.authToken (sent as Bearer)
- STARSHIP_ID: derived from agent.state.starshipId

Output:
- Array of { slug, name, description, isEnabled } (deliberately lean; heavy fields like blueprint are omitted)

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
        ref: 'prepare',
        type: 'code',
        name: 'Prepare HTTP Request',
        description: 'Prepare request metadata using runtime configuration',
        parameters: {
          code: `
            async function main(ctx) {
              const baseUrl = ctx.$config ? ctx.$config('BASE_URL') : undefined;
              const authToken = ctx.$config ? ctx.$config('AUTH_TOKEN') : undefined;
              const starshipId = ctx.$config ? ctx.$config('STARSHIP_ID') : undefined;

              if (!baseUrl || !authToken || !starshipId) {
                throw new Error('Missing required runtime configuration for tools.list');
              }

              return {
                baseUrl,
                authToken,
                starshipId,
                request: {
                  method: 'GET',
                  url: baseUrl + '/starships/' + starshipId + '/tools',
                  headers: {
                    Authorization: 'Bearer ' + authToken,
                  },
                },
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_list',
        type: 'http_request',
        name: 'List Tools (HTTP)',
        description: 'List tools via Starships HTTP API',
        parameters: {
          method: 'GET',
          url: '{{ $runtimeConfig.BASE_URL }}/starships/{{ $runtimeConfig.STARSHIP_ID }}/tools',
          headers: {
            Authorization: 'Bearer {{ $runtimeConfig.AUTH_TOKEN }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'summarize',
        type: 'code',
        name: 'Summarize Tools',
        description: 'Strip heavy fields (e.g., blueprint) and return a lean list',
        parameters: {
          code: `
            async function main(ctx) {
              // Expect the HTTP node to return a response object with { status, headers, body, url }.
              // The body may be a bare array of tools or an object with a data array property.
              const raw = ctx.$input;
              const payload = raw && typeof raw === 'object' && (raw as any).body !== undefined ? (raw as any).body : raw;

              const data = payload && typeof payload === 'object' && Array.isArray((payload as any).data)
                ? (payload as any).data
                : (Array.isArray(payload) ? payload : []);

              // Return a lean summary to avoid leaking large/templated blueprint contents
              return data.map((t) => ({
                slug: t && t.slug,
                name: t && t.name,
                description: t && t.description,
                isEnabled: t && t.isEnabled,
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
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_list' },
      { ref: 'e3', from: 'http_list', to: 'summarize' },
      { ref: 'e3', from: 'summarize', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const toolListToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolListTool.name,
  description: toolListTool.description,
  parameters: toolListTool.parameters,
  blueprint: toolListTool.blueprint,

  slug: 'list-tools',
  version: '1.0.1',
  category: 'automation',
  exampleUsage: '{} // returns a lean array of tools; env (baseUrl, authToken, starshipId) is inferred',
  requiresApiKey: false,
  configurationFields: [],
};
