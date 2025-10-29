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
- Create new draft: provide "name" and "slug" (optional: description, model, systemPrompt, temperature, maxTokens, previewPrompts)
- Open existing: provide only "slug"

## Model Selection
IMPORTANT: Use "List Models" tool first to discover available models before creating agents.
- Model format: provider/model-name
- Default if not specified: First available paid Anthropic model, then OpenAI, then others
- Selection priority based on objective data from List Models:
  1. Match capabilities: Search description for use-case keywords
  2. Prefer PAID models (pricing.prompt > "0" AND pricing.completion > "0")
  3. Provider preference: Anthropic > OpenAI > Others (check model ID prefix)
  4. Within provider: Best price/performance ratio
- Free models ONLY for fallback/emergency scenarios
- Selection criteria by use case:
  * Coding: description contains "code"/"programming" + prefer Anthropic/OpenAI
  * Creative: context_length > 100k + paid models + prefer Anthropic/OpenAI
  * Reasoning: "reasoning" in supported_parameters + prefer Anthropic
  * General: Prefer Anthropic first, OpenAI second
- Fallback: Free models acceptable ONLY if no paid options available

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
        description: 'LLM model ID from List Models (prefer paid Anthropic models, then OpenAI, then others)',
      },
      systemPrompt: {
        type: 'string',
        description:
          'System instructions for the agent. Must begin with <character name="AGENT_NAME">ROLE</character> as the first line (name + role only).',
      },
      temperature: {
        type: 'number',
        description: 'Temperature 0-2 (default: 0.7)',
      },
      maxTokens: {
        type: 'number',
        description: 'Max response tokens (default: 2048)',
      },
      previewPrompts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional example prompts to show in chat (max 10)',
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
                model: (input && input.model) || 'openai/gpt-4o-mini',
                systemPrompt: (input && input.systemPrompt) || '',
              };
              
              // Add optional numeric fields if provided
              if (typeof input.temperature === 'number') {
                body.temperature = input.temperature;
              }
              if (typeof input.maxTokens === 'number') {
                body.maxTokens = input.maxTokens;
              }
              if (Array.isArray(input.previewPrompts)) {
                const prompts = input.previewPrompts.filter(p => typeof p === 'string' && p.trim()).slice(0, 10);
                if (prompts.length > 0) body.previewPrompts = prompts;
              }
              
              return {
                url: \`\${baseUrl}/agents\`,
                method: 'POST',
                headers: {
                  'Authorization': \`Bearer \${authToken}\`,
                  'Content-Type': 'application/json'
                },
                body: {
                  ...body,
                  starshipId
                },
                timeout: 10000
              };
            }

            // Open existing
            return {
              url: \`\${baseUrl}/agents/\${slug}\`,
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
    '{ "slug": "support-agent" } // open existing\n{ "name": "Support Agent", "slug": "support-agent", "description": "Helps users", "model": "provider/model-id", "systemPrompt": "You are a helpful support agent", "previewPrompts": ["How do I reset my password?", "Where can I find my invoice?"] } // create draft (use List Models to find best match)\n{ "name": "Code Assistant", "slug": "code-assistant", "model": "provider/code-optimized-model", "temperature": 0.3, "maxTokens": 4000, "systemPrompt": "You are an expert coding assistant" } // coding agent (select from List Models based on description keywords)',
  requiresApiKey: false,
  configurationFields: [],
};
