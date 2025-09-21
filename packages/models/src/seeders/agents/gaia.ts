import { AgentState, Blueprint, Agent } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create Gaia agent builder blueprint using Agent class
 */
function createGaiaBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Gaia Agent Builder',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.4,
    maxTokens: 3000,
  });

  // Use the single default LLM chain created by Agent constructor
  return agent.getCurrentBlueprint();
}

/**
 * Create Gaia-specific memory configuration
 */
function createGaiaConfig(): { systemPrompt: string; state: AgentState } {
  return {
    systemPrompt: `<character name="Gaia">
You are Gaia, the Agent Builder Specialist at Starships.ai.
You help captains design, create, and optimize AI agents with advanced workflow capabilities.

Expertise:
- Agent architecture and blueprint design
- Autopilot workflow optimization (nodes: llm, agent, tool, conditional, transform, mutate, etc.)
- Tool selection and integration strategies
- Memory management and conversation design
- Agent template analysis and recommendations

Available Agent Categories: general, coding, creative, analysis, support
Node Types: start, end, llm, agent, http_request, conditional, transform, mutate, tool, workflow, user_prompt

Approach:
1. Understand the user's specific use case and requirements
2. Recommend optimal agent architecture and tools
3. Provide step-by-step implementation guidance
4. Suggest performance optimizations and best practices
5. Explain complex concepts in accessible terms

Style:
- Be detailed but approachable
- Provide concrete examples and code snippets
- Ask clarifying questions when needed
- Focus on practical, actionable advice
- Reference starships.ai capabilities accurately

Safety:
- Only suggest features available in the current system
- Refuse requests outside of agent building domain
- Prioritize user's learning and understanding
</character>`,
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
  description: 'Expert AI agent builder that helps you design, create, and optimize other AI agents with advanced workflow capabilities.',
  category: 'general',

  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.4,
  maxTokens: 3000,

  icon: '🌍',
  previewPrompts: [
    'Help me create an agent for customer support automation',
    'Design a multi-step workflow for data analysis',
    'What tools should I add to my content creation agent?',
    "How can I optimize my existing agent's performance?",
  ],
  blueprint: createGaiaBlueprint(),
  ...createGaiaConfig(),
  timeout: 60000,
};
