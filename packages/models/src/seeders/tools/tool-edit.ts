import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Tool
 * Edit the currently focused tool with partial updates. Designed for incremental tool development.
 */
export const toolEditTool: ToolParams = {
  name: 'Edit Tool',
  slug: 'tool-edit',
  description: `Updates the currently focused tool with partial changes. Designed for incremental tool development and refinement.

## Purpose
Apply partial updates to the tool currently being worked on (focusedTool). Supports updating individual fields without needing to provide complete tool data.

## Parameters (All Optional)
- **name**: Update tool name
- **slug**: Update tool slug (requires admin approval for production)
- **description**: Update tool description
- **parameters**: Update JSON schema for tool parameters
- **blueprint**: Update Autopilot blueprint
- **isEnabled**: Enable/disable the tool
- **configuration**: Update instance configuration

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **BASE_URL**: API server endpoint
- **AUTH_TOKEN**: Authentication token
- **STARSHIP_ID**: Current starship identifier

## Response & Behavior
- **Output**: Updated tool model
- **State**: Tool remains as focusedTool for continued development
- **Timeouts**: Preparation (3s), HTTP request (10s)
- **Common failures**: Missing environment, tool not found (404 error), validation errors`,
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'New tool name',
      },
      slug: {
        type: 'string',
        description: 'New tool slug (kebab-case)',
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
      isEnabled: {
        type: 'boolean',
        description: 'Enable/disable the tool',
      },
      configuration: {
        type: 'object',
        description: 'New instance configuration',
      },
    },
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

            // Build partial update body with only provided fields
            const body: Record<string, unknown> = {};
            if (input.name !== undefined) body.name = input.name;
            if (input.slug !== undefined) body.slug = input.slug;
            if (input.description !== undefined) body.description = input.description;
            if (input.parameters !== undefined) body.parameters = input.parameters;
            if (input.blueprint !== undefined) body.blueprint = input.blueprint;
            if (input.isEnabled !== undefined) body.isEnabled = input.isEnabled;
            if (input.configuration !== undefined) body.configuration = input.configuration;

            if (Object.keys(body).length === 0) {
              throw new Error('At least one field must be provided for update');
            }

            return {
              url: \`\${baseUrl}/tools/\${body.slug || 'unknown'}\`, // Will be resolved from focusedTool
              method: 'PUT',
              headers: {
                'Authorization': \`Bearer \${authToken}\`,
                'Content-Type': 'application/json'
              },
              body
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
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          body: '{{ $lastOutputOf("prepare")[0].json.body }}',
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
      { ref: 'e2', from: 'prepare', to: 'http_update' },
      { ref: 'e3', from: 'http_update', to: 'end_1' },
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
  exampleUsage: '{ "description": "Updated description", "isEnabled": true } // partial updates to focused tool',
  requiresApiKey: false,
  configurationFields: [],
};
