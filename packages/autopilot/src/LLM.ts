/**
 * LLM Class
 *
 * Executable LLM (Large Language Model) that handles AI model interactions via OpenRouter.
 * Simplified implementation focusing on core LLM functionality without unnecessary bloat.
 */

import { LlmParams } from './types/node-parameters';
import { ValidationResult, ValidationError } from './types/validation';
import { LlmMessage, MessageRole } from './Memory';
import { autopilot } from './Autopilot';
import { NodeHandler } from './engine/NodeHandler';
import { EventCallback } from './types/emitters';

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    message: LlmMessage;
    finish_reason: string | null;
    index: number;
  }[];
  usage?: LLMUsage;
}

interface StreamChoice {
  content: string;
  finishReason: string | null;
}

interface StreamChunk {
  id?: string;
  model?: string;
  created?: number;
  object?: string;
  choices?: {
    index?: number;
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }[];
  usage?: LLMUsage;
}

export class LLM implements NodeHandler {
  private params: LlmParams;
  private eventCallback?: EventCallback;

  constructor(params: LlmParams, eventCallback?: EventCallback) {
    this.params = params;
    this.eventCallback = eventCallback;
  }

  /**
   * Execute the LLM request with streaming
   */
  async execute(): Promise<LLMResponse> {
    console.log(`Executing LLM: ${this.params.model}`);

    const apiKey = autopilot.getOpenRouterApiKey();
    if (!apiKey) {
      throw new Error('OpenRouter API key is required. Configure it via autopilot.setCredentials().');
    }

    const requestBody = {
      model: this.params.model,
      messages: this.params.messages,
      temperature: this.params.temperature || 0.7,
      max_tokens: this.params.maxTokens || 1024,
      top_p: this.params.topP || 1.0,
      frequency_penalty: this.params.frequencyPenalty || 0,
      presence_penalty: this.params.presencePenalty || 0,
      stream: true,
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const result = (await response.json()) as LLMResponse;
      return result;
    }

    return await this.processStreamingResponse(reader);
  }

  /**
   * Process streaming response from OpenRouter
   */
  private async processStreamingResponse(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<LLMResponse> {
    const decoder = new TextDecoder();
    let buffer = '';
    let responseMetadata = {
      id: '',
      model: '',
      created: Math.floor(Date.now() / 1000),
      object: 'chat.completion',
    };
    let usage: LLMUsage | undefined;
    const choices: StreamChoice[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            this.processStreamChunk(parsed, responseMetadata, choices);

            if (parsed.usage) {
              usage = parsed.usage;
            }

            if (this.eventCallback) {
              await this.eventCallback({
                type: 'content_chunk',
                timestamp: new Date().toISOString(),
                data: { chunk: parsed },
              });
            }
          } catch (error) {
            console.error('Failed to parse streaming chunk:', error, 'Data:', data);
          }
        }
      }

      if (this.eventCallback) {
        await this.eventCallback({ type: 'content_complete', timestamp: new Date().toISOString() });
      }

      return this.buildFinalResponse(responseMetadata, choices, usage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      throw new Error(`LLM streaming execution failed: ${errorMessage}`);
    }
  }

  /**
   * Process a single streaming chunk
   */
  private processStreamChunk(
    parsed: StreamChunk,
    metadata: { id: string; model: string; created: number; object: string },
    choices: StreamChoice[]
  ): void {
    // Update metadata from first chunk
    if (parsed.id && !metadata.id) metadata.id = parsed.id;
    if (parsed.model && !metadata.model) metadata.model = parsed.model;
    if (parsed.created) metadata.created = parsed.created;
    if (parsed.object) metadata.object = parsed.object;

    // Process choices
    if (parsed.choices && Array.isArray(parsed.choices)) {
      for (const choice of parsed.choices) {
        const index = choice.index ?? 0;
        const content = choice.delta?.content || '';
        const finishReason = choice.finish_reason || null;

        // Ensure choice exists
        while (choices.length <= index) {
          choices.push({ content: '', finishReason: null });
        }

        if (content) {
          choices[index].content += content;
        }
        if (finishReason) {
          choices[index].finishReason = finishReason;
        }
      }
    }
  }

  /**
   * Build final response from accumulated streaming data
   */
  private buildFinalResponse(
    metadata: { id: string; model: string; created: number; object: string },
    streamChoices: StreamChoice[],
    usage?: LLMUsage
  ): LLMResponse {
    const choices = streamChoices.length > 0 ? streamChoices : [{ content: '', finishReason: 'stop' }];

    return {
      id: metadata.id,
      object: metadata.object,
      created: metadata.created,
      model: metadata.model,
      choices: choices.map((choice, index) => ({
        index,
        message: {
          role: 'assistant' as MessageRole,
          content: choice.content,
        },
        finish_reason: choice.finishReason || 'stop',
      })),
      usage,
    };
  }

  /**
   * Validate LLM configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // Required fields
    if (!this.params.model) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Model is required',
      });
    }

    if (!this.params.messages || !Array.isArray(this.params.messages) || this.params.messages.length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Messages array is required and must not be empty',
      });
    }

    // API key validation
    if (!autopilot.getOpenRouterApiKey()) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'OpenRouter API key is required. Configure it via autopilot.setCredentials().',
      });
    }

    // Parameter range validation
    if (this.params.temperature !== undefined && (this.params.temperature < 0 || this.params.temperature > 2)) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Temperature must be between 0 and 2',
      });
    }

    if (this.params.maxTokens !== undefined && this.params.maxTokens < 1) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Max tokens must be greater than 0',
      });
    }

    if (this.params.topP !== undefined && (this.params.topP < 0 || this.params.topP > 1)) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Top P must be between 0 and 1',
      });
    }

    if (this.params.frequencyPenalty !== undefined && (this.params.frequencyPenalty < -2 || this.params.frequencyPenalty > 2)) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Frequency penalty must be between -2 and 2',
      });
    }

    if (this.params.presencePenalty !== undefined && (this.params.presencePenalty < -2 || this.params.presencePenalty > 2)) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Presence penalty must be between -2 and 2',
      });
    }

    if (this.params.timeout !== undefined && this.params.timeout < 1000) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Timeout should be at least 1000ms',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
