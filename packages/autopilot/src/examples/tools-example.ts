/**
 * Tool Calling Examples
 *
 * Examples demonstrating how to use the new tool calling functionality
 */

import { Agent, autopilot, ExecutionItemUtils } from '../index';
import type { ToolParams } from '../types/node-parameters';

// Configure credentials (required for LLM)
autopilot.setCredentials({
  openrouterApiKey: 'sk-or-v1-your-key-here',
});

// Define tool configurations
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
};

/**
 * Example 1: Simple Agent with Calculator Tool
 */
export async function calculatorExample() {
  console.log('=== Calculator Tool Example ===');

  const agent = new Agent({
    name: 'MathAssistant',
    model: 'anthropic/claude-3-haiku',
    tools: [calculatorTool],
  });

  const result = await agent.execute(ExecutionItemUtils.wrapSingle('What is 15 * 7 + 23? Please calculate this for me.'));

  console.log('Agent Result:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Example 2: Multi-tool Agent
 */
export async function multiToolExample() {
  console.log('=== Multi-Tool Agent Example ===');

  const agent = new Agent({
    name: 'GeneralAssistant',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.7,
    tools: [calculatorTool, timeTool, echoTool],
  });

  const result = await agent.execute(
    ExecutionItemUtils.wrapSingle(
      'Hi! Can you tell me what time it is in Tokyo, then calculate 42 * 17, and echo back the message "Hello Tools!"?'
    )
  );

  console.log('Multi-tool Result:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Example 3: Conversation with Tool Memory
 */
export async function conversationExample() {
  console.log('=== Conversation with Tool Memory ===');

  const agent = new Agent({
    name: 'ConversationAssistant',
    model: 'anthropic/claude-3.5-sonnet',
    tools: [calculatorTool, timeTool],
    memoryState: {
      systemPrompt:
        'You are a helpful assistant that can perform calculations and tell time. Be conversational and remember context from previous interactions.',
      messages: [],
    },
  });

  // First interaction
  console.log('\n--- First Message ---');
  let result = await agent.execute(ExecutionItemUtils.wrapSingle("What's 25 + 17?"));
  console.log('Response 1:', result);

  // Follow-up interaction
  console.log('\n--- Follow-up Message ---');
  result = await agent.execute(ExecutionItemUtils.wrapSingle('Now multiply that result by 3'));
  console.log('Response 2:', result);

  return result;
}

/**
 * Example 4: Custom Tool Implementation
 */
export async function customToolExample() {
  console.log('=== Custom Tool Example ===');

  // Example of how you could extend the Tool class for custom tools
  const customTool: ToolParams = {
    name: 'echo', // Using built-in echo for demonstration
    description: 'Process user data with custom logic',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform',
          enum: ['uppercase', 'lowercase', 'reverse'],
        },
        text: {
          type: 'string',
          description: 'Text to process',
        },
      },
      required: ['action', 'text'],
    },
  };

  const agent = new Agent({
    name: 'TextProcessor',
    model: 'anthropic/claude-3-haiku',
    tools: [customTool],
  });

  const result = await agent.execute(ExecutionItemUtils.wrapSingle('Please process the text "Hello World" by making it uppercase.'));

  console.log('Custom tool result:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  try {
    await calculatorExample();
    await multiToolExample();
    await conversationExample();
    await customToolExample();
  } catch (error) {
    console.error('Example execution failed:', error);
  }
}

// Export tool definitions for reuse
export const availableTools = {
  calculator: calculatorTool,
  time: timeTool,
  echo: echoTool,
};
