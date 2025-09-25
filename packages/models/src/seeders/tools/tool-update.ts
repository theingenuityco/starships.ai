import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: tool_update
 * Update an existing Tool instance on a starship via server REST API
 * Accepts "slug" (uses state.starshipId) to resolve the tool ID first.
 */
export const toolUpdateTool: ToolParams = {
  name: 'tool_update',
  description: `Update an existing Tool instance on the current starship.

Identify target:
- Provide slug (resolved using STARSHIP_ID)

Patchable fields (at least one required):
- name, description, parameters, blueprint, configuration, isEnabled

Implicit environment (do not pass):
- BASE_URL, AUTH_TOKEN, STARSHIP_ID from agent.state

Protocol:
- If slug provided, GET /starships/:starshipId/tools/:slug to resolve id
- PUT /tools/:id with a partial body containing only provided fields

Output:
- API response from PUT /tools/:id (updated tool model)

Behavior and limits:
- Idempotent for identical patches
- Timeouts: resolve 6s, update 10s
- Typical failures: target not found, validation errors, conflicts`,
  parameters: {
    type: 'object',
    properties: {
      // Identifier
      slug: { type: 'string', description: 'Tool slug on current starship' },

      // Patchable fields (all optional)
      name: { type: 'string', description: 'New tool name' },
      description: { type: 'string', description: 'New tool description' },
      parameters: { type: 'object', description: 'New JSON Schema for tool parameters', properties: {} },
      blueprint: { type: 'object', description: 'New Autopilot blueprint { nodes, edges }', properties: {} },
      configuration: { type: 'object', description: 'New instance configuration', properties: {} },
      isEnabled: { type: 'boolean', description: 'Enable/disable the tool' },
    },
    required: [],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },

      // Validate inputs and decide resolution strategy
      {
        ref: 'validate',
        type: 'code',
        name: 'Validate Inputs',
        description: 'Ensure slug and required env are present',
        parameters: {
          code: `
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            if (!authToken) throw new Error('authToken is required');

            // Resolve via slug only (starship is inferred from state)
            const slug = input.slug;
            const starshipId = env('STARSHIP_ID') || (state && typeof state === 'object' ? state.starshipId : undefined);

            if (!slug) {
              throw new Error('slug is required');
            }
            if (!starshipId) {
              throw new Error('starshipId is required');
            }

            // Build partial patch body from provided fields (ignore undefined)
            const patch = {};
            const keys = ['name', 'description', 'parameters', 'blueprint', 'configuration', 'isEnabled'];
            for (const k of keys) {
              if (Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined) {
                patch[k] = input[k];
              }
            }

            if (Object.keys(patch).length === 0) {
              throw new Error('No update fields provided. Include at least one of name, description, parameters, blueprint, configuration, isEnabled.');
            }

            return {
              baseUrl,
              hasSlugResolve: true,
              starshipId,
              slug,
              patch,
              headers: {
                'Authorization': \`Bearer \${authToken}\`,
                'Content-Type': 'application/json'
              }
            };
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'resolve_decision',
        type: 'conditional',
        name: 'Resolve by Slug?',
        description: 'Branch depending on whether slug resolution is needed',
        parameters: {
          condition: '{{ $lastOutputOf("validate")[0].json.hasSlugResolve ? "true" : "false" }}',
        },
      },

      // Optionally resolve ID by slug
      {
        ref: 'maybe_fetch_by_slug',
        type: 'http_request',
        name: 'Maybe Fetch by Slug',
        description: 'GET /starships/:starshipId/tools/:slug when id is not provided',
        parameters: {
          url: '{{ $lastOutputOf("validate")[0].json.hasSlugResolve ? ($lastOutputOf("validate")[0].json.baseUrl + "/starships/" + $lastOutputOf("validate")[0].json.starshipId + "/tools/" + $lastOutputOf("validate")[0].json.slug) : "" }}',
          method: '{{ $lastOutputOf("validate")[0].json.hasSlugResolve ? "GET" : "GET" }}',
          headers: '{{ $lastOutputOf("validate")[0].json.headers }}',
          timeout: 6000,
        },
      },

      // Prepare final ID and request
      {
        ref: 'prepare_update',
        type: 'code',
        name: 'Prepare Update Request',
        description: 'Pick ID and build PUT request target',
        parameters: {
          code: `
            const ctx = $lastOutputOf('validate')[0].json;

            const http = $lastOutputOf('maybe_fetch_by_slug')[0]?.json;

            // Normalize HTTP response: unwrap .body and prefer .data when present
            let fetched;
            if (http && typeof http === 'object') {
              const hasBody = 'body' in http;
              const body = hasBody ? http['body'] : http;
              fetched = body && typeof body === 'object' && 'data' in body ? body['data'] : body;
            } else {
              fetched = http;
            }

            if (!fetched || !fetched.id) {
              throw new Error('Failed to resolve tool by slug for given starshipId');
            }
            const toolId = fetched.id;

            return {
              url: \`\${ctx.baseUrl}/tools/\${toolId}\`,
              method: 'PUT',
              headers: ctx.headers,
              body: ctx.patch
            };
          `,
          timeout: 3000,
        },
      },

      // Perform update
      {
        ref: 'http_update',
        type: 'http_request',
        name: 'Update Tool',
        description: 'PUT /tools/:id',
        parameters: {
          url: '{{ $lastOutputOf("prepare_update")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare_update")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare_update")[0].json.headers }}',
          body: '{{ $lastOutputOf("prepare_update")[0].json.body }}',
          timeout: 10000,
        },
      },

      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ $lastOutputOf("http_update")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate' },
      { ref: 'e_cond', from: 'validate', to: 'resolve_decision' },
      { ref: 'e2_true', from: 'resolve_decision', to: 'maybe_fetch_by_slug', condition: 'true' },
      { ref: 'e2_false', from: 'resolve_decision', to: 'prepare_update', condition: 'false' },
      { ref: 'e3', from: 'maybe_fetch_by_slug', to: 'prepare_update' },
      { ref: 'e4', from: 'prepare_update', to: 'http_update' },
      { ref: 'e5', from: 'http_update', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: tool_update
 */
export const toolUpdateToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolUpdateTool.name,
  description: toolUpdateTool.description,
  parameters: toolUpdateTool.parameters,
  blueprint: toolUpdateTool.blueprint,

  slug: 'tool-update',
  category: 'automation',
  exampleUsage: 'By slug: { "slug": "...", "name": "New Name" } // env inferred (baseUrl, authToken, starshipId)',
  requiresApiKey: false,
  configurationFields: [],
};
