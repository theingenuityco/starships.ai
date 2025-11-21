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
- STARSHIP_ID: derived from the current starship context

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
        ref: 'http_list',
        type: 'http_request',
        name: 'List Tools (HTTP)',
        description: 'List tools via Starships HTTP API',
        parameters: {
          method: 'GET',
          // Relative path; HostRuntime will prefix SERVER_URL/api/v1, inject auth,
          // and resolve the current starship.
          url: '/starships/self/tools',
          connectorSlug: 'starships',
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
              const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
              const payload = hasBody ? raw.body : raw;

              const isObject = payload && typeof payload === 'object';
              const data = isObject && Array.isArray(payload.data)
                ? payload.data
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
      { ref: 'e1', from: 'start_1', to: 'http_list' },
      { ref: 'e2', from: 'http_list', to: 'summarize' },
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
