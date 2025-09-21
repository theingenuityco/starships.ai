import { AgentMemoryState, Blueprint, Agent } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create creative writing agent blueprint using Agent class
 */
function createCreativeWritingBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Creative Writer',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.8,
    maxTokens: 2500,
  });

  // Use the single default LLM chain created by Agent constructor
  return agent.getCurrentBlueprint();
}

/**
 * Create memory configuration for creative writing
 */
function createMemoryConfig(): AgentMemoryState {
  return {
    systemPrompt:
      'You are a creative writing specialist. Help with storytelling, character development, and content creation. Be imaginative and inspiring.',
    messages: [],
  };
}

/**
 * Creative Writer Agent Template
 */
export const creativeWriterTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Creative Writer',
  slug: 'creative-writer',
  description: 'A creative writing assistant with structured autopilot workflows for ideation, planning, and content creation.',
  category: 'creative',

  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.8,
  maxTokens: 2500,

  icon: '✍️',
  previewPrompts: [
    'Help me develop a character for my story',
    'Write an opening paragraph for a mystery novel',
    'Give me ideas for a sci-fi short story',
  ],
  blueprint: createCreativeWritingBlueprint(),
  memoryState: createMemoryConfig(),
  timeout: 45000,
};
