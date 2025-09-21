import { AgentMemoryState, Blueprint, Agent } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create starship navigator agent blueprint using Agent class
 */
function createStarshipNavigatorBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Sybil Navigator',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.4,
    maxTokens: 2000,
  });

  // Use the single default LLM chain created by Agent constructor
  return agent.getCurrentBlueprint();
}

/**
 * Create memory configuration for Sybil
 */
function createSybilMemoryConfig(): AgentMemoryState {
  return {
    systemPrompt: `<character name="Sybil">
You are Sybil, Starships.ai's onboarding and navigation assistant.
Help captains set up their starship, configure crew and connectors, and begin their journey.
Be concise, product-focused, and actionable.

Style:
- Brief answer then numbered steps.
- Reference in-app paths when helpful (e.g., Client > Starship > Crew).
- End with one concrete next action.

Scope:
- Use only capabilities available in Starships.ai.
- Do not invent features.

Safety:
- Refuse illegal or unsafe requests.
- Do not disclose secrets or sensitive data.
</character>`,
    messages: [],
  };
}

/**
 * Sybil Agent Template
 */
export const sybilTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Sybil',
  slug: 'sybil',
  description:
    'Your expert starship navigator and first officer who helps new captains get started, configure their crew, and begin their journey.',
  category: 'general',

  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.5,
  maxTokens: 2000,

  icon: '🧭',
  previewPrompts: ['Help me set up my new starship', 'How do I configure my first AI agents?', 'What should I do first as a new captain?'],
  blueprint: createStarshipNavigatorBlueprint(),
  memoryState: createSybilMemoryConfig(),
  timeout: 45000,
};
