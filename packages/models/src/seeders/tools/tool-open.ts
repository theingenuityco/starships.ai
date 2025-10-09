import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Open Tool (Create or Open)
 * Creates a new draft tool when provided name + slug, or opens an existing tool by slug
 */
export const toolOpenTool: ToolParams = {
  name: 'Open Tool',
  slug: 'tool-open',
  description: `Creates or opens a tool on the current starship.

## Modes
- Create new draft: provide "name" and "slug" (optional "description")
- Open existing: provide only "slug"

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- BASE_URL: API server endpoint
- AUTH_TOKEN: Authentication token
- STARSHIP_ID: Current starship identifier

## Response & Behavior
- Output: Tool model (created or fetched)
- Timeouts: Preparation (3s), HTTP (Create: 10s, Open: 5s)
- Common failures: Missing environment, slug collision (409) when creating, not found (404) when opening`,
  parameters: {
    type: 'object',
    properties: {
      // Open existing
      slug: {
        type: 'string',
        description: 'Unique kebab-case identifier of the tool to open, or to create if name is provided',
      },
      // Create new
      name: {
        type: 'string',
        description: 'Human-readable name (required when creating a new tool)',
      },
      description: {
        type: 'string',
        description: 'Optional description (used only when creating a new tool)',
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
        description: 'Build URL, headers and body based on mode (create or open)',
        parameters: {
          code: `
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            const starshipId = env('STARSHIP_ID');
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            const hasName = input && typeof input.name === 'string' && input.name.trim().length > 0;
            const slug = input && input.slug;
            if (!slug || typeof slug !== 'string') throw new Error('slug is required');

            if (hasName) {
              // Create draft
              const body = {
                name: input.name,
                slug,
                description: (input && input.description) || '',
                status: 'draft'
              };
              return {
                url: \`\${baseUrl}/starships/\${starshipId}/tools\`,
                method: 'POST',
                headers: {
                  'Authorization': \`Bearer \${authToken}\`,
                  'Content-Type': 'application/json'
                },
                body,
                timeout: 10000
              };
            }

            // Open existing
            return {
              url: \`\${baseUrl}/starships/\${starshipId}/tools/\${slug}\`,
              method: 'GET',
              headers: {
                'Authorization': \`Bearer \${authToken}\`,
                'Content-Type': 'application/json'
              },
              timeout: 5000
            };
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_exec',
        type: 'http_request',
        name: 'Execute',
        description: 'Create or fetch tool',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          body: '{{ $lastOutputOf("prepare")[0].json.body }}',
          timeout: '{{ $lastOutputOf("prepare")[0].json.timeout }}',
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return tool model (created or fetched)',
        parameters: {
          output: '{{ $lastOutputOf("http_exec")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_exec' },
      { ref: 'e3', from: 'http_exec', to: 'end_1' },
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
  exampleUsage:
    '{ "slug": "weather-lookup" } // open existing\n{ "name": "My Tool", "slug": "my-tool", "description": "Does something useful" } // create draft; env inferred',
  requiresApiKey: false,
  configurationFields: [],
};
