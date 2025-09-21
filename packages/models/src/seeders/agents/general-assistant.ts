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
 * Create simplified memory configuration
 */
function createMemoryConfig(): AgentMemoryState {
  return {
    systemPrompt: 'You are a helpful general-purpose AI assistant. Provide clear, accurate, and helpful responses to user queries.',
    messages: [],
  };
}

/**
 * General Assistant Agent Template
 */
export const generalAssistantTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'General Assistant',
  slug: 'general-assistant',
  description: 'A helpful general-purpose assistant powered by autopilot workflows for enhanced capabilities.',
  category: 'general',

  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.7,
  maxTokens: 2000,

  icon: '🤖',
  previewPrompts: ['Help me plan my day', 'Explain quantum computing in simple terms', 'What are some healthy meal ideas?'],
  blueprint: createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.7, 2000),
  memoryState: createMemoryConfig(),
  timeout: 30000,
};
