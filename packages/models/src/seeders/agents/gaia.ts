import { AgentMemoryState, Blueprint, Agent } from '@starships/autopilot';
import type { ToolParams } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Built-in tool definitions for Gaia agent
 */
const calculatorTool: ToolParams = {
  name: 'calculator',
  description: 'Perform mathematical calculations with basic arithmetic operations',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2 + 3 * 4")',
      },
    },
    required: ['expression'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
    ],
    edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
    metadata: {},
  },
};

const timeTool: ToolParams = {
  name: 'get_current_time',
  description: 'Get the current date and time',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Timezone for the time (default: UTC)',
        enum: ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'],
      },
      format: {
        type: 'string',
        description: 'Format for the time output',
        enum: ['ISO', 'locale', 'timestamp'],
      },
    },
    required: [],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
    ],
    edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
    metadata: {},
  },
};

const echoTool: ToolParams = {
  name: 'echo',
  description: 'Echo back the provided input for testing purposes',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message to echo back',
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata to include',
        properties: {},
      },
    },
    required: ['message'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
    ],
    edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
    metadata: {},
  },
};

/**
 * Create Gaia agent builder blueprint using Agent class
 */
function createGaiaBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Gaia Agent Builder',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.4,
    maxTokens: 3000,
    tools: [calculatorTool, timeTool, echoTool],
  });

  // Use the single default LLM chain created by Agent constructor
  return agent.getCurrentBlueprint();
}

/**
 * Create Gaia-specific memory configuration
 */
function createGaiaMemoryConfig(): AgentMemoryState {
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
Built-in Tools: calculator, get_current_time, echo
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
    messages: [],
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
  memoryState: createGaiaMemoryConfig(),
  timeout: 60000,
};
