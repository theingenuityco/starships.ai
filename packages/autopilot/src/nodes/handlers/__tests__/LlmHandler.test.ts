/**
 * LlmHandler Unit Tests
 */

import { LlmHandler } from '../LlmHandler';
import { HttpRequestHandler } from '../HttpRequestHandler';
import { Node, ExecutionContext, LlmNodeParameters, NodeResult } from '../../../types';

// Type definitions for test data structures
interface LlmResponseData {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  url?: string;
  llmResponse?: string;
  model?: string;
}

interface OpenAIResponseBody {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Mock HttpRequestHandler
jest.mock('../HttpRequestHandler');

describe('LlmHandler', () => {
  let handler: LlmHandler;
  let mockNode: Node;
  let mockContext: ExecutionContext;
  let mockHttpHandler: jest.Mocked<HttpRequestHandler>;

  beforeEach(() => {
    mockNode = {
      ref: 'llm-node',
      type: 'llm',
      name: 'Test LLM Node',
      description: 'LLM node for testing',
      parameters: {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Hello, how are you?'
      } as LlmNodeParameters
    };

    handler = new LlmHandler(mockNode);
    mockContext = global.createMockContext();

    // Setup HttpRequestHandler mock
    mockHttpHandler = {
      execute: jest.fn(),
      validate: jest.fn(),
      getIcon: jest.fn(),
      type: 'http_request'
    } as any;

    (HttpRequestHandler as jest.MockedClass<typeof HttpRequestHandler>).mockImplementation(() => mockHttpHandler);
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('llm');
    });
  });

  describe('execute', () => {
    it('should execute successfully with minimal parameters', async () => {
      const mockHttpResult = {
        success: true,
        nodeRef: 'llm-node-http',
        data: {
          body: {
            choices: [{
              message: {
                content: 'Hello! I am doing well, thank you for asking.'
              }
            }]
          }
        },
        duration: 1500,
        executedAt: new Date().toISOString()
      };

      mockHttpHandler.execute.mockResolvedValue(mockHttpResult);

      const result = await handler.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.nodeRef).toBe('llm-node');
      const resultData = result.data as LlmResponseData;
      expect(resultData.llmResponse).toBe('Hello! I am doing well, thank you for asking.');
      expect(resultData.model).toBe('anthropic/claude-3.5-sonnet');
      expect(result.duration).toBe(1500);
    });

    it('should execute with full parameters', async () => {
      const fullParamsNode: Node = {
        ...mockNode,
        parameters: {
          model: 'openai/gpt-4-turbo',
          prompt: 'Explain quantum computing',
          systemMessage: 'You are a helpful physics teacher',
          temperature: 0.8,
          maxTokens: 500,
          topP: 0.9,
          frequencyPenalty: 0.1,
          presencePenalty: 0.2,
          timeout: 30000,
          stream: false
        } as LlmNodeParameters
      };

      const fullHandler = new LlmHandler(fullParamsNode);

      const mockHttpResult = {
        success: true,
        nodeRef: 'llm-node-http',
        data: {
          body: {
            choices: [{
              message: {
                content: 'Quantum computing is a revolutionary technology...'
              }
            }]
          }
        },
        duration: 2000,
        executedAt: new Date().toISOString()
      };

      mockHttpHandler.execute.mockResolvedValue(mockHttpResult);

      const result = await fullHandler.execute(mockContext);

      expect(result.success).toBe(true);
      const resultData = result.data as LlmResponseData;
      expect(resultData.llmResponse).toBe('Quantum computing is a revolutionary technology...');
      expect(resultData.model).toBe('openai/gpt-4-turbo');

      // Verify HttpRequestHandler was called with correct parameters
      expect(HttpRequestHandler).toHaveBeenCalledWith(expect.objectContaining({
        parameters: expect.objectContaining({
          url: 'https://openrouter.ai/api/v1/chat/completions',
          method: 'POST',
          timeout: 30000,
          body: expect.objectContaining({
            model: 'openai/gpt-4-turbo',
            temperature: 0.8,
            max_tokens: 500,
            top_p: 0.9,
            frequency_penalty: 0.1,
            presence_penalty: 0.2,
            stream: false,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful physics teacher'
              },
              {
                role: 'user',
                content: 'Explain quantum computing'
              }
            ]
          })
        })
      }));
    });

    it('should handle system message correctly', async () => {
      const systemMessageNode: Node = {
        ...mockNode,
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'What is AI?',
          systemMessage: 'You are an expert AI researcher'
        } as LlmNodeParameters
      };

      const systemHandler = new LlmHandler(systemMessageNode);

      const mockHttpResult = {
        success: true,
        nodeRef: 'llm-node-http',
        data: {
          body: {
            choices: [{
              message: {
                content: 'AI stands for Artificial Intelligence...'
              }
            }]
          }
        },
        duration: 1200,
        executedAt: new Date().toISOString()
      };

      mockHttpHandler.execute.mockResolvedValue(mockHttpResult);

      await systemHandler.execute(mockContext);

      expect(HttpRequestHandler).toHaveBeenCalledWith(expect.objectContaining({
        parameters: expect.objectContaining({
          body: expect.objectContaining({
            messages: [
              {
                role: 'system',
                content: 'You are an expert AI researcher'
              },
              {
                role: 'user',
                content: 'What is AI?'
              }
            ]
          })
        })
      }));
    });

    it('should handle prompt only (no system message)', async () => {
      const result = await handler.execute(mockContext);

      expect(HttpRequestHandler).toHaveBeenCalledWith(expect.objectContaining({
        parameters: expect.objectContaining({
          body: expect.objectContaining({
            messages: [
              {
                role: 'user',
                content: 'Hello, how are you?'
              }
            ]
          })
        })
      }));
    });

    it('should extract LLM response from different response formats', async () => {
      const testCases = [
        // OpenAI format
        {
          data: { body: { choices: [{ message: { content: 'OpenAI response' } }] } },
          expected: 'OpenAI response'
        },
        // String response
        {
          data: { body: 'Direct string response' },
          expected: 'Direct string response'
        },
        // Content field
        {
          data: { body: { content: 'Content field response' } },
          expected: 'Content field response'
        },
        // Text field
        {
          data: { body: { text: 'Text field response' } },
          expected: 'Text field response'
        },
        // Fallback to JSON
        {
          data: { body: { other: 'data' } },
          expected: '{"other":"data"}'
        }
      ];

      for (const testCase of testCases) {
        const mockHttpResult = {
          success: true,
          nodeRef: 'llm-node-http',
          ...testCase,
          duration: 1000,
          executedAt: new Date().toISOString()
        };

        mockHttpHandler.execute.mockResolvedValue(mockHttpResult);

        const result = await handler.execute(mockContext);

        const resultData = result.data as LlmResponseData;
        expect(resultData.llmResponse).toBe(testCase.expected);
      }
    });

    it('should handle HTTP request failure', async () => {
      const mockHttpResult = {
        success: false,
        nodeRef: 'llm-node-http',
        error: 'HTTP request failed',
        duration: 500,
        executedAt: new Date().toISOString()
      };

      mockHttpHandler.execute.mockResolvedValue(mockHttpResult);

      const result = await handler.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP request failed');
      expect(result.nodeRef).toBe('llm-node');
    });

    it('should handle missing response body', async () => {
      const mockHttpResult = {
        success: true,
        nodeRef: 'llm-node-http',
        data: {}, // No body
        duration: 1000,
        executedAt: new Date().toISOString()
      };

      mockHttpHandler.execute.mockResolvedValue(mockHttpResult);

      const result = await handler.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.nodeRef).toBe('llm-node');
    });

    it('should handle execution errors gracefully', async () => {
      mockHttpHandler.execute.mockRejectedValue(new Error('Network error'));

      const result = await handler.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.nodeRef).toBe('llm-node');
    });

    it('should set execution timestamp', async () => {
      const mockHttpResult = {
        success: true,
        nodeRef: 'llm-node-http',
        data: { body: { choices: [{ message: { content: 'Response' } }] } },
        duration: 1000,
        executedAt: new Date().toISOString()
      };

      mockHttpHandler.execute.mockResolvedValue(mockHttpResult);

      const beforeExecution = Date.now();
      const result = await handler.execute(mockContext);
      const afterExecution = Date.now();

      expect(result.executedAt).toBeDefined();
    });
  });

  describe('validate', () => {
    it('should validate successfully with valid parameters', () => {
      const nodeWithSystemMessage: Node = {
        ...mockNode,
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Hello, how are you?',
          systemMessage: 'You are a helpful assistant'
        } as LlmNodeParameters
      };
      const handlerWithSystemMessage = new LlmHandler(nodeWithSystemMessage);
      
      const result = handlerWithSystemMessage.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should validate successfully with all optional parameters', () => {
      const fullParamsNode: Node = {
        ...mockNode,
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Test prompt',
          systemMessage: 'Test system message',
          temperature: 0.7,
          maxTokens: 1000,
          topP: 0.9,
          frequencyPenalty: 0.1,
          presencePenalty: 0.2,
          timeout: 30000,
          stream: false
        } as LlmNodeParameters
      };

      const fullHandler = new LlmHandler(fullParamsNode);
      const result = fullHandler.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when model is missing', () => {
      const nodeWithoutModel: Node = {
        ...mockNode,
        parameters: {
          prompt: 'Hello, how are you?'
        } as LlmNodeParameters
      };
      const handlerWithoutModel = new LlmHandler(nodeWithoutModel);

      const result = handlerWithoutModel.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Model is required',
        nodeRef: 'llm-node',
        severity: 'error'
      });
    });

    it('should fail validation when prompt is missing', () => {
      const nodeWithoutPrompt: Node = {
        ...mockNode,
        parameters: {
          model: 'anthropic/claude-3.5-sonnet'
        } as LlmNodeParameters
      };
      const handlerWithoutPrompt = new LlmHandler(nodeWithoutPrompt);

      const result = handlerWithoutPrompt.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Prompt is required',
        nodeRef: 'llm-node',
        severity: 'error'
      });
    });

    it('should fail validation for invalid temperature', () => {
      const nodeWithInvalidTemp: Node = {
        ...mockNode,
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Test prompt',
          temperature: 3.0 // Invalid: > 2
        } as LlmNodeParameters
      };
      const handlerWithInvalidTemp = new LlmHandler(nodeWithInvalidTemp);

      const result = handlerWithInvalidTemp.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'INVALID_TEMPERATURE',
        message: 'Temperature must be between 0 and 2',
        nodeRef: 'llm-node',
        severity: 'error'
      });
    });

    it('should fail validation for invalid maxTokens', () => {
      const nodeWithInvalidTokens: Node = {
        ...mockNode,
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Test prompt',
          maxTokens: 0 // Invalid: < 1
        } as LlmNodeParameters
      };
      const handlerWithInvalidTokens = new LlmHandler(nodeWithInvalidTokens);

      const result = handlerWithInvalidTokens.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'INVALID_MAX_TOKENS',
        message: 'Max tokens must be greater than 0',
        nodeRef: 'llm-node',
        severity: 'error'
      });
    });

    it('should fail validation for invalid topP', () => {
      const nodeWithInvalidTopP: Node = {
        ...mockNode,
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Test prompt',
          topP: 1.5 // Invalid: > 1
        } as LlmNodeParameters
      };
      const handlerWithInvalidTopP = new LlmHandler(nodeWithInvalidTopP);

      const result = handlerWithInvalidTopP.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'INVALID_TOP_P',
        message: 'Top P must be between 0 and 1',
        nodeRef: 'llm-node',
        severity: 'error'
      });
    });

    it('should warn about high token count', () => {
      const nodeWithHighTokens: Node = {
        ...mockNode,
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Test prompt',
          maxTokens: 5000 // High token count
        } as LlmNodeParameters
      };
      const handlerWithHighTokens = new LlmHandler(nodeWithHighTokens);

      const result = handlerWithHighTokens.validate();

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        code: 'HIGH_TOKEN_COUNT',
        message: 'High token count may result in expensive API calls',
        nodeRef: 'llm-node',
        severity: 'warning'
      });
    });

    it('should warn when no system message is provided', () => {
      const result = handler.validate();

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        code: 'NO_SYSTEM_MESSAGE',
        message: 'Consider adding a system message for better AI behavior control',
        nodeRef: 'llm-node',
        severity: 'warning'
      });
    });

    it('should warn about low timeout', () => {
      const nodeWithLowTimeout: Node = {
        ...mockNode,
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Test prompt',
          timeout: 5000 // Low timeout
        } as LlmNodeParameters
      };
      const handlerWithLowTimeout = new LlmHandler(nodeWithLowTimeout);

      const result = handlerWithLowTimeout.validate();

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        code: 'LOW_TIMEOUT',
        message: 'LLM requests may take longer than the specified timeout',
        nodeRef: 'llm-node',
        severity: 'warning'
      });
    });

    it('should fail validation for both missing model and prompt', () => {
      const nodeWithMissingFields: Node = {
        ...mockNode,
        parameters: {
          temperature: 0.7
        } as LlmNodeParameters
      };
      const handlerWithMissingFields = new LlmHandler(nodeWithMissingFields);

      const result = handlerWithMissingFields.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      
      const errorMessages = result.errors.map(e => e.message);
      expect(errorMessages).toContain('Model is required');
      expect(errorMessages).toContain('Prompt is required');
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('brain');
    });
  });

  describe('OpenRouter API integration', () => {
    it('should build correct request body structure', async () => {
      const mockHttpResult = {
        success: true,
        nodeRef: 'llm-node-http',
        data: { body: { choices: [{ message: { content: 'Response' } }] } },
        duration: 1000,
        executedAt: new Date().toISOString()
      };

      mockHttpHandler.execute.mockResolvedValue(mockHttpResult);

      await handler.execute(mockContext);

      expect(HttpRequestHandler).toHaveBeenCalledWith(expect.objectContaining({
        parameters: expect.objectContaining({
          url: 'https://openrouter.ai/api/v1/chat/completions',
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${OPENROUTER_API_KEY}'
          }),
          body: expect.objectContaining({
            model: 'anthropic/claude-3.5-sonnet',
            messages: expect.arrayContaining([
              expect.objectContaining({
                role: 'user',
                content: 'Hello, how are you?'
              })
            ]),
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1.0,
            frequency_penalty: 0,
            presence_penalty: 0,
            stream: false,
            transforms: [],
            route: 'fallback'
          })
        })
      }));
    });
  });
});