/**
 * LLM Class
 *
 * Executable LLM (Large Language Model) that handles AI model interactions via OpenRouter.
 * Uses HttpRequest under the hood for HTTP communication, similar to how Agent uses Workflow.
 * Follows the same pattern as Workflow and Agent classes for consistency.
 * Supports streaming through the injection-based architecture.
 */

import { HttpRequest } from '@/HttpRequest';
import { Execution, HttpRequestParams, LlmParams } from '@/types';
import { autopilot } from './Autopilot';

export interface StreamingCallbacks {
  onChunk?: (content: string, accumulated: string) => Promise<void>;
  onComplete?: (finalContent: string) => Promise<void>;
}

export class LLM {
  private params: LlmParams;

  constructor(params: LlmParams) {
    // Store LLM parameters with deep copy to avoid mutations
    this.params = {
      ...params,
    };
  }

  /**
   * Get LLM model
   */
  getModel(): string {
    return this.params.model;
  }

  /**
   * Get LLM prompt
   */
  getPrompt(): string {
    return this.params.prompt;
  }

  /**
   * Get LLM parameters (read-only copy)
   */
  getParameters(): LlmParams {
    return JSON.parse(JSON.stringify(this.params));
  }

  /**
   * Get LLM timeout
   */
  getTimeout(): number | undefined {
    return this.params.timeout;
  }

  /**
   * Execute the LLM request with streaming support
   */
  async execute(
    execution?: Execution,
    streamingCallbacks?: StreamingCallbacks
  ): Promise<{ status: 'completed' | 'failed'; data?: unknown; error?: Error }> {
    try {
      console.log(`Executing LLM: ${this.params.model}${this.params.stream ? ' (streaming)' : ''}`);

      // Check if streaming is enabled - rely on execution context for streaming decisions
      const isStreamingEnabled = this.params.stream;

      if (isStreamingEnabled) {
        return await this.executeWithStreaming(execution, streamingCallbacks);
      } else {
        return await this.executeWithoutStreaming(execution);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        status: 'failed',
        error: new Error(`LLM execution failed: ${errorMessage}`),
      };
    }
  }

  /**
   * Execute LLM with streaming support
   */
  private async executeWithStreaming(
    execution?: Execution,
    streamingCallbacks?: StreamingCallbacks
  ): Promise<{ status: 'completed' | 'failed'; data?: unknown; error?: Error }> {
    const httpParams = this.buildHttpRequestParams(execution);

    // Ensure streaming is enabled in request body
    if (httpParams.body && typeof httpParams.body === 'object') {
      (httpParams.body as Record<string, unknown>).stream = true;
    }

    let fullResponse = '';
    let usage: unknown = null;

    try {
      // Use fetch for streaming instead of HttpRequest
      const response = await fetch(httpParams.url, {
        method: httpParams.method,
        headers: httpParams.headers as Record<string, string>,
        body: JSON.stringify(httpParams.body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = ''; // Buffer to accumulate partial data

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines from the buffer
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6).trim();

            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';

              if (content) {
                fullResponse += content;

                // Emit streaming chunk via callbacks if available
                if (streamingCallbacks?.onChunk) {
                  await streamingCallbacks.onChunk(content, fullResponse);
                }
              }

              // Capture usage information if available
              if (parsed.usage) {
                usage = parsed.usage;
              }
            } catch (parseError) {
              console.error('Failed to parse streaming chunk:', parseError, 'Data:', data);
            }
          }
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim()) {
        const trimmedLine = buffer.trim();
        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6).trim();
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';

              if (content) {
                fullResponse += content;

                // Emit streaming chunk via callbacks if available
                if (streamingCallbacks?.onChunk) {
                  await streamingCallbacks.onChunk(content, fullResponse);
                }
              }

              // Capture usage information if available
              if (parsed.usage) {
                usage = parsed.usage;
              }
            } catch (parseError) {
              console.error('Failed to parse final streaming chunk:', parseError, 'Data:', data);
            }
          }
        }
      }

      // Emit completion callback if available
      if (streamingCallbacks?.onComplete) {
        await streamingCallbacks.onComplete(fullResponse);
      }

      return {
        status: 'completed',
        data: {
          llmResponse: fullResponse,
          model: this.params.model,
          usage,
          streaming: true,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      throw new Error(`LLM streaming execution failed: ${errorMessage}`);
    }
  }

  /**
   * Execute LLM without streaming (original logic)
   */
  private async executeWithoutStreaming(execution?: Execution): Promise<{ status: 'completed' | 'failed'; data?: unknown; error?: Error }> {
    // Create HttpRequest instance with current execution context (for memory integration)
    const httpRequest = new HttpRequest(this.buildHttpRequestParams(execution));

    // Delegate to HttpRequest for execution
    const httpResult = await httpRequest.execute();

    // Check if HTTP request execution was successful
    if (httpResult.status === 'completed' && httpResult.data) {
      const llmResponse = this.extractLlmResponse(httpResult.data.body);

      return {
        status: 'completed',
        data: {
          ...httpResult.data,
          llmResponse,
          model: this.params.model,
        },
      };
    } else {
      // HTTP request execution failed
      const errorMessage = httpResult.error?.message || 'LLM request failed';
      return {
        status: 'failed',
        error: new Error(`LLM request failed: ${errorMessage}`),
      };
    }
  }

  /**
   * Build HttpRequest parameters for OpenRouter API
   */
  private buildHttpRequestParams(execution?: Execution): HttpRequestParams {
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';

    // Get API key from Autopilot singleton, fallback to parameters for backward compatibility
    const apiKey = autopilot.getOpenRouterApiKey();

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [];

    console.log({ execution }, 'HISTORICAL MESSAGES not getting appended');

    // Add current prompt as user message
    messages.push({
      role: 'user',
      content: this.params.prompt,
    });

    // Build request body
    const body = {
      model: this.params.model,
      messages,
      temperature: this.params.temperature || 0.7,
      max_tokens: this.params.maxTokens || 1024,
      top_p: this.params.topP || 1.0,
      frequency_penalty: this.params.frequencyPenalty || 0,
      presence_penalty: this.params.presencePenalty || 0,
      stream: this.params.stream || false,
      // OpenRouter specific optional parameters
      transforms: [], // Can be used for prompt transforms
      route: 'fallback', // Can be 'fallback' or specific routing
    };

    return {
      url: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      timeout: this.params.timeout || 60000,
      retries: 1,
      followRedirects: true,
    };
  }

  /**
   * Extract LLM response from OpenRouter response body
   */
  private extractLlmResponse(responseBody: unknown): string {
    try {
      // OpenRouter uses OpenAI-compatible format
      if (typeof responseBody === 'object' && responseBody !== null) {
        const body = responseBody as Record<string, unknown>;
        const choices = body.choices as Array<{ message?: { content?: string } }> | undefined;
        const openAIContent = choices?.[0]?.message?.content;
        if (openAIContent && typeof openAIContent === 'string') return openAIContent;

        // Fallback: try to extract any text content
        if (body.content && typeof body.content === 'string') return body.content;
        if (body.text && typeof body.text === 'string') return body.text;
      }

      // Fallback: try to extract any text content
      if (typeof responseBody === 'string') return responseBody;
      return JSON.stringify(responseBody);
    } catch {
      // If parsing fails completely, return empty string
      return '';
    }
  }

  /**
   * Validate LLM configuration (delegates to HttpRequest validation)
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check LLM-specific required fields
    if (!this.params.model) {
      errors.push('Model is required');
    }

    if (!this.params.prompt) {
      errors.push('Prompt is required');
    }

    // Check if API key is available from Autopilot singleton
    const hasApiKey = !!autopilot.getOpenRouterApiKey();

    if (!hasApiKey) {
      errors.push('OpenRouter API key is required. Configure it via autopilot.setCredentials().');
    }

    // LLM-specific parameter range validation
    if (this.params.temperature !== undefined && (this.params.temperature < 0 || this.params.temperature > 2)) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (this.params.maxTokens !== undefined && this.params.maxTokens < 1) {
      errors.push('Max tokens must be greater than 0');
    }

    if (this.params.topP !== undefined && (this.params.topP < 0 || this.params.topP > 1)) {
      errors.push('Top P must be between 0 and 1');
    }

    if (this.params.frequencyPenalty !== undefined && (this.params.frequencyPenalty < -2 || this.params.frequencyPenalty > 2)) {
      errors.push('Frequency penalty must be between -2 and 2');
    }

    if (this.params.presencePenalty !== undefined && (this.params.presencePenalty < -2 || this.params.presencePenalty > 2)) {
      errors.push('Presence penalty must be between -2 and 2');
    }

    // Timeout validation
    if (this.params.timeout !== undefined && this.params.timeout < 1000) {
      errors.push('Timeout should be at least 1000ms');
    }

    // Only validate HTTP params if basic validation passes and we have an API key
    if (errors.length === 0 && hasApiKey) {
      try {
        const httpRequest = new HttpRequest(this.buildHttpRequestParams());
        const httpValidation = httpRequest.validate();
        if (!httpValidation.valid) {
          errors.push(...httpValidation.errors);
        }
      } catch (error) {
        // If buildHttpRequestParams fails (e.g., missing API key), we already caught that above
        const errorMessage = error instanceof Error ? error.message : 'HTTP request validation failed';
        errors.push(errorMessage);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clone LLM with the same parameters
   */
  clone(): LLM {
    const clonedParams: LlmParams = {
      ...this.params,
    };

    return new LLM(clonedParams);
  }

  /**
   * Update LLM parameters
   */
  updateParameters(updates: Partial<LlmParams>): LLM {
    const updatedParams = {
      ...this.params,
      ...updates,
    };

    return new LLM(updatedParams);
  }
}
