import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Tool
 * Edit the currently focused tool with partial updates. Designed for incremental tool development.
 */
export const toolEditTool: ToolParams = {
  name: 'Edit Tool',
  slug: 'tool-edit',
  description: `Updates an existing tool by slug with partial changes. Designed for incremental tool development and refinement.

## Purpose
Apply partial updates to any tool by providing its slug. Supports updating individual fields without needing to provide complete tool data.

## Required Parameters
- **slug**: Tool slug to update (kebab-case identifier)

## Optional Parameters
- **name**: Update tool name
- **description**: Update tool description
- **parameters**: Update JSON schema for tool parameters
- **blueprint**: Update Autopilot blueprint

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **BASE_URL**: API server endpoint
- **AUTH_TOKEN**: Authentication token
- **STARSHIP_ID**: Current starship identifier

## Response & Behavior
- **Output**: Updated tool model
- **Workflow**: 1) Resolve tool by slug, 2) Apply partial updates, 3) Return updated tool
- **Timeouts**: Preparation (3s), Fetch (5s), Update (10s)
- **Common failures**: Missing slug, tool not found (404 error), validation errors`,
  parameters: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'Tool slug to update (kebab-case)',
      },
      name: {
        type: 'string',
        description: 'New tool name',
      },
      description: {
        type: 'string',
        description: 'New tool description',
      },
      parameters: {
        type: 'object',
        description: 'New JSON Schema for tool parameters',
      },
      blueprint: {
        type: 'object',
        description: 'New Autopilot blueprint { nodes, edges }',
      },
    },
    required: ['slug'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Update Request',
        description: 'Build URL, headers and partial body for tool update',
        parameters: {
          code: `
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            const starshipId = env('STARSHIP_ID');
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            if (!input.slug) {
              throw new Error('slug is required');
            }

            // Build partial update body with only provided and non-empty fields
            const body = {};
            if (typeof input.name === 'string' && input.name.trim().length > 0) body.name = input.name.trim();
            if (typeof input.description === 'string' && input.description.trim().length > 0) body.description = input.description.trim();
            if (input.parameters && typeof input.parameters === 'object' && Object.keys(input.parameters).length > 0) body.parameters = input.parameters;
            if (input.blueprint && typeof input.blueprint === 'object') {
              const hasNodes = Array.isArray(input.blueprint.nodes) && input.blueprint.nodes.length > 0;
              const hasEdges = Array.isArray(input.blueprint.edges) && input.blueprint.edges.length > 0;
              if (hasNodes || hasEdges) body.blueprint = input.blueprint;
            }

            if (Object.keys(body).length === 0) {
              throw new Error('At least one field must be provided for update');
            }

            return {
              baseUrl,
              starshipId,
              slug: input.slug,
              body,
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
        ref: 'fetch_tool',
        type: 'http_request',
        name: 'Fetch Tool by Slug',
        description: 'GET /starships/:starshipId/tools/:slug to resolve tool ID',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.baseUrl + "/starships/" + $lastOutputOf("prepare")[0].json.starshipId + "/tools/" + $lastOutputOf("prepare")[0].json.slug }}',
          method: 'GET',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 5000,
        },
      },
      {
        ref: 'prepare_update',
        type: 'code',
        name: 'Prepare Update Request',
        description: 'Extract tool ID and prepare PUT request',
        parameters: {
          code: `
            const fetchResponse = $lastOutputOf('fetch_tool')[0]?.json ?? {};
            const toolData = fetchResponse.body?.data || fetchResponse.body;

            if (!toolData || !toolData.id) {
              throw new Error('Failed to resolve tool by slug');
            }

            const ctx = $lastOutputOf('prepare')[0].json;

            return {
              url: \`\${ctx.baseUrl}/tools/\${toolData.id}\`,
              method: 'PUT',
              headers: ctx.headers,
              body: ctx.body
            };
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_update',
        type: 'http_request',
        name: 'Update Tool',
        description: 'PUT /tools/:id with partial updates',
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
        description: 'Return updated tool',
        parameters: {
          output: '{{ $lastOutputOf("http_update")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'fetch_tool' },
      { ref: 'e3', from: 'fetch_tool', to: 'prepare_update' },
      { ref: 'e4', from: 'prepare_update', to: 'http_update' },
      { ref: 'e5', from: 'http_update', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: tool-edit
 */
export const toolEditToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolEditTool.name,
  description: toolEditTool.description,
  parameters: toolEditTool.parameters,
  blueprint: toolEditTool.blueprint,

  slug: 'tool-edit',
  category: 'automation',
  exampleUsage: '{ "slug": "weather-lookup", "description": "Updated description" } // partial updates by slug',
  requiresApiKey: false,
  configurationFields: [],
};
