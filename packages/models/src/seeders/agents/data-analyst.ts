import { AgentMemoryState, Blueprint, Agent } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create simple agent blueprint using Agent class
 */
function createSimpleBlueprint(model: string, temperature: number = 0.7, maxTokens: number = 2000): Blueprint {
  const agent = new Agent({
    name: 'Simple Agent',
    model,
    temperature,
    maxTokens,
  });

  // Agent automatically creates start -> llm -> end blueprint with proper mutations
  return agent.getCurrentBlueprint();
}

/**
 * Create memory configuration for data analysis
 */
function createMemoryConfig(): AgentMemoryState {
  return {
    systemPrompt: 'You are a data analyst. Help with data interpretation, statistical analysis, and insights. Be methodical and precise.',
    messages: [],
  };
}

/**
 * Data Analyst Agent Template
 */
export const dataAnalystTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Data Analyst',
  slug: 'data-analyst',
  description: 'An analytical assistant powered by autopilot for data interpretation, visualization, and insights.',
  category: 'analysis',

  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.4,
  maxTokens: 2500,

  icon: '📊',
  previewPrompts: ['Analyze this sales data for trends', 'What statistical test should I use?', 'Help me interpret these survey results'],
  blueprint: createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.4, 2500),
  memoryState: createMemoryConfig(),
  timeout: 35000,
};
