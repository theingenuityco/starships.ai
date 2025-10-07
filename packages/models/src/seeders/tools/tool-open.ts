import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Open Tool
 * Opens an existing tool by fetching its details and setting it as the focused tool for editing
 */
export const toolOpenTool: ToolParams = {
  name: 'Open Tool',
  slug: 'tool-open',
  description: `Opens an existing tool by slug and returns its complete details for editing or continuation.

## Purpose
Fetch complete tool information including parameters, blueprint, and current configuration. Used to continue working on existing tools or to examine tool details before editing.

## Required Parameters
- **slug**: Unique kebab-case identifier of the tool to open (e.g., "weather-lookup", "send-email")

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **BASE_URL**: API server endpoint
- **AUTH_TOKEN**: Authentication token
- **STARSHIP_ID**: Current starship identifier

## Response & Behavior
- **Output**: Complete tool model with id, name, slug, description, parameters, blueprint, and status
- **State**: Tool data returned for potential use in focusedTool state
- **Timeouts**: Preparation (3s), HTTP request (5s)
- **Common failures**: Missing environment, tool not found (404 error), insufficient permissions`,
  parameters: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'Unique kebab-case identifier of the tool to open',
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
        name: 'Prepare Request',
        description: 'Build URL, headers for tool fetch request',
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

            return {
              url: \`\${baseUrl}/starships/\${starshipId}/tools/\${input.slug}\`,
              method: 'GET',
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
        ref: 'http_get',
        type: 'http_request',
        name: 'Fetch Tool',
        description: 'GET /starships/:starshipId/tools/:slug',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 5000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return complete tool details',
        parameters: {
          output: '{{ $lastOutputOf("http_get")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_get' },
      { ref: 'e3', from: 'http_get', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: tool-open
 */
export const toolOpenToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolOpenTool.name,
  description: toolOpenTool.description,
  parameters: toolOpenTool.parameters,
  blueprint: toolOpenTool.blueprint,

  slug: 'tool-open',
  category: 'automation',
  exampleUsage: '{ "slug": "weather-lookup" } // env inferred (baseUrl, authToken, starshipId)',
  requiresApiKey: false,
  configurationFields: [],
};
