import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: tool_list
 * List all tools for the specified starship using server REST API
 */
export const toolListTool: ToolParams = {
  name: 'tool_list',
  description: 'List all tools for the specified starship.',
  parameters: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Server base URL (e.g., http://localhost:3000/api)' },
      authToken: { type: 'string', description: 'Bearer token for authenticated requests' },
    },
    required: ['baseUrl', 'authToken'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL and headers',
        parameters: {
          code: `
            const baseUrl = (input.baseUrl || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const starshipId = (state && (state as any).starshipId);
            if (!input.authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            return {
              url: \`\${baseUrl}/starships/\${starshipId}/tools\`,
              method: 'GET',
              headers: {
                'Authorization': \`Bearer \${input.authToken}\`,
                'Content-Type': 'application/json'
              }
            };
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_list',
        type: 'http_request',
        name: 'List Tools',
        description: 'GET /starships/:starshipId/tools',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 5000,
        },
      },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ $input() }}' } },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_list' },
      { ref: 'e3', from: 'http_list', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const toolListToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolListTool.name,
  description: toolListTool.description,
  parameters: toolListTool.parameters,
  blueprint: toolListTool.blueprint,

  slug: 'tool-list',
  category: 'automation',
  exampleUsage: 'Call with { "baseUrl": "...", "authToken": "..." } to list tools. starshipId is inferred from state.',
  requiresApiKey: false,
  configurationFields: [],
};
