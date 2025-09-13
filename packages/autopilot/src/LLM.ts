/**
 * LLM Class
 *
 * Executable LLM (Large Language Model) that handles AI model interactions via OpenRouter.
 * Uses HttpRequest under the hood for HTTP communication, similar to how Agent uses Workflow.
 * Follows the same pattern as Workflow and Agent classes for consistency.
 * Supports streaming through the injection-based architecture.
 */

import { HttpRequest } from '@/HttpRequest';
import { HttpRequestParams, LlmMessage, LlmParams } from '@/types';
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
   * Execute the LLM request with automatic streaming detection
   */
  async execute(config?: {
    messages?: LlmMessage[];
    streamingCallbacks?: StreamingCallbacks;
  }): Promise<{ status: 'completed' | 'failed'; data?: unknown; error?: Error }> {
    try {
      console.log(`Executing LLM: ${this.params.model} (auto-streaming)`);

      const httpParams = this.buildHttpRequestParams(config?.messages || []);

      // Always request streaming from OpenRouter
      if (httpParams.body) {
        let body: Record<string, unknown>;
        if (typeof httpParams.body === 'string') {
          body = JSON.parse(httpParams.body);
        } else if (this.isPlainObject(httpParams.body)) {
          body = httpParams.body as unknown as Record<string, unknown>;
        } else {
          body = {};
        }
        body.stream = true;
        httpParams.body = JSON.stringify(body);
      }

      // Make the HTTP request
      const response = await fetch(httpParams.url, {
        method: httpParams.method,
        headers: httpParams.headers as Record<string, string>,
        body: httpParams.body,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Auto-detect streaming capability
      const reader = response.body?.getReader();
      if (reader) {
        // Streaming is available - process as stream
        return await this.processStreamingResponse(reader, config?.streamingCallbacks);
      } else {
        // Fallback to non-streaming
        return await this.processNonStreamingResponse(response);
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
   * Process streaming response from OpenRouter
   */
  private async processStreamingResponse(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    streamingCallbacks?: StreamingCallbacks
  ): Promise<{ status: 'completed' | 'failed'; data?: unknown; error?: Error }> {
    let usage: unknown = null;
    let model = '';
    let id = '';
    let object = 'chat.completion';
    let created = Math.floor(Date.now() / 1000);

    // Track multiple choices - Map<choiceIndex, {content: string, finishReason: string | null}>
    const choicesMap = new Map<number, { content: string; finishReason: string | null }>();
    let primaryChoiceContent = ''; // For backward compatibility with callbacks

    try {
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

              // Capture metadata from first chunk
              if (parsed.id && !id) id = parsed.id;
              if (parsed.model && !model) model = parsed.model;
              if (parsed.created && !created) created = parsed.created;
              if (parsed.object) object = parsed.object;

              // Process all choices in this chunk
              if (parsed.choices && Array.isArray(parsed.choices)) {
                for (const choice of parsed.choices) {
                  const choiceIndex = choice.index ?? 0;
                  const content = choice.delta?.content || '';
                  const finishReason = choice.finish_reason || null;

                  // Initialize choice if not exists
                  if (!choicesMap.has(choiceIndex)) {
                    choicesMap.set(choiceIndex, { content: '', finishReason: null });
                  }

                  const choiceData = choicesMap.get(choiceIndex)!;

                  // Append content
                  if (content) {
                    choiceData.content += content;

                    // Update primary choice content for callbacks (use first choice)
                    if (choiceIndex === 0) {
                      primaryChoiceContent = choiceData.content;

                      // Emit streaming chunk via callbacks if available
                      if (streamingCallbacks?.onChunk) {
                        await streamingCallbacks.onChunk(content, primaryChoiceContent);
                      }
                    }
                  }

                  // Update finish reason
                  if (finishReason) {
                    choiceData.finishReason = finishReason;
                  }
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

              // Capture metadata from final chunk
              if (parsed.id && !id) id = parsed.id;
              if (parsed.model && !model) model = parsed.model;
              if (parsed.created && !created) created = parsed.created;

              // Process all choices in final chunk
              if (parsed.choices && Array.isArray(parsed.choices)) {
                for (const choice of parsed.choices) {
                  const choiceIndex = choice.index ?? 0;
                  const content = choice.delta?.content || '';
                  const finishReason = choice.finish_reason || null;

                  // Initialize choice if not exists
                  if (!choicesMap.has(choiceIndex)) {
                    choicesMap.set(choiceIndex, { content: '', finishReason: null });
                  }

                  const choiceData = choicesMap.get(choiceIndex)!;

                  // Append content
                  if (content) {
                    choiceData.content += content;

                    // Update primary choice content for callbacks (use first choice)
                    if (choiceIndex === 0) {
                      primaryChoiceContent = choiceData.content;

                      // Emit streaming chunk via callbacks if available
                      if (streamingCallbacks?.onChunk) {
                        await streamingCallbacks.onChunk(content, primaryChoiceContent);
                      }
                    }
                  }

                  // Update finish reason
                  if (finishReason) {
                    choiceData.finishReason = finishReason;
                  }
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
        await streamingCallbacks.onComplete(primaryChoiceContent);
      }

      // Reconstruct OpenRouter response structure from streaming data
      const choices = Array.from(choicesMap.entries())
        .sort(([a], [b]) => a - b) // Sort by choice index
        .map(([index, choiceData]) => ({
          index,
          message: {
            role: 'assistant',
            content: choiceData.content,
          },
          finish_reason: choiceData.finishReason || 'stop',
        }));

      // Ensure at least one choice exists
      if (choices.length === 0) {
        choices.push({
          index: 0,
          message: {
            role: 'assistant',
            content: '',
          },
          finish_reason: 'stop',
        });
      }

      const reconstructedResponse = {
        id: id || `chatcmpl-${Date.now()}`,
        object,
        created,
        model: model || this.params.model,
        choices,
        usage,
      };

      return {
        status: 'completed',
        data: reconstructedResponse,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      throw new Error(`LLM streaming execution failed: ${errorMessage}`);
    }
  }

  /**
   * Process non-streaming response from OpenRouter
   */
  private async processNonStreamingResponse(
    response: Response
  ): Promise<{ status: 'completed' | 'failed'; data?: unknown; error?: Error }> {
    try {
      const responseData = await response.json();

      return {
        status: 'completed',
        data: responseData,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Non-streaming processing failed';
      return {
        status: 'failed',
        error: new Error(`LLM non-streaming execution failed: ${errorMessage}`),
      };
    }
  }

  /**
   * Build HttpRequest parameters for OpenRouter API
   */
  private buildHttpRequestParams(messages: LlmMessage[]): HttpRequestParams {
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';

    // Get API key from Autopilot singleton, fallback to parameters for backward compatibility
    const apiKey = autopilot.getOpenRouterApiKey();

    // Build request body
    const body = {
      model: this.params.model,
      messages,
      temperature: this.params.temperature || 0.7,
      max_tokens: this.params.maxTokens || 1024,
      top_p: this.params.topP || 1.0,
      frequency_penalty: this.params.frequencyPenalty || 0,
      presence_penalty: this.params.presencePenalty || 0,
      stream: true, // Always request streaming
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
      body: JSON.stringify(body),
      timeout: this.params.timeout || 60000,
      redirect: 'follow',
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
        const httpRequest = new HttpRequest(this.buildHttpRequestParams([]));
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

  /**
   * Check if value is a plain object
   */
  private isPlainObject(obj: unknown): boolean {
    return typeof obj === 'object' && obj !== null && obj.constructor === Object;
  }
}
