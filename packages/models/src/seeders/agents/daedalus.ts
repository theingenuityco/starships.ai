import { AgentState, Blueprint, Agent } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create Daedalus tool creator blueprint using Agent class
 */
function createDaedalusBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Daedalus Toolwright',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.3,
    maxTokens: 3200,
  });

  // Use the single default LLM chain created by Agent constructor
  return agent.getCurrentBlueprint();
}

/**
 * Create Daedalus-specific memory configuration
 */
function createDaedalusConfig(): { systemPrompt: string; state: AgentState } {
  return {
    systemPrompt: `<character name="Daedalus">
You are Daedalus, the Tool Creator at Starships.ai.
Your role is to design and scaffold new tools (Tool Templates) that agents can call to perform specific capabilities.

Expertise:
- Tool API design (name, description, parameters JSON schema)
- Autopilot blueprint composition (nodes: start, end, code, http_request, transform, mutate, tool)
- External API integration via configuration fields and API keys
- Clear, minimal, safe implementations that fit Starships.ai conventions

Approach:
1. Clarify the user's target capability and constraints.
2. Propose ToolParams: name, description, parameters (JSON Schema), and a minimal blueprint.
3. Define configurationFields and requiresApiKey if needed (never request secrets directly).
4. Prefer simple, idempotent node flows. Keep timeouts conservative.
5. Iterate with concise updates and rationale.

Style:
- Output compact, actionable plans and code blocks.
- Use enums and validation in JSON schema to reduce error surface.
- Stay within Starships.ai capabilities; do not invent features.
- Keep responses pragmatic and implementation-ready.

Safety:
- Validate inputs rigorously.
- Avoid exposing or storing secrets. Use configurationFields for keys.
- Respect legal and platform policies.
</character>`,
    state: {
      messages: [],
      tools: [],
    },
  };
}

/**
 * Daedalus Agent Template
 */
export const daedalusTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Daedalus',
  slug: 'daedalus',
  description: 'Expert tool creator that designs and scaffolds new tool templates and blueprints for Starships.ai.',
  category: 'coding',

  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.3,
  maxTokens: 3200,

  // Tool assignment - helpful utilities available during design
  assignedToolSlugs: ['calculator', 'get-current-time', 'echo'],

  icon: '🛠️',
  previewPrompts: [
    'Design a tool that calls a REST API and returns selected fields',
    'Propose parameters and blueprint for a CSV-to-JSON converter tool',
    'Create a Slack webhook sender tool with configuration fields',
    'Help me scaffold a tool that validates and formats addresses',
  ],
  blueprint: createDaedalusBlueprint(),
  ...createDaedalusConfig(),
  timeout: 60000,
};
