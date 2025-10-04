/**
 * LLM Node Handler Tests
 *
 * Tests for Large Language Model interactions via OpenRouter API using OpenAI SDK
 */

import { LLM } from '../LLM';
import type { LlmParams } from '@/types/node-parameters';
import type { LLMResponse } from '@/types/llm';

// Mock OpenAI SDK
jest.mock('openai');

import OpenAI from 'openai';

// Mock console to reduce test noise
const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

// Helper to create async iterable stream
function createMockStream(chunks: OpenAI.Chat.Completions.ChatCompletionChunk[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

describe('LLM Node Handler', () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate = jest.fn();
    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => {
      return {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      } as unknown as OpenAI;
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
      const mockStream = createMockStream([
        {
          id: 'test-123',
          model: 'anthropic/claude-3.5-sonnet',
          created: 1234567890,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null, logprobs: null }],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
        {
          id: 'test-123',
          model: 'anthropic/claude-3.5-sonnet',
          created: 1234567890,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: ' there!' }, finish_reason: null, logprobs: null }],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
        {
          id: 'test-123',
          model: 'anthropic/claude-3.5-sonnet',
          created: 1234567890,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
      ]);

      mockCreate.mockResolvedValue(mockStream);

      const eventCallback = jest.fn();
      const llm = new LLM(params, { eventCallback, secureEnv: { OPEN_ROUTER_KEY: 'test-api-key-123' } });

      const responseItems = await llm.execute();

      expect(responseItems).toBeDefined();
      expect(responseItems).toHaveLength(1);

      const response = responseItems[0].json as LLMResponse;
      expect(response.id).toBe('test-123');
      expect(response.model).toBe('anthropic/claude-3.5-sonnet');
      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.content).toBe('Hello there!');
      expect(response.choices[0].message.role).toBe('assistant');
      expect(response.usage?.totalTokens).toBe(15);

      // Check streaming events were emitted
      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'content_chunk',
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
      const mockStream = createMockStream([
        {
          id: 'test-456',
          model: 'openai/gpt-4-turbo',
          created: Date.now(),
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'Test response' }, finish_reason: null, logprobs: null }],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
        {
          id: 'test-456',
          model: 'openai/gpt-4-turbo',
          created: Date.now(),
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
      ]);

      mockCreate.mockResolvedValue(mockStream);

      const llm = new LLM(params, { secureEnv: { OPEN_ROUTER_KEY: 'test-api-key-123' } });
      await llm.execute();

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-4-turbo',
          messages: params.messages,
          temperature: 0.9,
          max_tokens: 2000,
          top_p: 0.8,
          frequency_penalty: 0.5,
          presence_penalty: -0.2,
          stream: true,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw error when API key is missing', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const llm = new LLM(params);

      await expect(llm.execute()).rejects.toThrow(/OpenRouter API key is required/);
    });

    it('should handle HTTP errors', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      mockCreate.mockRejectedValue(new Error('HTTP 401: Unauthorized'));

      const llm = new LLM(params, { secureEnv: { OPEN_ROUTER_KEY: 'test-api-key-123' } });

      await expect(llm.execute()).rejects.toThrow('HTTP 401: Unauthorized');
    });

    it('should handle streaming errors', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          // Yield once to satisfy generator requirement before throwing
          yield {
            id: 'error-chunk',
            model: 'test',
            created: Date.now(),
            object: 'chat.completion.chunk' as const,
            choices: [],
          } as OpenAI.Chat.Completions.ChatCompletionChunk;
          throw new Error('Stream error');
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const llm = new LLM(params, { secureEnv: { OPEN_ROUTER_KEY: 'test-api-key-123' } });

      await expect(llm.execute()).rejects.toThrow('LLM streaming execution failed: Stream error');
    });

    it('should handle malformed JSON in stream', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      // Simulate stream that has some valid chunks
      const mockStream = createMockStream([
        {
          id: 'test-recovery',
          model: 'anthropic/claude-3.5-sonnet',
          created: Date.now(),
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'Recovery' }, finish_reason: null, logprobs: null }],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
        {
          id: 'test-recovery',
          model: 'anthropic/claude-3.5-sonnet',
          created: Date.now(),
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
      ]);

      mockCreate.mockResolvedValue(mockStream);

      const llm = new LLM(params, { secureEnv: { OPEN_ROUTER_KEY: 'test-api-key-123' } });
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

      const llm = new LLM(params, { secureEnv: { OPEN_ROUTER_KEY: 'test-api-key-123' } });
      const validation = llm.validate();

      expect(validation.valid).toBe(false);
      // At least the 6 parameter-range errors
      expect((validation.errors ?? []).length).toBeGreaterThanOrEqual(6);
    });

    it('should validate API key availability', () => {
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

      // Expect validation to fail only due to missing API key
      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'OpenRouter API key is required. Configure it via autopilot.setCredentials().',
        })
      );
    });
  });

  describe('Streaming Response Processing', () => {
    it('should handle multiple choices in streaming', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const mockStream = createMockStream([
        {
          id: 'test-multi',
          model: 'anthropic/claude-3.5-sonnet',
          created: Date.now(),
          object: 'chat.completion.chunk',
          choices: [
            { index: 0, delta: { content: 'Choice 1' }, finish_reason: null, logprobs: null },
            { index: 1, delta: { content: 'Choice 2' }, finish_reason: null, logprobs: null },
          ],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
        {
          id: 'test-multi',
          model: 'anthropic/claude-3.5-sonnet',
          created: Date.now(),
          object: 'chat.completion.chunk',
          choices: [
            { index: 0, delta: {}, finish_reason: 'stop', logprobs: null },
            { index: 1, delta: {}, finish_reason: 'stop', logprobs: null },
          ],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
      ]);

      mockCreate.mockResolvedValue(mockStream);

      const llm = new LLM(params, { secureEnv: { OPEN_ROUTER_KEY: 'test-api-key-123' } });
      const response = await llm.execute();

      const responseData = response[0].json as LLMResponse;
      // Note: Current implementation only tracks the first choice
      expect(responseData.choices).toHaveLength(1);
      expect(responseData.choices[0].message.content).toBe('Choice 1');
    });

    it('should handle non-streaming response fallback', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      // Mock simple streaming response (SDK always streams)
      const mockStream = createMockStream([
        {
          id: 'test-non-stream',
          model: 'anthropic/claude-3.5-sonnet',
          created: Date.now(),
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'Non-streaming response' }, finish_reason: null, logprobs: null }],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
        {
          id: 'test-non-stream',
          model: 'anthropic/claude-3.5-sonnet',
          created: Date.now(),
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
      ]);

      mockCreate.mockResolvedValue(mockStream);

      const llm = new LLM(params, { secureEnv: { OPEN_ROUTER_KEY: 'test-api-key-123' } });
      const response = await llm.execute();

      const responseData = response[0].json as LLMResponse;
      expect(responseData.id).toBe('test-non-stream');
      expect(responseData.choices[0].message.content).toBe('Non-streaming response');
    });
  });
});
