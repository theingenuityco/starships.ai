import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Open Agent (Create or Open)
 * Creates a new draft agent when provided name + slug, or opens an existing agent by slug
 */
export const agentOpenTool: ToolParams = {
  name: 'Open Agent',
  slug: 'agent-open',
  description: `Creates or opens an agent on the current starship.

## Modes
- Create new draft: provide "name" and "slug" (optional: description, model, systemPrompt, temperature, maxTokens)
- Open existing: provide only "slug"

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- BASE_URL: API server endpoint
- AUTH_TOKEN: Authentication token
- STARSHIP_ID: Current starship identifier

## Response & Behavior
- Output: Agent model (created or fetched)
- Timeouts: Preparation (3s), HTTP (Create: 10s, Open: 5s)
- Common failures: Missing environment, slug collision (409) when creating, not found (404) when opening`,
  parameters: {
    type: 'object',
    properties: {
      // Open existing
      slug: {
        type: 'string',
        description: 'Unique kebab-case identifier of the agent to open, or to create if name is provided',
      },
      // Create new
      name: {
        type: 'string',
        description: 'Human-readable name (required when creating a new agent)',
      },
      description: {
        type: 'string',
        description: 'Optional description (used only when creating a new agent)',
      },
      model: {
        type: 'string',
        description: 'LLM model (default: anthropic/claude-sonnet-4.5)',
      },
      systemPrompt: {
        type: 'string',
        description: 'System instructions for the agent',
      },
      temperature: {
        type: 'number',
        description: 'Temperature 0-2 (default: 0.7)',
      },
      maxTokens: {
        type: 'number',
        description: 'Max response tokens (default: 2048)',
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
                model: (input && input.model) || 'anthropic/claude-sonnet-4.5',
                systemPrompt: (input && input.systemPrompt) || '',
                status: 'draft'
              };
              
              // Add optional numeric fields if provided
              if (typeof input.temperature === 'number') {
                body.temperature = input.temperature;
              }
              if (typeof input.maxTokens === 'number') {
                body.maxTokens = input.maxTokens;
              }
              
              return {
                url: \`\${baseUrl}/starships/\${starshipId}/agents\`,
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
              url: \`\${baseUrl}/starships/\${starshipId}/agents/\${slug}\`,
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
        description: 'Create or fetch agent',
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
        description: 'Return agent model (created or fetched)',
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
 * Tool Template: agent-open
 */
export const agentOpenToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentOpenTool.name,
  description: agentOpenTool.description,
  parameters: agentOpenTool.parameters,
  blueprint: agentOpenTool.blueprint,

  slug: 'agent-open',
  category: 'automation',
  exampleUsage:
    '{ "slug": "support-agent" } // open existing\n{ "name": "Support Agent", "slug": "support-agent", "description": "Helps users", "systemPrompt": "You are a helpful support agent" } // create draft',
  requiresApiKey: false,
  configurationFields: [],
};
