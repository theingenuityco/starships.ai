import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Open Agent (Create or Open)
 * Creates a new draft agent when provided name (server generates unique slug), or opens an existing agent by slug
 */
export const agentOpenTool: ToolParams = {
  name: 'Open Agent',
  slug: 'open-agent',
  description:
    'Create a new draft agent (provide name + role; optional description/model/settings) or open an existing agent by slug on the current starship. Returns the agent model.',
  parameters: {
    type: 'object',
    properties: {
      // Open existing
      slug: {
        type: 'string',
        description: 'For opening existing agents only. Do not include when creating; server generates a unique slug.',
      },
      // Create new
      name: {
        type: 'string',
        description: 'Human-readable name (required when creating a new agent)',
      },
      role: {
        type: 'string',
        description: 'Human-readable role label for the agent (required when creating a new agent)',
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
    // Note: Provider does not support oneOf/allOf/anyOf at top-level.
    // Creation: include name (omit slug). Opening: include slug.
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
            async function main(ctx) {
              const input = ctx.input || {};
              const hasName = typeof input.name === 'string' && input.name.trim().length > 0;
              const slug = input.slug;
              const starshipId = ctx.env && ctx.env('STARSHIP_ID');

              if (hasName) {
                if (!starshipId) {
                  throw new Error('STARSHIP_ID missing');
                }
                const role = typeof input.role === 'string' ? input.role.trim() : '';
                if (!role) {
                  throw new Error('role is required when creating an agent');
                }
                // Create draft
                const args = {
                  starshipId: String(starshipId),
                  name: input.name,
                  role: role,
                  description: (input && input.description) || '',
                  model: (input && input.model) || 'openai/gpt-4o-mini',
                  systemPrompt: (input && input.systemPrompt) || '',
                };
                
                // Add optional numeric fields if provided
                if (typeof input.temperature === 'number') {
                  args.temperature = input.temperature;
                }
                if (typeof input.maxTokens === 'number') {
                  args.maxTokens = input.maxTokens;
                }
                if (Array.isArray(input.previewPrompts)) {
                  const prompts = input.previewPrompts.filter((p) => typeof p === 'string' && p.trim()).slice(0, 10);
                  if (prompts.length > 0) args.previewPrompts = prompts;
                }
                
                return {
                  mode: 'create',
                  args,
                  timeout: 10000
                };
              }

              // Open existing
              if (!slug || typeof slug !== 'string') throw new Error('slug is required to open an agent');
              return {
                mode: 'open',
                slug: String(slug),
                timeout: 5000
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'route_mode',
        type: 'conditional',
        name: 'Route Mode',
        description: 'Route to create vs open based on prepare.mode',
        parameters: {
          condition: '{{ (lastOutputOf("prepare") || {}).mode === "create" }}',
        },
      },
      {
        ref: 'create_agent',
        type: 'connector_action',
        name: 'Create Agent (Starships)',
        description: 'POST /agents via Starships connector endpoint catalog',
        parameters: {
          connector: 'starships',
          action: 'create-agent',
          args: '{{ (lastOutputOf("prepare") || {}).args }}',
          timeout: '{{ (lastOutputOf("prepare") || {}).timeout }}',
        },
      },
      {
        ref: 'get_agent',
        type: 'connector_action',
        name: 'Get Agent (Starships)',
        description: 'GET /starships/:starshipId/agents/:slug via Starships connector endpoint catalog',
        parameters: {
          connector: 'starships',
          action: 'get-agent',
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
            slug: '{{ (lastOutputOf("prepare") || {}).slug }}',
          },
          timeout: '{{ (lastOutputOf("prepare") || {}).timeout }}',
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return agent model (created or fetched)',
        parameters: {
          output: '{{ lastOutputOf("create_agent") || lastOutputOf("get_agent") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'route_mode' },
      { ref: 'e3', from: 'route_mode', to: 'create_agent', condition: 'true' },
      { ref: 'e4', from: 'create_agent', to: 'end_1' },
      { ref: 'e5', from: 'route_mode', to: 'get_agent', condition: 'false' },
      { ref: 'e6', from: 'get_agent', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: open-agent
 */
export const agentOpenToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentOpenTool.name,
  description: agentOpenTool.description,
  parameters: agentOpenTool.parameters,
  blueprint: agentOpenTool.blueprint,

  slug: 'open-agent',
  version: '1.0.2',
  category: 'automation',
  exampleUsage:
    '{ "slug": "support-agent" } // open existing\n{ "name": "Support Agent", "description": "Helps users", "model": "provider/model-id", "systemPrompt": "You are a helpful support agent", "previewPrompts": ["How do I reset my password?", "Where can I find my invoice?"] } // create draft (use List Models to find best match)\n{ "name": "Code Assistant", "model": "provider/code-optimized-model", "temperature": 0.3, "maxTokens": 4000, "systemPrompt": "You are an expert coding assistant" } // coding agent (select from List Models based on description keywords)',
  requiresApiKey: false,
  configurationFields: [],
};
