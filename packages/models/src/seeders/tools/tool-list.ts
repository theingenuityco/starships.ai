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
    properties: {},
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
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            const starshipId = env('STARSHIP_ID');
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            return {
              url: \`\${baseUrl}/starships/\${starshipId}/tools\`,
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
      {
        ref: 'summarize',
        type: 'code',
        name: 'Summarize Tools',
        description: 'Strip heavy fields (e.g., blueprint) and return a lean list',
        parameters: {
          code: `
            // Input is the HttpResponse from http_list (see HttpRequest node contract)
            const http = input;
            const body = http && typeof http === 'object' ? http.body : http;
            // Server sendSuccess returns { data: T }, so prefer body.data when present
            const data = (body && typeof body === 'object' && Array.isArray(body.data))
              ? body.data
              : (Array.isArray(body) ? body : []);

            // Return a lean summary to avoid leaking large/templated blueprint contents
            return data.map((t) => ({
              id: t && t.id,
              slug: t && t.slug,
              name: t && t.name,
              description: t && t.description,
              isEnabled: t && t.isEnabled,
            }));
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
      { ref: 'e4', from: 'summarize', to: 'end_1' },
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
  exampleUsage: 'Call with {} to list tools. starshipId/baseUrl/authToken are inferred from state.',
  requiresApiKey: false,
  configurationFields: [],
};
