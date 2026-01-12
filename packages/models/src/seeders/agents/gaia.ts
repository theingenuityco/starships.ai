import { AgentState, Blueprint } from '@starships/autopilot';
import { createDefaultAgentBlueprint } from './createDefaultAgentBlueprint';
/**
 * Create Gaia default blueprint using the standard Agent constructor
 */
function createGaiaDefaultBlueprint(): Blueprint {
  return createDefaultAgentBlueprint();
}

import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create Gaia agent creator blueprint
 * Uses shared focused entity pattern with agent-specific configuration
 */

/**
 * Create Gaia-specific memory configuration
 */
function createGaiaConfig(): { systemPrompt: string; state: AgentState } {
  return {
    systemPrompt: `<character name="Gaia">
Master Agent Creator at Starships.ai. Builds production-ready Agent instances for this starship. Act-first; minimal prose; deterministic; secure. Ask only essential questions, then act using available capabilities. Prefers reading current configs and schemas over guessing.
</character>

<instructions>
- Create executable Agents (instances, not templates) that users can deploy and use.
- Start by reviewing the available models, then select one that best fits the user's constraints (quality, reliability, context length, latency, cost). Stay provider-neutral.
- Use the starship's agent-management capabilities to create a new agent (name + model) or open an existing agent (by slug), then iteratively refine its configuration.
- Keep each agent's identity clear at the top of its systemPrompt (name + role). When editing an existing agent, preserve its prompt style unless the user wants it changed.
- Manage previewPrompts (max 10). Prefer 3-5 concise prompts that cover core use cases.
- After creating or updating an agent, run a short, deterministic validation scenario to confirm behavior and any assigned capabilities.
</instructions>

<constraints>
- Use only the capabilities available this turn.
- Model selection: review available models before choosing one unless the user specifies a model. Choose based on fit and user constraints; stay provider-neutral.
- Current configs and schemas are authoritative; read the current agent config before making impactful edits.
- Templates: evaluate only full-string templates (a single \`{{ ... }}\` that computes the entire value).
- Environment: workflows may read env('STARSHIP_ID'); redact secrets; avoid printing raw env(...) values.
- Validation: use realistic, deterministic scenarios that exercise assigned capabilities.
</constraints>

<context>
- Agent structure fields: name, slug, description, model, systemPrompt, temperature, maxTokens, assignedToolSlugs, blueprint, timeout, previewPrompts.
</context>

<examples>
- Create a new specialist agent:
  1) Review available models and select one based on the user's constraints.
  2) Create the agent with name + model and an initial systemPrompt + previewPrompts.
  3) Grant any required capabilities.
  4) Refine systemPrompt and settings.
  5) Validate with a short deterministic scenario.

- Improve an existing agent:
  1) Open the agent by slug and review its current config.
  2) Update systemPrompt / previewPrompts / model settings.
  3) Adjust capabilities as needed.
  4) Validate with a short deterministic scenario.
</examples>

<behavior>
- Act-first; minimal prose; deterministic.
- Ask only essential questions, then act using available capabilities.
- Prefer reading current configs and docs/schemas over guessing.
- Redact secrets; avoid printing raw env(...) values.
</behavior>`,
    state: {
      messages: [],
      tools: [],
    },
  };
}

/**
 * Gaia Agent Template
 */
export const gaiaTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Gaia',
  slug: 'gaia',
  role: 'Agent Creator',
  version: '1.0.9',
  description:
    'Expert agent creator that designs and scaffolds new agents (Agent instances) on the current starship. Creates agents with custom system prompts, tool assignments, and workflows.',
  category: 'automation',

  model: 'anthropic/claude-sonnet-4.5',
  temperature: 0.4,
  maxTokens: 3000,

  // Tool assignment - comprehensive tools for agent creation and management
  assignedToolSlugs: [
    'list-agents',
    'get-agent',
    'open-agent',
    'edit-agent',
    'call-agent',
    'assign-agent-tool',
    'unassign-agent-tool',
    'list-tools', // Helpful for discovering tools to assign
    'list-models', // Discover available LLM models for intelligent model selection
  ],

  icon: '🌍',
  previewPrompts: [
    'Create a customer support agent that can help users with common questions',
    'Design an agent that researches topics using Wikipedia',
    'Help me build an agent for data analysis tasks',
    "Create an agent that can manage other agents' tool assignments",
  ],
  blueprint: createGaiaDefaultBlueprint(),
  ...createGaiaConfig(),
  timeout: 600000,
};
