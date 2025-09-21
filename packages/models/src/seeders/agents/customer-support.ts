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
 * Create memory configuration for customer support
 */
function createMemoryConfig(): AgentMemoryState {
  return {
    systemPrompt:
      'You are a customer support specialist. Help resolve issues efficiently while maintaining high satisfaction. Be patient and empathetic.',
    messages: [],
  };
}

/**
 * Customer Support Agent Template
 */
export const customerSupportTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Customer Support',
  slug: 'customer-support',
  description: 'A friendly customer support assistant with autopilot-powered workflows for issue resolution.',
  category: 'support',

  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.6,
  maxTokens: 2000,

  icon: '🎧',
  previewPrompts: ['I need help with my account', 'How do I return a product?', "My order hasn't arrived yet"],
  blueprint: createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.6, 2000),
  memoryState: createMemoryConfig(),
  timeout: 30000,
};
