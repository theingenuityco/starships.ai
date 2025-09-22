import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: tool_update
 * Update an existing Tool instance on a starship via server REST API
 * Accepts either direct "id" or "slug" (uses state.starshipId) to resolve the tool ID first.
 */
export const toolUpdateTool: ToolParams = {
  name: 'tool_update',
  description: 'Update an existing Tool instance. Provide id directly or resolve by slug (uses state.starshipId).',
  parameters: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Server base URL (e.g., http://localhost:3000/api)' },
      authToken: { type: 'string', description: 'Bearer token for authenticated requests' },

      // Identifier options
      id: { type: 'string', description: 'Tool ID to update (preferred when known)' },
      slug: { type: 'string', description: 'Tool slug (required if resolving by slug)' },

      // Patchable fields (all optional)
      name: { type: 'string', description: 'New tool name' },
      description: { type: 'string', description: 'New tool description' },
      parameters: { type: 'object', description: 'New JSON Schema for tool parameters', properties: {} },
      blueprint: { type: 'object', description: 'New Autopilot blueprint { nodes, edges }', properties: {} },
      configuration: { type: 'object', description: 'New instance configuration', properties: {} },
      isEnabled: { type: 'boolean', description: 'Enable/disable the tool' },
    },
    required: ['baseUrl', 'authToken'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },

      // Validate inputs and decide resolution strategy
      {
        ref: 'validate',
        type: 'code',
        name: 'Validate Inputs',
        description: 'Ensure we have either id or slug',
        parameters: {
          code: `
            const baseUrl = (input.baseUrl || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            if (!input.authToken) throw new Error('authToken is required');

            // Determine if we have id or need to resolve via slug (starship is inferred from state)
            const hasId = typeof input.id === 'string' && input.id.length > 0;
            const slug = input.slug;
            const starshipId = (state && (state as any).starshipId);
            const hasSlugResolve = !!slug;

            if (!hasId && !hasSlugResolve) {
              throw new Error('Provide "id" OR "slug" to resolve the tool (starship inferred from state).');
            }

            // Build partial patch body from provided fields (ignore undefined)
            const patch: any = {};
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
              hasId,
              hasSlugResolve,
              starshipId,
              slug,
              id: input.id,
              patch,
              headers: {
                'Authorization': \`Bearer \${input.authToken}\`,
                'Content-Type': 'application/json'
              }
            };
          `,
          timeout: 3000,
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
            let toolId = ctx.id;

            if (!ctx.hasId && ctx.hasSlugResolve) {
              const fetched = $lastOutputOf('maybe_fetch_by_slug')[0].json;
              if (!fetched || !fetched.id) {
                throw new Error('Failed to resolve tool by slug for given starshipId');
              }
              toolId = fetched.id;
            }

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

      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ $input() }}' } },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate' },
      { ref: 'e2', from: 'validate', to: 'maybe_fetch_by_slug' },
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
  exampleUsage:
    'Update by id: { "baseUrl": "...", "authToken": "...", "id": "...", "name": "New Name" } or resolve by slug: { "baseUrl": "...", "authToken": "...", "slug": "...", "isEnabled": false }',
  requiresApiKey: false,
  configurationFields: [],
};
