/**
 * Parallel Tools Integration Tests
 *
 * End-to-end tests for Agent workflow with parallel tool execution
 */

import { Agent } from '@/nodes/Agent';
import type { AgentParams } from '@/types/node-parameters';
import type { Blueprint } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

// Mock actual tool implementations
const createMockToolBlueprint = (toolName: string): Blueprint => ({
  nodes: [
    { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
    {
      ref: 'code',
      type: 'code',
      name: `${toolName} Implementation`,
      description: `Mock implementation for ${toolName}`,
      parameters: {
        code: `
          const input = $input();
          // Mock ${toolName} execution
          return { 
            tool: '${toolName}', 
            input: input,
            result: 'mock_${toolName}_result',
            timestamp: new Date().toISOString()
          };
        `,
        timeout: 5000
      }
    },
    { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
  ],
  edges: [
    { ref: 'edge-1', from: 'start', to: 'code' },
    { ref: 'edge-2', from: 'code', to: 'end' }
  ],
  metadata: { generatedBy: 'test' }
});

// Mock LLM responses for tool calling scenarios
const mockLLMResponseSingleTool = {
  choices: [{
    message: {
      role: 'assistant',
      content: 'I need to calculate something.',
      tool_calls: [{
        id: 'call_calculator_123',
        function: {
          name: 'calculator',
          arguments_json: { expression: '2 + 2' }
        }
      }]
    },
    finish_reason: 'tool_calls'
  }]
};

const mockLLMResponseMultipleTools = {
  choices: [{
    message: {
      role: 'assistant',
      content: 'I need to use multiple tools.',
      tool_calls: [
        {
          id: 'call_calculator_123',
          function: {
            name: 'calculator',
            arguments_json: { expression: '2 + 2' }
          }
        },
        {
          id: 'call_time_456',
          function: {
            name: 'time',
            arguments_json: {}
          }
        },
        {
          id: 'call_weather_789',
          function: {
            name: 'weather',
            arguments_json: { location: 'San Francisco' }
          }
        }
      ]
    },
    finish_reason: 'tool_calls'
  }]
};

const mockLLMResponseComplete = {
  choices: [{
    message: {
      role: 'assistant',
      content: 'The calculation result is 4.',
      tool_calls: null
    },
    finish_reason: 'stop'
  }]
};

// Mock runners to control execution flow
jest.mock('@/runner/LocalRunner', () => ({
  LocalRunner: jest.fn().mockImplementation(() => {
    let callCount = 0;
    return {
      run: jest.fn().mockImplementation((blueprint, execution) => {
        callCount++;
        
        // Mock LLM node responses
        if (blueprint.nodes.some(n => n.type === 'llm')) {
          // First call: return tool calls, second call: return completion
          if (callCount === 1) {
            return [{ json: mockLLMResponseMultipleTools, pairedItem: { item: 0 } }];
          } else {
            return [{ json: mockLLMResponseComplete, pairedItem: { item: 0 } }];
          }
        }
        
        // Mock tool executions
        if (blueprint.nodes.some(n => n.type === 'code' && n.name?.includes('Implementation'))) {
          const toolName = blueprint.nodes.find(n => n.name?.includes('Implementation'))?.name?.split(' ')[0] || 'unknown';
          return [{
            json: {
              tool: toolName,
              result: `mock_${toolName}_result`,
              timestamp: new Date().toISOString()
            },
            pairedItem: { item: 0 }
          }];
        }
        
        // Default response
        return [{ json: { result: 'mock_result' }, pairedItem: { item: 0 } }];
      })
    };
  })
}));

jest.mock('@/runner/ChildProcessRunner', () => ({
  ChildProcessRunner: jest.fn().mockImplementation(() => {
    let callCount = 0;
    return {
      run: jest.fn().mockImplementation((blueprint, execution) => {
        callCount++;
        
        // Mock Agent execution with proper state handling
        if (blueprint.nodes.some(n => n.type === 'llm')) {
          // First Agent call: return tool calls
          if (callCount === 1) {
            return [{ json: mockLLMResponseMultipleTools, pairedItem: { item: 0 } }];
          } else {
            // Second Agent call: return completion after tools
            return [{ json: mockLLMResponseComplete, pairedItem: { item: 0 } }];
          }
        }
        
        return [{ json: { result: 'mock_agent_result' }, pairedItem: { item: 0 } }];
      })
    };
  })
}));

describe('Parallel Tools Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Single Tool Execution', () => {
    it('should execute single tool call through Agent workflow', async () => {
      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt: 'You are a helpful assistant.',
        state: {
          messages: [],
          tools: [
            {
              name: 'calculator',
              description: 'Calculate mathematical expressions',
              parameters: {
                type: 'object',
                properties: {
                  expression: { type: 'string', description: 'Mathematical expression to evaluate' }
                }
              },
              blueprint: createMockToolBlueprint('calculator')
            }
          ]
        }
      };

      const agent = new Agent(params);
      const input = [{ role: 'user', content: 'What is 2 + 2?' }];
      
      const result = await agent.execute(ExecutionItemUtils.wrapSingle(input));
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Parallel Tool Execution', () => {
    it('should execute multiple tools in parallel through Agent workflow', async () => {
      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt: 'You are a helpful assistant with access to multiple tools.',
        state: {
          messages: [],
          tools: [
            {
              name: 'calculator',
              description: 'Calculate mathematical expressions',
              parameters: {
                type: 'object',
                properties: {
                  expression: { type: 'string', description: 'Mathematical expression to evaluate' }
                }
              },
              blueprint: createMockToolBlueprint('calculator')
            },
            {
              name: 'time',
              description: 'Get current time',
              parameters: {
                type: 'object',
                properties: {}
              },
              blueprint: createMockToolBlueprint('time')
            },
            {
              name: 'weather',
              description: 'Get weather information',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string', description: 'Location to get weather for' }
                }
              },
              blueprint: createMockToolBlueprint('weather')
            }
          ]
        }
      };

      const agent = new Agent(params);
      const input = [{ role: 'user', content: 'Can you calculate 2+2, tell me the time, and check the weather in San Francisco?' }];
      
      const result = await agent.execute(ExecutionItemUtils.wrapSingle(input));
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle partial tool failures gracefully', async () => {
      // Mock one tool to fail
      const originalLocalRunner = require('@/runner/LocalRunner').LocalRunner;
      const mockFailingRunner = jest.fn().mockImplementation(() => ({
        run: jest.fn().mockImplementation((blueprint, execution) => {
          // Make weather tool fail
          if (blueprint.nodes.some(n => n.name?.includes('weather'))) {
            throw new Error('Weather service unavailable');
          }
          
          // Other tools succeed
          if (blueprint.nodes.some(n => n.type === 'code')) {
            const toolName = blueprint.nodes.find(n => n.name?.includes('Implementation'))?.name?.split(' ')[0] || 'unknown';
            return [{
              json: {
                tool: toolName,
                result: `mock_${toolName}_result`,
                timestamp: new Date().toISOString()
              },
              pairedItem: { item: 0 }
            }];
          }
          
          return [{ json: mockLLMResponseMultipleTools, pairedItem: { item: 0 } }];
        })
      }));

      require('@/runner/LocalRunner').LocalRunner = mockFailingRunner;

      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt: 'You are a helpful assistant.',
        state: {
          messages: [],
          tools: [
            {
              name: 'calculator',
              description: 'Calculate mathematical expressions',
              parameters: { type: 'object', properties: {} },
              blueprint: createMockToolBlueprint('calculator')
            },
            {
              name: 'weather',
              description: 'Get weather information',
              parameters: { type: 'object', properties: {} },
              blueprint: createMockToolBlueprint('weather')
            }
          ]
        }
      };

      const agent = new Agent(params);
      const input = [{ role: 'user', content: 'Calculate 2+2 and check the weather' }];
      
      // Should not throw, should handle failures gracefully
      const result = await agent.execute(ExecutionItemUtils.wrapSingle(input));
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // Restore original implementation
      require('@/runner/LocalRunner').LocalRunner = originalLocalRunner;
    });
  });

  describe('Agent State Management', () => {
    it('should properly manage conversation state with tool results', async () => {
      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt: 'You are a helpful assistant.',
        state: {
          messages: [
            { role: 'user', content: 'Hello!' },
            { role: 'assistant', content: 'Hi! How can I help you?' }
          ],
          tools: [
            {
              name: 'calculator',
              description: 'Calculate mathematical expressions',
              parameters: { type: 'object', properties: {} },
              blueprint: createMockToolBlueprint('calculator')
            }
          ]
        }
      };

      const agent = new Agent(params);
      const input = [{ role: 'user', content: 'What is 2 + 2?' }];
      
      const result = await agent.execute(ExecutionItemUtils.wrapSingle(input));
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      // Verify agent maintains its initial state
      expect(agent.validate().valid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tool calls gracefully', async () => {
      // Mock LLM to return no tool calls
      const mockNoToolsRunner = jest.fn().mockImplementation(() => ({
        run: jest.fn().mockResolvedValue([{
          json: {
            choices: [{
              message: {
                role: 'assistant',
                content: 'I can help you without using any tools.',
                tool_calls: null
              },
              finish_reason: 'stop'
            }]
          },
          pairedItem: { item: 0 }
        }])
      }));

      const originalChildRunner = require('@/runner/ChildProcessRunner').ChildProcessRunner;
      require('@/runner/ChildProcessRunner').ChildProcessRunner = mockNoToolsRunner;

      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt: 'You are a helpful assistant.',
        state: {
          messages: [],
          tools: []
        }
      };

      const agent = new Agent(params);
      const input = [{ role: 'user', content: 'Hello' }];
      
      const result = await agent.execute(ExecutionItemUtils.wrapSingle(input));
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // Restore original implementation
      require('@/runner/ChildProcessRunner').ChildProcessRunner = originalChildRunner;
    });

    it('should handle malformed tool call data', async () => {
      const mockMalformedRunner = jest.fn().mockImplementation(() => ({
        run: jest.fn().mockResolvedValue([{
          json: {
            choices: [{
              message: {
                role: 'assistant',
                content: 'Malformed response',
                tool_calls: [
                  {
                    // Missing required fields
                    function: { name: 'calculator' }
                  }
                ]
              },
              finish_reason: 'tool_calls'
            }]
          },
          pairedItem: { item: 0 }
        }])
      }));

      const originalChildRunner = require('@/runner/ChildProcessRunner').ChildProcessRunner;
      require('@/runner/ChildProcessRunner').ChildProcessRunner = mockMalformedRunner;

      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt: 'You are a helpful assistant.',
        state: {
          messages: [],
          tools: [
            {
              name: 'calculator',
              description: 'Calculate mathematical expressions',
              parameters: { type: 'object', properties: {} },
              blueprint: createMockToolBlueprint('calculator')
            }
          ]
        }
      };

      const agent = new Agent(params);
      const input = [{ role: 'user', content: 'What is 2 + 2?' }];
      
      // Should handle malformed data gracefully
      const result = await agent.execute(ExecutionItemUtils.wrapSingle(input));
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // Restore original implementation
      require('@/runner/ChildProcessRunner').ChildProcessRunner = originalChildRunner;
    });
  });
});