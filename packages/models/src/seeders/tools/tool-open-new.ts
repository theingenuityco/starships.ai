import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Open New Tool
 * Create a new draft Tool with minimal details (name, slug, description)
 */
export const toolOpenNewTool: ToolParams = {
  name: 'Open New Tool',
  description: `Opens a new draft tool with basic details (name, slug, and optional description). Creates a minimal tool structure that can be further developed later.

## Purpose
Quickly scaffold a new tool with just the essential identifying information. The tool is created in draft state (disabled) and can be completed with parameters and blueprint later using tool_update.

## Required Parameters
- **name**: Human-readable tool name (e.g., "Weather Lookup", "Send Email")
- **slug**: Unique kebab-case identifier (e.g., "weather-lookup", "send-email")

## Optional Parameters  
- **description**: Brief description of tool functionality

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **BASE_URL**: API server endpoint
- **AUTH_TOKEN**: Authentication token  
- **STARSHIP_ID**: Current starship identifier

## Response & Behavior
- **Output**: Created tool with id, name, slug, and description
- **State**: Tool created with isEnabled=false (draft status)
- **Timeouts**: Preparation (3s), HTTP request (10s)
- **Common failures**: Missing environment, slug collision (409 error)`,
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Human-readable tool name (e.g., "Weather Lookup", "Send Email", "Calculate Math")',
      },
      slug: {
        type: 'string',
        description:
          'Unique kebab-case identifier for the tool (e.g., "weather-lookup", "send-email", "calculate-math"). Must match pattern: ^[a-z0-9]+(?:-[a-z0-9]+)*$',
      },
      description: {
        type: 'string',
        description: 'Optional brief description of tool functionality and purpose',
      },
    },
    required: ['name', 'slug'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL, headers and body for draft tool creation',
        parameters: {
          code: `
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            const starshipId = env('STARSHIP_ID');
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            if (!input.name || !input.slug) {
              throw new Error('name and slug are required');
            }

            // Create minimal tool structure with empty parameters and blueprint
            const body = {
              name: input.name,
              slug: input.slug,
              description: input.description || '',
              parameters: {
                type: 'object',
                properties: {},
                required: []
              },
              blueprint: {
                nodes: [
                  { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
                  { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} }
                ],
                edges: [
                  { ref: 'e1', from: 'start_1', to: 'end_1' }
                ],
                metadata: { draft: true }
              },
              configuration: {},
              isEnabled: false,
              status: 'draft'
            };

            return {
              url: \`\${baseUrl}/starships/\${starshipId}/tools\`,
              method: 'POST',
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
        ref: 'http_create',
        type: 'http_request',
        name: 'Create Draft Tool',
        description: 'POST /starships/:starshipId/tools',
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
        description: 'Return created draft tool',
        parameters: {
          output: '{{ $lastOutputOf("http_create")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_create' },
      { ref: 'e3', from: 'http_create', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: tool-open-new
 */
export const toolOpenNewToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolOpenNewTool.name,
  description: toolOpenNewTool.description,
  parameters: toolOpenNewTool.parameters,
  blueprint: toolOpenNewTool.blueprint,

  slug: 'tool-open-new',
  category: 'automation',
  exampleUsage:
    '{ "name": "My Tool", "slug": "my-tool", "description": "Does something useful" } // env inferred (baseUrl, authToken, starshipId)',
  requiresApiKey: false,
  configurationFields: [],
};
