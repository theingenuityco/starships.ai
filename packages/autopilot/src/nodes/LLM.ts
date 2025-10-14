/**
 * LLM Class
 *
 * Executable LLM (Large Language Model) that handles AI model interactions via OpenRouter.
 * Uses OpenAI SDK for reliable streaming and tool call accumulation.
 */

import { BaseNode } from './BaseNode';
import type { LlmParams, ToolParams } from '@/types/node-parameters';
import { ValidationResult, ValidationError } from '@/types/validation';
import { ExecutionItem } from '@/types';
import { NodeHandlerOptions } from '@/types/node-handler';
import { LLMMessageRole, LLMResponse, LLMUsage, LlmMessage, LlmToolCall } from '@/types/llm';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';

export class LLM extends BaseNode<LlmParams> {
  private emittedToolCalls: Set<string> = new Set();

  constructor(params: LlmParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  /**
   * Execute the LLM request with streaming and optional input items
   * Uses OpenAI SDK for reliable streaming and tool call handling
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    const secureEnv = this.getOptions()?.secureEnv;
    const apiKey = secureEnv?.OPEN_ROUTER_KEY;
    if (!apiKey) {
      throw this.handleExecutionError(new Error('OpenRouter API key is required. Provide it via starship $env("OPEN_ROUTER_KEY").'));
    }

    try {
      // Use input data as user message if no explicit messages provided
      let messages = params.messages;
      if (input && input.length > 0 && (!messages || (Array.isArray(messages) && messages.length === 0))) {
        const inputData = ExecutionItemUtils.unwrapSingle(input);
        const inputContent = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
        messages = [{ role: 'user', content: inputContent }];
      }

      // Initialize OpenAI client with OpenRouter base URL
      const client = new OpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://starships.ai',
          'X-Title': 'Starships.ai',
        },
      });

      // Prepare request options - only include params that are explicitly provided
      // This allows OpenRouter/model providers to use their own defaults
      const sourceMessages = this.coerceToLlmMessages(messages || params.messages);
      const openaiMessages = this.convertMessagesToOpenAI(sourceMessages);
      const requestOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
        model: params.model,
        messages: openaiMessages,
        stream: true,
        stream_options: { include_usage: true }, // OpenRouter usage accounting
      };

      // Only add optional parameters if explicitly provided
      if (typeof params.temperature === 'number') {
        requestOptions.temperature = params.temperature;
      }
      if (typeof params.maxTokens === 'number') {
        requestOptions.max_tokens = params.maxTokens;
      }
      if (typeof params.topP === 'number') {
        requestOptions.top_p = params.topP;
      }
      if (typeof params.frequencyPenalty === 'number') {
        requestOptions.frequency_penalty = params.frequencyPenalty;
      }
      if (typeof params.presencePenalty === 'number') {
        requestOptions.presence_penalty = params.presencePenalty;
      }

      // Add function calling support if tools are provided
      if (params.tools && Array.isArray(params.tools) && params.tools.length > 0) {
        requestOptions.tools = this.convertToOpenAITools(params.tools);
        requestOptions.tool_choice = 'auto';
        // Prevent multiple tool calls within a single assistant response
        // OpenAI/compatible providers honor `parallel_tool_calls: false`
        requestOptions.parallel_tool_calls = false;
      }

      // console.log('>>> REQUEST >>>', JSON.stringify(requestOptions, null, 2));
      // Stream with OpenAI SDK (handles all accumulation reliably)
      const stream = await client.chat.completions.create(requestOptions);
      const llmResponse = await this.processOpenAIStream(stream);

      return ExecutionItemUtils.wrapSingle(llmResponse, input?.[0]);
    } catch (error) {
      console.error(error);
      throw this.handleExecutionError(error, 'LLM execution failed');
    }
  }

  /**
   * Normalize OpenRouter usage response (snake_case) to our LLMUsage type (camelCase)
   */
  private normalizeUsage(usage: unknown): LLMUsage {
    if (!usage || typeof usage !== 'object') {
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
    }

    const usageObj = usage as Record<string, unknown>;
    const promptTokens = typeof usageObj.prompt_tokens === 'number' ? usageObj.prompt_tokens : 0;
    const completionTokens = typeof usageObj.completion_tokens === 'number' ? usageObj.completion_tokens : 0;
    const totalTokens = typeof usageObj.total_tokens === 'number' ? usageObj.total_tokens : promptTokens + completionTokens;
    const cost = typeof usageObj.cost === 'number' ? usageObj.cost : 0;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      cost,
    };
  }

  /**
   * Convert ToolParams to OpenAI function calling format
   * Uses tool.slug as the function name for consistent kebab-case format
   */
  private convertToOpenAITools(tools: ToolParams[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.slug,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
      },
    }));
  }

  /**
   * Convert canonical LlmMessage[] to OpenAI ChatCompletionMessageParam[]
   * - assistant with toolCalls -> assistant with tool_calls (arguments stringified)
   * - tool with toolCallId -> tool with tool_call_id
   */
  private convertMessagesToOpenAI(messages: LlmMessage[] | undefined): OpenAI.Chat.ChatCompletionMessageParam[] {
    const list = Array.isArray(messages) ? messages : [];
    return list.map((m) => this.convertMessageToOpenAI(m));
  }

  private convertMessageToOpenAI(m: LlmMessage): OpenAI.Chat.ChatCompletionMessageParam {
    const role = m.role as OpenAI.Chat.ChatCompletionMessageParam['role'];
    const contentVal = m.content;

    if (role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
      const toolCalls = m.toolCalls.map((tc) => ({
        id: typeof tc.id === 'string' ? tc.id : undefined,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? (tc.function.arguments as string)
              : (() => {
                  try {
                    return JSON.stringify(tc.function.arguments ?? {});
                  } catch {
                    return '{}';
                  }
                })(),
        },
      }));
      return {
        role: 'assistant',
        content: contentVal,
        tool_calls: toolCalls,
      } as OpenAI.Chat.ChatCompletionAssistantMessageParam;
    }

    if (role === 'tool') {
      const toolCallId = typeof m.toolCallId === 'string' ? m.toolCallId : '';
      return {
        role: 'tool',
        content: contentVal,
        tool_call_id: toolCallId,
      } as OpenAI.Chat.ChatCompletionToolMessageParam;
    }

    if (role === 'system') {
      return { role: 'system', content: contentVal } as OpenAI.Chat.ChatCompletionSystemMessageParam;
    }

    // default user
    return { role: 'user', content: contentVal } as OpenAI.Chat.ChatCompletionUserMessageParam;
  }

  /**
   * Coerce arbitrary messages into canonical LlmMessage[] (handles legacy snake_case fields).
   */
  private coerceToLlmMessages(messagesParam: unknown): LlmMessage[] {
    if (!Array.isArray(messagesParam)) return [];
    const out: LlmMessage[] = [];

    for (const item of messagesParam) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;

      const role = (typeof obj.role === 'string' ? obj.role : 'user') as LLMMessageRole;
      const content = typeof obj.content === 'string' ? obj.content : JSON.stringify(obj.content ?? '');

      const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : undefined;

      let toolCalls: LlmToolCall[] | undefined;
      const toolCallsCanonical = (obj as { toolCalls?: unknown }).toolCalls;
      const toolCallsSnake = (obj as { tool_calls?: unknown }).tool_calls;

      const normalizeToolCall = (tcUnknown: unknown): LlmToolCall | null => {
        if (!tcUnknown || typeof tcUnknown !== 'object') return null;
        const rec = tcUnknown as Record<string, unknown>;
        const id = typeof rec.id === 'string' ? rec.id : undefined;

        let name = '';
        let args: unknown = {};
        const fn = rec.function;
        if (fn && typeof fn === 'object') {
          const fnRec = fn as Record<string, unknown>;
          name = typeof fnRec.name === 'string' ? fnRec.name : '';
          const rawArgs = fnRec.arguments;
          if (typeof rawArgs === 'string') {
            try {
              args = JSON.parse(rawArgs);
            } catch {
              args = {};
            }
          } else if (rawArgs && typeof rawArgs === 'object') {
            args = rawArgs;
          } else {
            args = {};
          }
        }

        if (!name) return null;
        return { id, type: 'function', function: { name, arguments: args } };
      };

      if (Array.isArray(toolCallsCanonical)) {
        toolCalls = toolCallsCanonical.map((tc) => normalizeToolCall(tc)).filter((x): x is LlmToolCall => x !== null);
      } else if (Array.isArray(toolCallsSnake)) {
        toolCalls = toolCallsSnake.map((tc) => normalizeToolCall(tc)).filter((x): x is LlmToolCall => x !== null);
      }

      let toolCallId: string | undefined;
      if (typeof (obj as { toolCallId?: unknown }).toolCallId === 'string') {
        toolCallId = (obj as { toolCallId?: string }).toolCallId;
      } else if (typeof (obj as { tool_call_id?: unknown }).tool_call_id === 'string') {
        toolCallId = (obj as { tool_call_id?: string }).tool_call_id;
      }

      const canonical: LlmMessage = {
        role,
        content,
        ...(reasoning ? { reasoning } : {}),
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
        ...(toolCallId ? { toolCallId } : {}),
      };
      out.push(canonical);
    }

    return out;
  }

  /**
   * Process OpenAI streaming response using the SDK's reliable accumulation
   * This replaces our custom SSE parsing with battle-tested logic
   */
  private async processOpenAIStream(stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>): Promise<LLMResponse> {
    const executionDepth = this.getOptions()?.execution?.depth ?? 0;
    const eventCallback = this.getEventCallback();

    let responseMetadata = {
      id: '',
      model: '',
      created: Math.floor(Date.now() / 1000),
      object: 'chat.completion' as const,
    };

    let usage: LLMUsage | undefined;
    let content = '';
    let reasoning = '';
    let toolCalls: Array<{
      id?: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }> = [];
    let finishReason: string | null = null;

    try {
      for await (const chunk of stream) {
        // Update metadata from first chunk
        if (chunk.id && !responseMetadata.id) responseMetadata.id = chunk.id;
        if (chunk.model && !responseMetadata.model) responseMetadata.model = chunk.model;
        if (chunk.created) responseMetadata.created = chunk.created;

        const choice = chunk.choices[0];
        if (!choice) continue;

        // Accumulate content
        if (choice.delta?.content) {
          content += choice.delta.content;
        }

        // Handle tool calls - OpenAI SDK properly accumulates these
        if (choice.delta?.tool_calls) {
          for (const toolCallDelta of choice.delta.tool_calls) {
            const index = toolCallDelta.index ?? 0;

            // Ensure slot exists
            while (toolCalls.length <= index) {
              toolCalls.push({
                type: 'function',
                function: { name: '', arguments: '' },
              });
            }

            const target = toolCalls[index];
            if (toolCallDelta.id) target.id = toolCallDelta.id;
            if (toolCallDelta.function?.name) target.function.name = toolCallDelta.function.name;
            if (toolCallDelta.function?.arguments) {
              target.function.arguments += toolCallDelta.function.arguments;
            }

            // Emit tool_call_detected on first detection
            if (toolCallDelta.function?.name && toolCallDelta.id && eventCallback) {
              if (!this.emittedToolCalls.has(toolCallDelta.id)) {
                this.emittedToolCalls.add(toolCallDelta.id);

                await eventCallback({
                  type: 'tool_call_detected',
                  timestamp: new Date().toISOString(),
                  executionDepth,
                  data: {
                    toolCallId: toolCallDelta.id,
                    toolName: toolCallDelta.function.name,
                  },
                });
              }
            }
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        // Extract usage if present
        if (chunk.usage) {
          usage = this.normalizeUsage(chunk.usage);
        }

        // Broadcast content chunk for streaming - normalize tool_calls to toolCalls
        if (eventCallback) {
          const normalizedChunk = this.normalizeChunkToolCalls(chunk);
          await eventCallback({
            type: 'content_chunk',
            timestamp: new Date().toISOString(),
            executionDepth,
            data: { chunk: normalizedChunk as unknown as Record<string, unknown> },
          });
        }
      }

      // Emit completion event
      if (eventCallback && usage) {
        await eventCallback({
          type: 'content_complete',
          timestamp: new Date().toISOString(),
          executionDepth,
          data: {
            model: responseMetadata.model,
            usage: {
              cost: usage.cost,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
            },
          },
        });
      }

      // Build final response with properly parsed tool calls
      const parsedToolCalls = toolCalls
        .filter((tc) => tc.function.name.length > 0)
        .map((tc, i) => {
          let argsObj: unknown = {};

          if (tc.function.arguments) {
            try {
              argsObj = JSON.parse(tc.function.arguments);
            } catch (parseError) {
              console.error(`[LLM FINAL] Failed to parse tool '${tc.function.name}' arguments:`, {
                argsLength: tc.function.arguments.length,
                error: parseError instanceof Error ? parseError.message : String(parseError),
              });
              // Log full args for debugging
              console.error(`[LLM FINAL] Full arguments:`, tc.function.arguments);
              argsObj = {};
            }
          }

          return {
            id: tc.id || `call_${i}`,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: argsObj,
            },
          };
        });

      return {
        id: responseMetadata.id,
        object: responseMetadata.object,
        created: responseMetadata.created,
        model: responseMetadata.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as LLMMessageRole,
              content,
              ...(reasoning ? { reasoning } : {}),
              ...(parsedToolCalls.length > 0 ? { toolCalls: parsedToolCalls } : {}),
            },
            finishReason: finishReason || 'stop',
          },
        ],
        usage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      throw new Error(`LLM streaming execution failed: ${errorMessage}`);
    }
  }

  /**
   * Normalize OpenAI SDK chunks to use camelCase throughout
   * Converts: finish_reason → finishReason, tool_calls → toolCalls, etc.
   * This ensures compatibility with ConversationService expectations
   */
  private normalizeChunkToolCalls(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): Record<string, unknown> {
    if (!chunk.choices || !Array.isArray(chunk.choices)) {
      return chunk as unknown as Record<string, unknown>;
    }

    const normalizedChoices = chunk.choices.map((choice) => {
      const normalized: Record<string, unknown> = {
        index: choice.index,
      };

      // Normalize finish_reason → finishReason
      if (choice.finish_reason) {
        normalized.finishReason = choice.finish_reason;
      }

      // Normalize delta object
      if (choice.delta && typeof choice.delta === 'object') {
        const delta = choice.delta as Record<string, unknown>;
        const normalizedDelta: Record<string, unknown> = {};

        // Copy standard fields
        if (delta.content) normalizedDelta.content = delta.content;
        if (delta.role) normalizedDelta.role = delta.role;

        // Normalize tool_calls → toolCalls
        if ('tool_calls' in delta && Array.isArray(delta.tool_calls)) {
          normalizedDelta.toolCalls = delta.tool_calls;
        }

        // Handle any other delta fields
        Object.keys(delta).forEach((key) => {
          if (!['content', 'role', 'tool_calls'].includes(key)) {
            normalizedDelta[key] = delta[key];
          }
        });

        normalized.delta = normalizedDelta;
      }

      return normalized;
    });

    // Normalize usage from snake_case to camelCase
    let normalizedUsage: Record<string, unknown> | undefined;
    if (chunk.usage) {
      normalizedUsage = {
        promptTokens: chunk.usage.prompt_tokens ?? 0,
        completionTokens: chunk.usage.completion_tokens ?? 0,
        totalTokens: chunk.usage.total_tokens ?? 0,
        ...(typeof chunk.usage.completion_tokens_details === 'object' && chunk.usage.completion_tokens_details !== null
          ? {
              completionTokensDetails: {
                reasoningTokens: (chunk.usage.completion_tokens_details as Record<string, unknown>).reasoning_tokens ?? 0,
              },
            }
          : {}),
      };
    }

    return {
      id: chunk.id,
      object: chunk.object,
      created: chunk.created,
      model: chunk.model,
      choices: normalizedChoices,
      // Include normalized usage if present
      ...(normalizedUsage ? { usage: normalizedUsage } : {}),
    };
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

    // API key validation moved to runtime via secureEnv only

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
