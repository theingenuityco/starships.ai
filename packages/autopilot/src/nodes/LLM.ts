/**
 * LLM Class
 *
 * Executable LLM (Large Language Model) that handles AI model interactions via OpenRouter.
 * Simplified implementation focusing on core LLM functionality without unnecessary bloat.
 */

import { BaseNode } from './BaseNode';
import type { LlmParams, ToolParams } from '@/types/node-parameters';
import { ValidationResult, ValidationError } from '@/types/validation';
import { ExecutionItem } from '@/types';
import { autopilot } from '@/Autopilot';
import { NodeHandlerOptions } from '@/types/node-handler';
import { LLMMessageRole, LLMResponse, LLMUsage } from '@/types/llm';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

interface StreamChoice {
  content: string;
  finishReason: string | null;
  tool_calls?: {
    id?: string;
    function: {
      name?: string;
      arguments?: string;
    };
  }[];
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
      role?: string;
      tool_calls?: {
        index?: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: LLMUsage;
}

export class LLM extends BaseNode<LlmParams> {
  constructor(params: LlmParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  /**
   * Execute the LLM request with streaming and optional input items
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    const apiKey = autopilot.getOpenRouterApiKey();
    if (!apiKey) {
      throw this.handleExecutionError(new Error('OpenRouter API key is required. Configure it via autopilot.setCredentials().'));
    }

    try {
      // Use input data as user message if no explicit messages provided
      let messages = params.messages;
      if (input && input.length > 0 && (!messages || (Array.isArray(messages) && messages.length === 0))) {
        const inputData = ExecutionItemUtils.unwrapSingle(input);
        const inputContent = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
        messages = [{ role: 'user', content: inputContent }];
      }

      // Always stream; downstream receiver will handle tool_calls assembly from streaming deltas
      const useStream = true;

      const requestBody: Record<string, unknown> = {
        model: params.model,
        messages: messages || params.messages,
        temperature: params.temperature || 0.7,
        max_tokens: params.maxTokens || 1024,
        top_p: params.topP || 1.0,
        frequency_penalty: params.frequencyPenalty || 0,
        presence_penalty: params.presencePenalty || 0,
        stream: useStream,
      };

      // Add function calling support if tools are provided
      if (params.tools && Array.isArray(params.tools) && params.tools.length > 0) {
        requestBody.tools = this.convertToOpenRouterTools(params.tools);
        requestBody.tool_choice = 'auto';
      }

      // console.log('>>REQUEST>> ', JSON.stringify(requestBody, null, 2));

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

      // If streaming is disabled (tools present), return the full JSON (includes tool_calls)
      if (!useStream) {
        const result = (await response.json()) as LLMResponse;
        return ExecutionItemUtils.wrapSingle(result, input?.[0]);
      }

      // Streaming path
      const reader = response.body?.getReader();
      if (!reader) {
        const result = (await response.json()) as LLMResponse;
        return ExecutionItemUtils.wrapSingle(result, input?.[0]);
      }

      const llmResponse = await this.processStreamingResponse(reader);
      // console.log('<<RESPONSE<< ', JSON.stringify(llmResponse, null, 2));
      return ExecutionItemUtils.wrapSingle(llmResponse, input?.[0]);
    } catch (error) {
      throw this.handleExecutionError(error, 'LLM execution failed');
    }
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

            const eventCallback = this.getEventCallback();
            if (eventCallback) {
              await eventCallback({
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

      const eventCallback = this.getEventCallback();
      if (eventCallback) {
        await eventCallback({ type: 'content_complete', timestamp: new Date().toISOString() });
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
        const toolCallsDelta = choice.delta?.tool_calls || [];

        // Ensure choice exists
        while (choices.length <= index) {
          choices.push({ content: '', finishReason: null });
        }

        // Accumulate assistant content
        if (content) {
          choices[index].content += content;
        }

        // Accumulate tool_calls if present (OpenAI/OpenRouter-style streaming)
        if (toolCallsDelta.length > 0) {
          if (!choices[index].tool_calls) {
            choices[index].tool_calls = [];
          }
          for (const tc of toolCallsDelta) {
            const tcIndex = tc.index ?? 0;
            // Ensure tool_call slot
            while ((choices[index].tool_calls?.length || 0) <= tcIndex) {
              choices[index].tool_calls?.push({ id: undefined, function: { name: undefined, arguments: '' } });
            }
            const target = choices[index].tool_calls![tcIndex];
            if (tc.id) target.id = tc.id;
            if (tc.function?.name) target.function.name = tc.function.name;
            if (tc.function?.arguments) {
              target.function.arguments = (target.function.arguments || '') + tc.function.arguments;
            }
          }
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
          role: 'assistant' as LLMMessageRole,
          content: choice.content,
          ...(choice.tool_calls && choice.tool_calls.length > 0
            ? {
                tool_calls: choice.tool_calls.map((tc, i) => ({
                  id: tc.id || `call_${index}_${i}`,
                  type: 'function',
                  function: {
                    name: tc.function.name || '',
                    arguments: tc.function.arguments || '',
                  },
                })),
              }
            : {}),
        },
        finish_reason: choice.finishReason || 'stop',
      })),
      usage,
    };
  }

  /**
   * Convert ToolParams to OpenRouter function calling format
   */
  private convertToOpenRouterTools(tools: ToolParams[]): unknown[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Validate LLM configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    // Required fields using helper method
    const modelError = this.validateRequiredField(params.model, 'Model');
    if (modelError) errors.push(modelError);

    const messagesError = this.validateArrayParameter(params.messages, 'Messages', 1);
    if (messagesError) errors.push(messagesError);

    // Tools validation - handle both array and string (template expression)
    if (params.tools !== undefined && !Array.isArray(params.tools) && typeof params.tools !== 'string') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Tools must be an array of ToolParams or a template expression string',
      });
    }

    // API key validation
    if (!autopilot.getOpenRouterApiKey()) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'OpenRouter API key is required. Configure it via autopilot.setCredentials().',
      });
    }

    // Parameter range validation using helper methods
    const tempError = this.validateParameterRange(params.temperature, 'Temperature', 0, 2);
    if (tempError) errors.push(tempError);

    const tokensError = this.validateMinimumValue(params.maxTokens, 'Max tokens', 1);
    if (tokensError) errors.push(tokensError);

    const topPError = this.validateParameterRange(params.topP, 'Top P', 0, 1);
    if (topPError) errors.push(topPError);

    const freqPenaltyError = this.validateParameterRange(params.frequencyPenalty, 'Frequency penalty', -2, 2);
    if (freqPenaltyError) errors.push(freqPenaltyError);

    const presPenaltyError = this.validateParameterRange(params.presencePenalty, 'Presence penalty', -2, 2);
    if (presPenaltyError) errors.push(presPenaltyError);

    const timeoutError = this.validateMinimumValue(params.timeout, 'Timeout', 1000);
    if (timeoutError) errors.push(timeoutError);

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
