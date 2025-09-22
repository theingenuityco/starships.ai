import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: tool_create
 * Create a new Tool instance on a starship via server REST API
 */
export const toolCreateTool: ToolParams = {
  name: 'tool_create',
  description: 'Create a new Tool instance on the specified starship.',
  parameters: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Server base URL (e.g., http://localhost:3000/api)' },
      authToken: { type: 'string', description: 'Bearer token for authenticated requests' },

      name: { type: 'string', description: 'Tool name' },
      slug: { type: 'string', description: 'Kebab-case slug for the tool instance' },
      description: { type: 'string', description: 'Short description of the tool' },
      parameters: {
        type: 'object',
        description: 'JSON Schema defining the tool input',
        properties: {},
      },
      blueprint: {
        type: 'object',
        description: 'Autopilot blueprint { nodes, edges }',
        properties: {},
      },
      configuration: {
        type: 'object',
        description: 'Optional instance configuration (e.g., endpoints, flags)',
        properties: {},
      },
      isEnabled: { type: 'boolean', description: 'Enable tool after creation (default: true)' },
    },
    required: ['baseUrl', 'authToken', 'name', 'slug', 'description', 'parameters', 'blueprint'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL, headers and body',
        parameters: {
          code: `
            const baseUrl = (input.baseUrl || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = input.authToken;
            const starshipId = (state && (state as any).starshipId);
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            const required = ['name', 'slug', 'description', 'parameters', 'blueprint'];
            for (const k of required) {
              if (input[k] === undefined || input[k] === null) {
                throw new Error(\`\${k} is required\`);
              }
            }

            const body = {
              name: input.name,
              slug: input.slug,
              description: input.description,
              parameters: input.parameters,
              blueprint: input.blueprint,
              configuration: input.configuration ?? {},
              isEnabled: input.isEnabled ?? true,
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
        name: 'Create Tool',
        description: 'POST /starships/:starshipId/tools',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          body: '{{ $lastOutputOf("prepare")[0].json.body }}',
          timeout: 10000,
        },
      },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ $input() }}' } },
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
 * Tool Template: tool_create
 */
export const toolCreateToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolCreateTool.name,
  description: toolCreateTool.description,
  parameters: toolCreateTool.parameters,
  blueprint: toolCreateTool.blueprint,

  slug: 'tool-create',
  category: 'automation',
  exampleUsage:
    'Create a tool: { "baseUrl": "...", "authToken": "...", "name": "...", "slug": "...", "description": "...", "parameters": {...}, "blueprint": {...} } (starshipId is inferred from state)',
  requiresApiKey: false,
  configurationFields: [],
};
