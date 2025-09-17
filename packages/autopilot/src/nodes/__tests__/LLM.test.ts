/**
 * LLM Node Handler Tests
 *
 * Tests for Large Language Model interactions via OpenRouter API
 */

import { LLM } from '../LLM';
import { autopilot } from '@/Autopilot';
import type { LlmParams } from '@/types/node-parameters';
import type { LLMResponse } from '@/types/llm';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console to reduce test noise
const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

describe('LLM Node Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    autopilot.reset();

    // Set up valid API key for tests
    autopilot.setCredentials({
      openrouterApiKey: 'test-api-key-123',
    });
  });

  afterEach(() => {
    consoleSpy.mockClear();
  });

  describe('Basic LLM Functionality', () => {
    it('should execute simple LLM request successfully', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello!' },
        ],
      };

      // Mock successful streaming response
      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"id":"test-123","model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n'
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":" there!"}}]}\n\n'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n'
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n\n'),
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined,
          }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const eventCallback = jest.fn();
      const llm = new LLM(params, { eventCallback });

      const responseItems = await llm.execute();

      expect(responseItems).toBeDefined();
      expect(responseItems).toHaveLength(1);

      const response = responseItems[0].json as LLMResponse;
      expect(response.id).toBe('test-123');
      expect(response.model).toBe('anthropic/claude-3.5-sonnet');
      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.content).toBe('Hello there!');
      expect(response.choices[0].message.role).toBe('assistant');
      expect(response.usage?.total_tokens).toBe(15);

      // Verify API call was made correctly
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key-123',
          },
          body: JSON.stringify({
            model: 'anthropic/claude-3.5-sonnet',
            messages: params.messages,
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1.0,
            frequency_penalty: 0,
            presence_penalty: 0,
            stream: true,
          }),
        })
      );

      // Check streaming events were emitted
      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'content_chunk',
          data: expect.objectContaining({
            chunk: expect.any(Object),
          }),
        })
      );

      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'content_complete',
        })
      );
    });

    it('should handle custom LLM parameters', async () => {
      const params: LlmParams = {
        model: 'openai/gpt-4-turbo',
        messages: [{ role: 'user', content: 'Test message' }],
        temperature: 0.9,
        maxTokens: 2000,
        topP: 0.8,
        frequencyPenalty: 0.5,
        presencePenalty: -0.2,
      };

      // Mock simple response
      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Test response"}}]}\n\n'),
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined,
          }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const llm = new LLM(params);
      await llm.execute();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'openai/gpt-4-turbo',
            messages: params.messages,
            temperature: 0.9,
            max_tokens: 2000,
            top_p: 0.8,
            frequency_penalty: 0.5,
            presence_penalty: -0.2,
            stream: true,
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw error when API key is missing', async () => {
      autopilot.reset(); // Clear API key

      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const llm = new LLM(params);

      await expect(llm.execute()).rejects.toThrow('OpenRouter API key is required. Configure it via autopilot.setCredentials().');
    });

    it('should handle HTTP errors', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const llm = new LLM(params);

      await expect(llm.execute()).rejects.toThrow('HTTP 401: Unauthorized');
    });

    it('should handle streaming errors', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const mockReader = {
        read: jest.fn().mockRejectedValue(new Error('Stream error')),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const llm = new LLM(params);

      await expect(llm.execute()).rejects.toThrow('LLM streaming execution failed: Stream error');
    });

    it('should handle malformed JSON in stream', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: invalid json\n\n'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Recovery"}}]}\n\n'),
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined,
          }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const llm = new LLM(params);
      const response = await llm.execute();

      // Should recover and process valid chunks
      const responseData = response[0].json as LLMResponse;
      expect(responseData.choices[0].message.content).toBe('Recovery');
    });
  });

  describe('Validation', () => {
    it('should validate required parameters', () => {
      const invalidParams = {} as LlmParams;
      const llm = new LLM(invalidParams);

      const validation = llm.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Model is required',
        })
      );
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_PARAMETERS',
          message: 'Messages must be an array',
        })
      );
    });

    it('should validate parameter ranges', () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
        temperature: 3.0, // Invalid: > 2
        maxTokens: 0, // Invalid: < 1
        topP: 1.5, // Invalid: > 1
        frequencyPenalty: 3.0, // Invalid: > 2
        presencePenalty: -3.0, // Invalid: < -2
        timeout: 500, // Invalid: < 1000
      };

      const llm = new LLM(params);
      const validation = llm.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(6);
    });

    it('should validate API key availability', () => {
      autopilot.reset(); // Clear API key

      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const llm = new LLM(params);
      const validation = llm.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'OpenRouter API key is required. Configure it via autopilot.setCredentials().',
        })
      );
    });

    it('should pass validation with valid parameters', () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.2,
        timeout: 30000,
      };

      const llm = new LLM(params);
      const validation = llm.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe('Streaming Response Processing', () => {
    it('should handle multiple choices in streaming', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"index":0,"delta":{"content":"Choice 1"}},{"index":1,"delta":{"content":"Choice 2"}}]}\n\n'
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"index":0,"finish_reason":"stop"},{"index":1,"finish_reason":"stop"}]}\n\n'
            ),
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined,
          }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const llm = new LLM(params);
      const response = await llm.execute();

      const responseData = response[0].json as LLMResponse;
      expect(responseData.choices).toHaveLength(2);
      expect(responseData.choices[0].message.content).toBe('Choice 1');
      expect(responseData.choices[1].message.content).toBe('Choice 2');
    });

    it('should handle non-streaming response fallback', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      // Mock response without body.getReader (non-streaming)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
        json: async () => ({
          id: 'test-non-stream',
          object: 'chat.completion',
          created: Date.now(),
          model: 'anthropic/claude-3.5-sonnet',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Non-streaming response' },
              finish_reason: 'stop',
            },
          ],
        }),
      });

      const llm = new LLM(params);
      const response = await llm.execute();

      const responseData = response[0].json as LLMResponse;
      expect(responseData.id).toBe('test-non-stream');
      expect(responseData.choices[0].message.content).toBe('Non-streaming response');
    });
  });
});
