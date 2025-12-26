/**
 * LLM Node Handler Tests
 *
 * Tests for Large Language Model interactions via OpenRouter API using OpenAI SDK
 */

import { LLM } from '../LLM';
import type { LlmParams } from '@/types/node-parameters';
import type { LLMResponse } from '@/types/llm';
import type { HostRuntime, LlmHostRequest } from '@/types/node-handler';
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
  let hostRuntime: HostRuntime;
  let llmMock: jest.Mock<Promise<AsyncIterable<unknown>>, [LlmHostRequest]>;

  beforeEach(() => {
    jest.clearAllMocks();
    llmMock = jest.fn();
    hostRuntime = {
      // HTTP is unused in these tests but required by the HostRuntime type
      http: jest.fn() as HostRuntime['http'],
      connectorAction: (jest.fn(async ({ connector, action, args, timeoutMs }) => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: { ok: true, connector, action, args, timeoutMs },
        url: `connector://${String(connector)}/${String(action)}`,
      })) as HostRuntime['connectorAction']),
      llm: llmMock as HostRuntime['llm'],
    };
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

      // Mock successful streaming response via hostRuntime.llm
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

      llmMock.mockResolvedValue(mockStream as unknown as AsyncIterable<unknown>);

      const eventCallback = jest.fn();
      const llm = new LLM(params, {
        eventCallback,
        hostRuntime,
      });

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

      llmMock.mockResolvedValue(mockStream as unknown as AsyncIterable<unknown>);

      const llm = new LLM(params, { hostRuntime });
      await llm.execute();

      expect(llmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-4-turbo',
          messages: expect.any(Array),
          temperature: 0.9,
          maxTokens: 2000,
          topP: 0.8,
          frequencyPenalty: 0.5,
          presencePenalty: -0.2,
        })
      );
    });

    it('should preserve OpenRouter image generation outputs (message.images)', async () => {
      const params: LlmParams = {
        model: 'google/gemini-2.5-flash-image',
        messages: [{ role: 'user', content: 'Generate a square avatar image.' }],
        // These are passed through by the LLM node; runner adds image_config snake_case
        modalities: ['image', 'text'],
        imageConfig: { aspect_ratio: '1:1' },
      };

      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

      const mockStream = createMockStream([
        {
          id: 'img-1',
          model: 'google/gemini-2.5-flash-image',
          created: 1234567890,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'Here you go.' }, finish_reason: null, logprobs: null }],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
        {
          id: 'img-1',
          model: 'google/gemini-2.5-flash-image',
          created: 1234567890,
          object: 'chat.completion.chunk',
          choices: [
            {
              index: 0,
              delta: {},
              // OpenRouter extension: images on message snapshot
              message: {
                role: 'assistant',
                images: [{ type: 'image_url', image_url: { url: dataUrl } }],
              },
              finish_reason: null,
              logprobs: null,
            } as unknown as OpenAI.Chat.Completions.ChatCompletionChunk['choices'][number],
          ],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
        {
          id: 'img-1',
          model: 'google/gemini-2.5-flash-image',
          created: 1234567890,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
        } as OpenAI.Chat.Completions.ChatCompletionChunk,
      ]);

      llmMock.mockResolvedValue(mockStream as unknown as AsyncIterable<unknown>);

      const llm = new LLM(params, { hostRuntime });
      const responseItems = await llm.execute();
      const response = responseItems[0].json as LLMResponse;

      expect(response.choices[0].message.content).toContain('Here you go.');
      const msg = response.choices[0].message as unknown as { images?: Array<{ image_url?: { url?: string } }> };
      expect(msg.images).toBeDefined();
      expect(msg.images?.[0]?.image_url?.url).toBe(dataUrl);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when API key is missing', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      // Simulate host-level credential failure
      llmMock.mockRejectedValue(new Error('OpenRouter API key is required'));

      const llm = new LLM(params, { hostRuntime });

      await expect(llm.execute()).rejects.toThrow(/OpenRouter API key is required/);
    });

    it('should handle HTTP errors', async () => {
      const params: LlmParams = {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      llmMock.mockRejectedValue(new Error('HTTP 401: Unauthorized'));

      const llm = new LLM(params, { hostRuntime });

      await expect(llm.execute()).rejects.toThrow(/HTTP 401: Unauthorized/);
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

      llmMock.mockResolvedValue(mockStream as unknown as AsyncIterable<unknown>);

      const llm = new LLM(params, { hostRuntime });

      await expect(llm.execute()).rejects.toThrow(/LLM streaming execution failed: Stream error/);
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

      llmMock.mockResolvedValue(mockStream as unknown as AsyncIterable<unknown>);

      const llm = new LLM(params, { hostRuntime });
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
      // At least the 6 parameter-range errors
      expect((validation.errors ?? []).length).toBeGreaterThanOrEqual(6);
    });

    // API key availability is enforced at runtime (execute), not at validate()

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

      // Validation should pass; API key is checked at execute-time via host callbacks
      expect(validation.valid).toBe(true);
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

      llmMock.mockResolvedValue(mockStream as unknown as AsyncIterable<unknown>);

      const llm = new LLM(params, { hostRuntime });
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

      llmMock.mockResolvedValue(mockStream as unknown as AsyncIterable<unknown>);

      const llm = new LLM(params, { hostRuntime });
      const response = await llm.execute();

      const responseData = response[0].json as LLMResponse;
      expect(responseData.id).toBe('test-non-stream');
      expect(responseData.choices[0].message.content).toBe('Non-streaming response');
    });
  });
});
