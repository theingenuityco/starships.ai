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
        ref: 'integration_list',
        type: 'integration',
        name: 'List Tools (Starships)',
        description: 'List tools via starships-ai connector',
        parameters: {
          connectorSlug: 'starships-ai',
          operation: 'tools.list',
          // No explicit payload needed for now; connector infers starship context.
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
              // Expect the connector to return either a bare array of tools
              // or an object with a data array property.
              const raw = ctx.$input;
              const data = raw && typeof raw === 'object' && Array.isArray((raw as any).data)
                ? (raw as any).data
                : (Array.isArray(raw) ? raw : []);

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
      { ref: 'e1', from: 'start_1', to: 'integration_list' },
      { ref: 'e2', from: 'integration_list', to: 'summarize' },
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
