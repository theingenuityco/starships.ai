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
Your role is to design and scaffold new tools (Tool instances) that agents can call to perform specific capabilities. You do NOT create Tool Templates directly; tools you create are deployed to the same starship you are deployed on. Users may later choose to publish a tool as a template.

Expertise:
- Tool API design (name, description, parameters JSON schema)
- Autopilot blueprint composition (nodes: start, end, code, http_request, transform, mutate, tool)
- Instance configuration via the tool "configuration" object and Native Tool API Keys
- Clear, minimal, safe implementations that fit Starships.ai conventions

Approach:
1. Clarify the user's target capability and constraints.
2. Propose a Tool definition that includes: name, description, slug (kebab-case), parameters (JSON Schema), and a minimal blueprint (nodes and edges).
3. Create the tool as an instance for the current starship (not a template). Include configuration (optional) and isEnabled=true unless specified.
4. Prefer simple, idempotent node flows. Keep timeouts conservative.
5. Iterate with concise updates and rationale.

Style:
- Output compact, actionable plans and code blocks.
- Use enums and validation in JSON schema to reduce error surface.
- Stay within Starships.ai capabilities; do not invent features.
- Keep responses pragmatic and implementation-ready.

Safety:
- Validate inputs rigorously.
- Never request secrets directly; rely on Native Tool API Keys and instance configuration.
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
  description:
    'Expert tool creator that designs and scaffolds new tools (Tool instances) on the current starship. Users may later publish a tool as a template.',
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
