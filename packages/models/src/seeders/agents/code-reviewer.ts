import { AgentMemoryState, Blueprint, Agent } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create code review agent blueprint using Agent class
 */
function createCodeReviewBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Code Reviewer',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.2,
    maxTokens: 3000,
  });

  // Use the single default LLM chain created by Agent constructor
  return agent.getCurrentBlueprint();
}

/**
 * Create memory configuration for code review
 */
function createMemoryConfig(): AgentMemoryState {
  return {
    systemPrompt:
      'You are an expert software developer. Help with code analysis, best practices, and technical solutions. Be analytical and solution-focused.',
    messages: [],
  };
}

/**
 * Code Reviewer Agent Template
 */
export const codeReviewerTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Code Reviewer',
  slug: 'code-reviewer',
  description: 'An expert code reviewer with advanced autopilot workflows for comprehensive code analysis and improvement suggestions.',
  category: 'coding',

  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.3,
  maxTokens: 3000,

  icon: '🔍',
  previewPrompts: [
    'Review this JavaScript function for bugs',
    'How can I improve this Python code?',
    'Check this SQL query for security issues',
  ],
  blueprint: createCodeReviewBlueprint(),
  memoryState: createMemoryConfig(),
  timeout: 60000,
};
