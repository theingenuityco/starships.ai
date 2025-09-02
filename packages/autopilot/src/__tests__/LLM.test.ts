/**
 * LLM Unit Tests
 */

import { LLM } from '../LLM';
import { HttpRequest } from '../HttpRequest';
import { AgentMemory } from '../AgentMemory';
import { LlmNodeParameters, Execution } from '../types';

// Mock HttpRequest
jest.mock('../HttpRequest');
const MockedHttpRequest = HttpRequest as jest.MockedClass<typeof HttpRequest>;

describe('LLM', () => {
  let llm: LLM;
  let basicParams: LlmNodeParameters;
  let mockHttpRequest: jest.Mocked<HttpRequest>;

  beforeEach(() => {
    // Reset mocks
    MockedHttpRequest.mockClear();
    
    // Create mock HttpRequest instance
    mockHttpRequest = {
      execute: jest.fn(),
      validate: jest.fn(),
      getUrl: jest.fn(),
      getMethod: jest.fn(),
      getHeaders: jest.fn(),
      getBody: jest.fn(),
      getTimeout: jest.fn(),
      getParameters: jest.fn(),
      clone: jest.fn(),
      updateParameters: jest.fn()
    } as any;
    
    // Make constructor return our mock
    MockedHttpRequest.mockImplementation(() => mockHttpRequest);
    
    // Setup default mock responses
    mockHttpRequest.validate.mockReturnValue({ valid: true, errors: [] });

    // Basic valid parameters
    basicParams = {
      model: 'openai/gpt-4',
      prompt: 'Hello, how can I help you?',
      openrouterApiKey: 'test-api-key-123'
    };

    llm = new LLM(basicParams);

    // Spy on console.log
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with basic parameters', () => {
      expect(llm).toBeInstanceOf(LLM);
      expect(llm.getModel()).toBe('openai/gpt-4');
      expect(llm.getPrompt()).toBe('Hello, how can I help you?');
    });

    it('should create deep copy of parameters to prevent mutations', () => {
      const originalParams = { ...basicParams };
      originalParams.model = 'modified-model';
      originalParams.prompt = 'modified-prompt';
      
      expect(llm.getModel()).toBe('openai/gpt-4');
      expect(llm.getPrompt()).toBe('Hello, how can I help you?');
    });

    it('should handle optional parameters', () => {
      const fullParams: LlmNodeParameters = {
        model: 'anthropic/claude-3-sonnet',
        prompt: 'Complex prompt',
        openrouterApiKey: 'full-api-key',
        temperature: 0.7,
        maxTokens: 2000,
        timeout: 30000,
        stream: true,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: -0.1
      };

      const fullLlm = new LLM(fullParams);
      const params = fullLlm.getParameters();
      
      expect(params.temperature).toBe(0.7);
      expect(params.maxTokens).toBe(2000);
      expect(params.timeout).toBe(30000);
      expect(params.stream).toBe(true);
      expect(params.topP).toBe(0.9);
      expect(params.frequencyPenalty).toBe(0.1);
      expect(params.presencePenalty).toBe(-0.1);
    });
  });

  describe('getter methods', () => {
    beforeEach(() => {
      const fullParams: LlmNodeParameters = {
        model: 'openai/gpt-4-turbo',
        prompt: 'Analyze this data',
        openrouterApiKey: 'test-key',
        temperature: 0.8,
        maxTokens: 1500,
        timeout: 45000
      };
      llm = new LLM(fullParams);
    });

    it('should get model', () => {
      expect(llm.getModel()).toBe('openai/gpt-4-turbo');
    });

    it('should get prompt', () => {
      expect(llm.getPrompt()).toBe('Analyze this data');
    });

    it('should get timeout', () => {
      expect(llm.getTimeout()).toBe(45000);
    });

    it('should return undefined for missing timeout', () => {
      const minimalLlm = new LLM(basicParams);
      expect(minimalLlm.getTimeout()).toBeUndefined();
    });

    it('should get parameters as deep copy', () => {
      const params = llm.getParameters();
      
      expect(params.model).toBe('openai/gpt-4-turbo');
      expect(params.prompt).toBe('Analyze this data');
      expect(params.temperature).toBe(0.8);
      expect(params.maxTokens).toBe(1500);
      
      // Modify returned params should not affect original
      params.model = 'modified-model';
      params.temperature = 1.5;
      
      expect(llm.getModel()).toBe('openai/gpt-4-turbo');
      expect(llm.getParameters().temperature).toBe(0.8);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      mockHttpRequest.execute.mockResolvedValue({
        status: 'completed',
        data: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'This is the LLM response'
                }
              }
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
          },
          url: 'https://openrouter.ai/api/v1/chat/completions'
        }
      });
    });

    it('should execute successfully without execution context', async () => {
      const result = await llm.execute();

      expect(result.status).toBe('completed');
      expect(result.data?.llmResponse).toBe('This is the LLM response');
      expect(result.data?.model).toBe('openai/gpt-4');
      expect(result.error).toBeUndefined();
      
      expect(MockedHttpRequest).toHaveBeenCalledTimes(1);
      expect(mockHttpRequest.execute).toHaveBeenCalledTimes(1);
    });

    it('should execute successfully with execution context', async () => {
      const agentMemory = new AgentMemory();
      agentMemory.addMessage('system', 'You are a helpful assistant');
      agentMemory.addMessage('user', 'Previous user message');

      const execution: Execution = {
        status: 'running',
        executionResults: new Map(),
        agentMemory
      };

      const result = await llm.execute(execution);

      expect(result.status).toBe('completed');
      expect(result.data?.llmResponse).toBe('This is the LLM response');
      
      // Should add assistant response to memory
      const messages = execution.agentMemory.getMessageHistory();
      expect(messages).toHaveLength(3);
      expect(messages[2].role).toBe('assistant');
      expect(messages[2].content).toBe('This is the LLM response');
      expect(messages[2].metadata).toEqual({ model: 'openai/gpt-4' });
    });

    it('should build correct HttpRequest parameters without execution', async () => {
      await llm.execute();

      expect(MockedHttpRequest).toHaveBeenCalledWith({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123'
        },
        body: {
          model: 'openai/gpt-4',
          messages: [
            { role: 'user', content: 'Hello, how can I help you?' }
          ],
          temperature: 0.7,
          max_tokens: 1024,
          top_p: 1.0,
          frequency_penalty: 0,
          presence_penalty: 0,
          stream: false,
          transforms: [],
          route: 'fallback'
        },
        timeout: 60000,
        retries: 1,
        followRedirects: true
      });
    });

    it('should build correct HttpRequest parameters with execution context', async () => {
      const agentMemory = new AgentMemory();
      agentMemory.addMessage('system', 'You are helpful');
      agentMemory.addMessage('user', 'Previous message');

      const execution: Execution = {
        status: 'running',
        executionResults: new Map(),
        agentMemory
      };

      await llm.execute(execution);

      const httpRequestCall = MockedHttpRequest.mock.calls[0][0];
      expect((httpRequestCall.body as any).messages).toEqual([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Previous message' },
        { role: 'user', content: 'Hello, how can I help you?' }
      ]);
    });

    it('should use custom LLM parameters in HTTP request', async () => {
      const customParams: LlmNodeParameters = {
        model: 'anthropic/claude-3-opus',
        prompt: 'Custom prompt',
        openrouterApiKey: 'custom-key',
        temperature: 0.5,
        maxTokens: 500,
        timeout: 20000,
        stream: true,
        topP: 0.8,
        frequencyPenalty: 0.2,
        presencePenalty: -0.2
      };

      const customLlm = new LLM(customParams);
      await customLlm.execute();

      const httpRequestCall = MockedHttpRequest.mock.calls[0][0];
      expect(httpRequestCall.headers!['Authorization']).toBe('Bearer custom-key');
      expect((httpRequestCall.body as any).model).toBe('anthropic/claude-3-opus');
      expect((httpRequestCall.body as any).temperature).toBe(0.5);
      expect((httpRequestCall.body as any).max_tokens).toBe(500);
      expect((httpRequestCall.body as any).top_p).toBe(0.8);
      expect((httpRequestCall.body as any).frequency_penalty).toBe(0.2);
      expect((httpRequestCall.body as any).presence_penalty).toBe(-0.2);
      expect((httpRequestCall.body as any).stream).toBe(true);
      expect(httpRequestCall.timeout).toBe(20000);
    });

    it('should handle HTTP request failure', async () => {
      mockHttpRequest.execute.mockResolvedValue({
        status: 'failed',
        error: new Error('HTTP request failed')
      });

      const result = await llm.execute();

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('LLM request failed: HTTP request failed');
    });

    it('should handle HTTP request failure without error message', async () => {
      mockHttpRequest.execute.mockResolvedValue({
        status: 'failed'
      });

      const result = await llm.execute();

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('LLM request failed: LLM request failed');
    });

    it('should handle execution errors', async () => {
      mockHttpRequest.execute.mockRejectedValue(new Error('Network error'));

      const result = await llm.execute();

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('LLM execution failed: Network error');
    });

    it('should handle non-Error exceptions', async () => {
      mockHttpRequest.execute.mockRejectedValue('String error');

      const result = await llm.execute();

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('LLM execution failed: Unknown error');
    });

    it('should extract response from different response formats', async () => {
      // Test OpenAI format
      mockHttpRequest.execute.mockResolvedValueOnce({
        status: 'completed',
        data: {
          body: {
            choices: [{ message: { content: 'OpenAI response' } }]
          }
        }
      });

      let result = await llm.execute();
      expect(result.data?.llmResponse).toBe('OpenAI response');

      // Test string response
      mockHttpRequest.execute.mockResolvedValueOnce({
        status: 'completed',
        data: {
          body: 'Direct string response'
        }
      });

      result = await llm.execute();
      expect(result.data?.llmResponse).toBe('Direct string response');

      // Test content field
      mockHttpRequest.execute.mockResolvedValueOnce({
        status: 'completed',
        data: {
          body: { content: 'Content field response' }
        }
      });

      result = await llm.execute();
      expect(result.data?.llmResponse).toBe('Content field response');

      // Test text field
      mockHttpRequest.execute.mockResolvedValueOnce({
        status: 'completed',
        data: {
          body: { text: 'Text field response' }
        }
      });

      result = await llm.execute();
      expect(result.data?.llmResponse).toBe('Text field response');

      // Test fallback to JSON string
      mockHttpRequest.execute.mockResolvedValueOnce({
        status: 'completed',
        data: {
          body: { unknown: 'format', data: [1, 2, 3] }
        }
      });

      result = await llm.execute();
      expect(result.data?.llmResponse).toBe('{"unknown":"format","data":[1,2,3]}');
    });

    it('should handle malformed response body gracefully', async () => {
      mockHttpRequest.execute.mockResolvedValue({
        status: 'completed',
        data: {
          body: { choices: null }
        }
      });

      const result = await llm.execute();

      expect(result.status).toBe('completed');
      expect(result.data?.llmResponse).toBe('{"choices":null}');
    });

    it('should not add to memory if no execution context provided', async () => {
      const result = await llm.execute();

      expect(result.status).toBe('completed');
      // No memory operations should occur
    });

    it('should preserve HTTP response data in LLM result', async () => {
      const httpResponseData = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: {
          choices: [{ message: { content: 'Test response' } }],
          usage: { total_tokens: 50 }
        },
        url: 'https://openrouter.ai/api/v1/chat/completions'
      };

      mockHttpRequest.execute.mockResolvedValue({
        status: 'completed',
        data: httpResponseData
      });

      const result = await llm.execute();

      expect(result.data).toMatchObject({
        ...httpResponseData,
        llmResponse: 'Test response',
        model: 'openai/gpt-4'
      });
    });
  });

  describe('validate', () => {
    it('should validate successfully with valid parameters', () => {
      const result = llm.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when model is missing', () => {
      const invalidParams = { ...basicParams };
      delete (invalidParams as any).model;
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Model is required');
    });

    it('should fail validation when prompt is missing', () => {
      const invalidParams = { ...basicParams };
      delete (invalidParams as any).prompt;
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Prompt is required');
    });

    it('should fail validation when API key is missing', () => {
      const invalidParams = { ...basicParams };
      delete (invalidParams as any).openrouterApiKey;
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('OpenRouter API key is required');
    });

    it('should fail validation with invalid temperature', () => {
      const invalidParams: LlmNodeParameters = {
        ...basicParams,
        temperature: 3.0 // Greater than 2
      };
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Temperature must be between 0 and 2');
    });

    it('should fail validation with negative temperature', () => {
      const invalidParams: LlmNodeParameters = {
        ...basicParams,
        temperature: -0.1
      };
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Temperature must be between 0 and 2');
    });

    it('should fail validation with invalid maxTokens', () => {
      const invalidParams: LlmNodeParameters = {
        ...basicParams,
        maxTokens: 0
      };
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Max tokens must be greater than 0');
    });

    it('should fail validation with invalid topP', () => {
      const invalidParams: LlmNodeParameters = {
        ...basicParams,
        topP: 1.5 // Greater than 1
      };
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Top P must be between 0 and 1');
    });

    it('should fail validation with invalid frequencyPenalty', () => {
      const invalidParams: LlmNodeParameters = {
        ...basicParams,
        frequencyPenalty: 3.0 // Greater than 2
      };
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Frequency penalty must be between -2 and 2');
    });

    it('should fail validation with invalid presencePenalty', () => {
      const invalidParams: LlmNodeParameters = {
        ...basicParams,
        presencePenalty: -3.0 // Less than -2
      };
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Presence penalty must be between -2 and 2');
    });

    it('should fail validation with invalid timeout', () => {
      const invalidParams: LlmNodeParameters = {
        ...basicParams,
        timeout: 500 // Less than 1000ms
      };
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Timeout should be at least 1000ms');
    });

    it('should delegate to HttpRequest validation when LLM validation passes', () => {
      llm.validate();
      
      expect(MockedHttpRequest).toHaveBeenCalledTimes(1);
      expect(mockHttpRequest.validate).toHaveBeenCalledTimes(1);
    });

    it('should include HttpRequest validation errors', () => {
      mockHttpRequest.validate.mockReturnValue({
        valid: false,
        errors: ['HTTP validation error 1', 'HTTP validation error 2']
      });

      const result = llm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('HTTP validation error 1');
      expect(result.errors).toContain('HTTP validation error 2');
    });

    it('should not call HttpRequest validation if LLM validation fails', () => {
      const invalidParams = { ...basicParams };
      delete (invalidParams as any).model;
      const invalidLlm = new LLM(invalidParams);
      
      invalidLlm.validate();
      
      // HttpRequest should not be called since LLM validation failed
      expect(MockedHttpRequest).not.toHaveBeenCalled();
    });

    it('should pass validation with all valid parameters', () => {
      const validParams: LlmNodeParameters = {
        model: 'openai/gpt-4',
        prompt: 'Valid prompt',
        openrouterApiKey: 'valid-key',
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 30000,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: -0.1,
        stream: false
      };
      const validLlm = new LLM(validParams);
      
      const result = validLlm.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accumulate multiple validation errors', () => {
      const invalidParams = {
        // Missing model, prompt, and API key
        temperature: 5, // Invalid
        maxTokens: -1, // Invalid
        topP: 2, // Invalid
        frequencyPenalty: 3, // Invalid
        presencePenalty: -3, // Invalid
        timeout: 100 // Invalid
      } as LlmNodeParameters;
      
      const invalidLlm = new LLM(invalidParams);
      
      const result = invalidLlm.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(9); // All validation errors
    });
  });

  describe('clone', () => {
    beforeEach(() => {
      const fullParams: LlmNodeParameters = {
        model: 'anthropic/claude-3-sonnet',
        prompt: 'Original prompt',
        openrouterApiKey: 'original-key',
        temperature: 0.8,
        maxTokens: 1500,
        timeout: 40000,
        stream: true,
        topP: 0.95,
        frequencyPenalty: 0.2,
        presencePenalty: -0.1
      };
      llm = new LLM(fullParams);
    });

    it('should create a new LLM instance', () => {
      const cloned = llm.clone();
      
      expect(cloned).toBeInstanceOf(LLM);
      expect(cloned).not.toBe(llm);
    });

    it('should copy all parameters', () => {
      const cloned = llm.clone();
      
      expect(cloned.getModel()).toBe(llm.getModel());
      expect(cloned.getPrompt()).toBe(llm.getPrompt());
      expect(cloned.getTimeout()).toBe(llm.getTimeout());
      expect(cloned.getParameters()).toEqual(llm.getParameters());
    });

    it('should create independent copies', () => {
      const cloned = llm.clone();
      
      // Modify clone's internal state doesn't affect original
      const clonedParams = cloned.getParameters();
      const originalParams = llm.getParameters();
      
      expect(clonedParams).toEqual(originalParams);
      expect(clonedParams).not.toBe(originalParams);
    });

    it('should handle minimal parameters', () => {
      const minimalLlm = new LLM(basicParams);
      const cloned = minimalLlm.clone();
      
      expect(cloned.getModel()).toBe('openai/gpt-4');
      expect(cloned.getPrompt()).toBe('Hello, how can I help you?');
      expect(cloned.getTimeout()).toBeUndefined();
    });
  });

  describe('updateParameters', () => {
    beforeEach(() => {
      const baseParams: LlmNodeParameters = {
        model: 'openai/gpt-3.5-turbo',
        prompt: 'Original prompt',
        openrouterApiKey: 'original-key',
        temperature: 0.7
      };
      llm = new LLM(baseParams);
    });

    it('should create new LLM with updated parameters', () => {
      const updates: Partial<LlmNodeParameters> = {
        model: 'openai/gpt-4',
        temperature: 0.9
      };
      
      const updated = llm.updateParameters(updates);
      
      expect(updated).toBeInstanceOf(LLM);
      expect(updated).not.toBe(llm);
      expect(updated.getModel()).toBe('openai/gpt-4');
      expect(updated.getParameters().temperature).toBe(0.9);
    });

    it('should preserve existing parameters when not updated', () => {
      const updates: Partial<LlmNodeParameters> = {
        maxTokens: 2000
      };
      
      const updated = llm.updateParameters(updates);
      
      expect(updated.getModel()).toBe(llm.getModel());
      expect(updated.getPrompt()).toBe(llm.getPrompt());
      expect(updated.getParameters().temperature).toBe(0.7);
      expect(updated.getParameters().maxTokens).toBe(2000);
    });

    it('should handle updating all parameters', () => {
      const updates: Partial<LlmNodeParameters> = {
        model: 'anthropic/claude-3-opus',
        prompt: 'Updated prompt',
        openrouterApiKey: 'updated-key',
        temperature: 0.5,
        maxTokens: 1000,
        timeout: 25000,
        stream: true,
        topP: 0.8,
        frequencyPenalty: 0.3,
        presencePenalty: -0.2
      };
      
      const updated = llm.updateParameters(updates);
      
      expect(updated.getModel()).toBe('anthropic/claude-3-opus');
      expect(updated.getPrompt()).toBe('Updated prompt');
      expect(updated.getTimeout()).toBe(25000);
      
      const params = updated.getParameters();
      expect(params.openrouterApiKey).toBe('updated-key');
      expect(params.temperature).toBe(0.5);
      expect(params.maxTokens).toBe(1000);
      expect(params.stream).toBe(true);
      expect(params.topP).toBe(0.8);
      expect(params.frequencyPenalty).toBe(0.3);
      expect(params.presencePenalty).toBe(-0.2);
    });

    it('should not mutate original LLM', () => {
      const originalModel = llm.getModel();
      const originalPrompt = llm.getPrompt();
      
      llm.updateParameters({
        model: 'modified-model',
        prompt: 'modified-prompt'
      });
      
      expect(llm.getModel()).toBe(originalModel);
      expect(llm.getPrompt()).toBe(originalPrompt);
    });

    it('should handle empty updates', () => {
      const updated = llm.updateParameters({});
      
      expect(updated.getModel()).toBe(llm.getModel());
      expect(updated.getPrompt()).toBe(llm.getPrompt());
      expect(updated.getParameters()).toEqual(llm.getParameters());
    });

    it('should handle partial updates', () => {
      const updates: Partial<LlmNodeParameters> = {
        temperature: 1.0
      };
      
      const updated = llm.updateParameters(updates);
      
      expect(updated.getModel()).toBe('openai/gpt-3.5-turbo');
      expect(updated.getPrompt()).toBe('Original prompt');
      expect(updated.getParameters().temperature).toBe(1.0);
      expect(updated.getParameters().openrouterApiKey).toBe('original-key');
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in prompt', () => {
      const specialParams: LlmNodeParameters = {
        model: 'openai/gpt-4',
        prompt: 'Special chars: @#$%^&*()[]{}|\\;:\'",.<>?/~`',
        openrouterApiKey: 'test-key'
      };
      
      const specialLlm = new LLM(specialParams);
      expect(specialLlm.getPrompt()).toBe('Special chars: @#$%^&*()[]{}|\\;:\'",.<>?/~`');
      
      const validation = specialLlm.validate();
      expect(validation.valid).toBe(true);
    });

    it('should handle very long prompts', () => {
      const longPrompt = 'A'.repeat(10000);
      const longParams: LlmNodeParameters = {
        model: 'openai/gpt-4',
        prompt: longPrompt,
        openrouterApiKey: 'test-key'
      };
      
      const longLlm = new LLM(longParams);
      expect(longLlm.getPrompt()).toBe(longPrompt);
    });

    it('should handle different model formats', () => {
      const modelFormats = [
        'openai/gpt-4',
        'anthropic/claude-3-sonnet',
        'google/gemini-pro',
        'meta-llama/llama-2-70b-chat',
        'mistral/mistral-7b-instruct'
      ];
      
      modelFormats.forEach(model => {
        const params: LlmNodeParameters = {
          model,
          prompt: 'Test prompt',
          openrouterApiKey: 'test-key'
        };
        
        const modelLlm = new LLM(params);
        expect(modelLlm.getModel()).toBe(model);
        expect(modelLlm.validate().valid).toBe(true);
      });
    });

    it('should handle extreme valid parameter values', () => {
      const extremeParams: LlmNodeParameters = {
        model: 'openai/gpt-4',
        prompt: 'Test',
        openrouterApiKey: 'key',
        temperature: 0, // Minimum
        maxTokens: 1, // Minimum
        timeout: 1000, // Minimum
        topP: 0, // Minimum
        frequencyPenalty: -2, // Minimum
        presencePenalty: 2, // Maximum
        stream: false
      };
      
      const extremeLlm = new LLM(extremeParams);
      const validation = extremeLlm.validate();
      
      expect(validation.valid).toBe(true);
    });

    it('should handle Unicode characters in prompt', () => {
      const unicodeParams: LlmNodeParameters = {
        model: 'openai/gpt-4',
        prompt: 'Unicode test: 你好世界 🌍 emoji test ñáéíóú',
        openrouterApiKey: 'test-key'
      };
      
      const unicodeLlm = new LLM(unicodeParams);
      expect(unicodeLlm.getPrompt()).toBe('Unicode test: 你好世界 🌍 emoji test ñáéíóú');
    });

    it('should handle empty response body in extraction', async () => {
      mockHttpRequest.execute.mockResolvedValue({
        status: 'completed',
        data: {
          body: null
        }
      });

      const result = await llm.execute();
      expect(result.data?.llmResponse).toBe('');
    });

    it('should handle parsing errors in response extraction gracefully', async () => {
      // Create a circular reference that will cause JSON.stringify to fail
      const circularObj: any = { data: 'test' };
      circularObj.self = circularObj;

      mockHttpRequest.execute.mockResolvedValue({
        status: 'completed',
        data: {
          body: circularObj
        }
      });

      const result = await llm.execute();
      expect(result.data?.llmResponse).toBe('');
    });
  });
});