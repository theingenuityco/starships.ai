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
import { LLMMessageRole, LLMResponse, LLMUsage, ReasoningDetail } from '@/types/llm';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

interface StreamChoice {
  content: string;
  // Optional accumulated reasoning text for reasoning-capable providers
  reasoning?: string;
  // Optional accumulated reasoning details (OpenRouter unified)
  reasoningDetails?: ReasoningDetail[];
  finishReason: string | null;
  toolCalls?: {
    id?: string;
    function: {
      name?: string;
      arguments?: string;
      // Accumulated parse (best-effort) of arguments into JSON, when possible
      argumentsJson?: unknown;
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
    message?: {
      content?: string;
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
    const secureEnv = this.getOptions()?.secureEnv;
    const apiKey = secureEnv?.OPEN_ROUTER_KEY ?? autopilot.getOpenRouterApiKey();
    if (!apiKey) {
      throw this.handleExecutionError(
        new Error('OpenRouter API key is required. Provide it via starship $env("OPEN_ROUTER_KEY") or autopilot.setCredentials().')
      );
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
        // Enable OpenRouter usage accounting in the streamed payload per docs
        // https://openrouter.ai/docs/use-cases/usage-accounting
        usage: { include: true },
      };

      // Add function calling support if tools are provided
      if (params.tools && Array.isArray(params.tools) && params.tools.length > 0) {
        requestBody.tools = this.convertToOpenRouterTools(params.tools);
        requestBody.tool_choice = 'auto';
      }

      // Add reasoning config (OpenRouter unified parameter) if provided
      // Ref: https://openrouter.ai/docs/use-cases/reasoning-tokens
      if (params.reasoning !== undefined) {
        (requestBody as { reasoning?: unknown }).reasoning = params.reasoning as unknown;
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[LLM HTTP ERROR]', {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
          requestMessages: requestBody.messages,
        });
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorBody}`);
      }

      // Usage accounting (if present) is handled via SSE usage payload from the provider

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
    // Root-level execution depth for this LLM stream (0=top-level, >0=nested)
    const executionDepth = this.getOptions()?.execution?.depth ?? 0;

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
              // Normalize tool_calls to toolCalls for consistency across the application
              const normalizedChunk = this.normalizeToolCallsInChunk(parsed);

              await eventCallback({
                type: 'content_chunk',
                timestamp: new Date().toISOString(),
                executionDepth,
                data: { chunk: normalizedChunk as Record<string, unknown> },
              });
            }
          } catch (error) {
            console.error('Failed to parse streaming chunk:', error, 'Data:', data);
          }
        }
      }

      const eventCallback = this.getEventCallback();
      if (eventCallback) {
        // Normalize usage from stream payload (OpenRouter snake_case to camelCase)
        const normalizedUsage = usage ? this.normalizeUsage(usage) : undefined;
        const promptTokens = normalizedUsage?.promptTokens;
        const completionTokens = normalizedUsage?.completionTokens;
        const totalTokens = normalizedUsage?.totalTokens;
        const cost = normalizedUsage?.cost;

        // Prefer model from response metadata; no header dependency
        const usageModel = responseMetadata.model && responseMetadata.model.length > 0 ? responseMetadata.model : undefined;

        await eventCallback({
          type: 'content_complete',
          timestamp: new Date().toISOString(),
          executionDepth,
          data: {
            model: usageModel,
            usage: {
              // 'cost' is required by LLMEvent usage type; default to 0 when not provided
              cost: typeof cost === 'number' ? cost : 0,
              ...(typeof promptTokens === 'number' ? { promptTokens } : {}),
              ...(typeof completionTokens === 'number' ? { completionTokens } : {}),
              ...(typeof totalTokens === 'number' ? { totalTokens } : {}),
            },
          },
        });
      }

      const final = this.buildFinalResponse(responseMetadata, choices, usage);
      return final;
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
      for (const choice of parsed.choices || []) {
        const index = choice.index ?? 0;

        // Support providers that emit choices[].message.content/tool_calls instead of choices[].delta
        const delta = (choice?.delta ?? {}) as {
          content?: string;
          role?: string;
          tool_calls?: {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
        const messageNode = (choice?.message ?? {}) as {
          content?: string;
          tool_calls?: {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };

        const contentFromDelta = typeof delta.content === 'string' ? delta.content : '';
        const contentFromMessage = typeof messageNode.content === 'string' ? messageNode.content : '';
        const content = contentFromDelta || contentFromMessage;

        // Extract reasoning text from common provider patterns if present
        const reasoningFromDelta = this.extractReasoning(delta as unknown);
        const reasoningFromMessage = this.extractReasoning(messageNode as unknown);
        const reasoning = reasoningFromDelta || reasoningFromMessage;

        const finishReason = choice.finish_reason || null;

        // Extract reasoning_details (unified OpenRouter shape - snake_case from API)
        // They may appear in delta.reasoning_details (streaming) or message.reasoning_details (snapshot)
        const detailsFromDelta: unknown =
          (delta && typeof delta === 'object' && (delta as Record<string, unknown>).reasoning_details) || undefined;
        const detailsFromMessage: unknown =
          (messageNode && typeof messageNode === 'object' && (messageNode as Record<string, unknown>).reasoning_details) || undefined;

        const normalizeDetails = (val: unknown): ReasoningDetail[] => {
          if (!Array.isArray(val)) return [];
          // Keep as-is; API defines objects with type fields (reasoning.text|summary|encrypted)
          return val as ReasoningDetail[];
        };

        const mergedDetails: ReasoningDetail[] = [...normalizeDetails(detailsFromDelta), ...normalizeDetails(detailsFromMessage)];

        // Prefer true delta updates; otherwise, fall back to message tool_calls snapshot
        type ToolCallDelta = { index?: number; id?: string; function?: { name?: string; arguments?: string } };
        const toolCallsFromDeltaRaw = Array.isArray(delta.tool_calls) ? (delta.tool_calls as unknown[]) : [];
        const toolCallsFromMessageRaw = Array.isArray(messageNode.tool_calls) ? (messageNode.tool_calls as unknown[]) : [];
        const toToolCallDelta = (arr: unknown[]): ToolCallDelta[] =>
          arr.filter((t) => typeof t === 'object' && t !== null).map((t) => t as ToolCallDelta);
        const deltaToolCalls: ToolCallDelta[] = toToolCallDelta(toolCallsFromDeltaRaw);
        const messageToolCalls: ToolCallDelta[] = toToolCallDelta(toolCallsFromMessageRaw);
        const hasDeltaToolCalls = deltaToolCalls.length > 0;
        const hasMessageToolCalls = messageToolCalls.length > 0;

        // Ensure choice exists
        while (choices.length <= index) {
          choices.push({ content: '', finishReason: null });
        }

        // Accumulate assistant content
        if (content) {
          choices[index].content += content;
        }
        // Accumulate reasoning if present
        if (reasoning) {
          if (!choices[index].reasoning) choices[index].reasoning = '';
          choices[index].reasoning += reasoning;
        }

        // Accumulate reasoningDetails if present (normalized to camelCase)
        if (mergedDetails.length > 0) {
          if (!choices[index].reasoningDetails) choices[index].reasoningDetails = [];
          choices[index].reasoningDetails.push(...mergedDetails);
        }

        // Accumulate toolCalls if present (OpenAI/OpenRouter-style streaming with snake_case from API)
        if (hasDeltaToolCalls) {
          if (!choices[index].toolCalls) {
            choices[index].toolCalls = [];
          }
          // Use ToolCallDelta type defined above
          for (const tc of deltaToolCalls) {
            const t = tc || {};
            const tcIndex = typeof t.index === 'number' ? t.index : 0;
            // Ensure toolCall slot
            while ((choices[index].toolCalls?.length || 0) <= tcIndex) {
              choices[index].toolCalls?.push({ id: undefined, function: { name: undefined, arguments: '' } });
            }
            const target = choices[index].toolCalls![tcIndex];
            if (t.id) target.id = t.id;
            if (t.function?.name) target.function.name = t.function.name;
            if (t.function?.arguments) {
              target.function.arguments = (target.function.arguments || '') + t.function.arguments;
              // Note: JSON parsing is deferred to buildFinalResponse to avoid parsing incomplete JSON
            }
          }
        } else if (hasMessageToolCalls) {
          type NormalizedToolCall = { id?: string; function: { name?: string; arguments: string; argumentsJson?: unknown } };
          const normalized: NormalizedToolCall[] = messageToolCalls.map((tc) => {
            const args = typeof tc.function?.arguments === 'string' ? tc.function.arguments : '';
            let parsed: unknown;
            if (typeof args === 'string' && args.length > 0) {
              let s = args.replace(/\r/g, '').trim();
              for (let i = 0; i < 2; i++) {
                const first = s[0],
                  last = s[s.length - 1];
                if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
                  s = s.slice(1, -1);
                }
                try {
                  parsed = JSON.parse(s);
                  break;
                } catch {
                  /* ignore */
                }
              }
              if (!parsed) {
                try {
                  parsed = JSON.parse(s);
                } catch {
                  /* ignore */
                }
              }
            }
            return {
              id: tc.id,
              function: {
                name: typeof tc.function?.name === 'string' ? tc.function.name : undefined,
                arguments: args,
                ...(parsed && typeof parsed === 'object' ? { argumentsJson: parsed } : {}),
              },
            };
          });
          const valid = normalized.filter(
            (tc): tc is { id?: string; function: { name: string; arguments: string } } =>
              typeof tc.function.name === 'string' && tc.function.name.length > 0
          );
          if (!choices[index].toolCalls) {
            choices[index].toolCalls = [];
          }
          choices[index].toolCalls = valid;
        }

        if (finishReason) {
          choices[index].finishReason = finishReason;
        }
      }
    }
  }

  /**
   * Normalize tool_calls (snake_case) to toolCalls (camelCase) in streaming chunks
   * This ensures consistency across the application regardless of provider format
   */
  private normalizeToolCallsInChunk(chunk: StreamChunk): StreamChunk {
    if (!chunk.choices || !Array.isArray(chunk.choices)) {
      return chunk;
    }

    const normalizedChoices = chunk.choices.map((choice) => {
      const normalizedChoice = { ...choice };

      // Normalize delta.tool_calls to delta.toolCalls
      if (choice.delta) {
        const delta = choice.delta as Record<string, unknown>;
        if ('tool_calls' in delta) {
          const { tool_calls, ...rest } = delta;
          normalizedChoice.delta = { ...rest, toolCalls: tool_calls } as typeof choice.delta;
        }
      }

      // Normalize message.tool_calls to message.toolCalls
      if (choice.message) {
        const message = choice.message as Record<string, unknown>;
        if ('tool_calls' in message) {
          const { tool_calls, ...rest } = message;
          normalizedChoice.message = { ...rest, toolCalls: tool_calls } as typeof choice.message;
        }
      }

      return normalizedChoice;
    });

    return {
      ...chunk,
      choices: normalizedChoices,
    };
  }

  /**
   * Attempt to extract reasoning/thinking text from a provider delta/message node.
   * Supports a few common shapes:
   * - node.reasoning: string | { content: string } | { tokens: [{text}] } | Array<{text|content}>
   * - node.thinking: same as above (alternate field name)
   */
  private extractReasoning(node: unknown): string {
    try {
      if (!node || typeof node !== 'object') return '';
      const rec = node as Record<string, unknown>;
      const parts: string[] = [];

      // Gather from unified 'reasoning' or 'thinking'
      const raw = (rec.reasoning ?? rec.thinking) as unknown;

      const appendFromRaw = (r: unknown): void => {
        if (!r) return;
        if (typeof r === 'string') {
          parts.push(r);
          return;
        }
        if (typeof r === 'object' && r !== null) {
          const obj = r as Record<string, unknown>;
          if (typeof obj.content === 'string') {
            parts.push(obj.content);
          }
          if (Array.isArray(obj.tokens)) {
            for (const t of obj.tokens as unknown[]) {
              if (t && typeof t === 'object') {
                const tok = t as Record<string, unknown>;
                const text = typeof tok.text === 'string' ? tok.text : '';
                const content = typeof tok.content === 'string' ? tok.content : '';
                if (text) parts.push(text);
                else if (content) parts.push(content);
              }
            }
          }
        }
        if (Array.isArray(r)) {
          for (const p of r as unknown[]) {
            if (p && typeof p === 'object') {
              const pr = p as Record<string, unknown>;
              const text = typeof pr.text === 'string' ? pr.text : '';
              const content = typeof pr.content === 'string' ? pr.content : '';
              if (text) parts.push(text);
              else if (content) parts.push(content);
            }
          }
        }
      };

      appendFromRaw(raw);

      // Also gather from reasoning_details chunks when provided (snake_case from API)
      const details = rec.reasoning_details as unknown;
      if (Array.isArray(details)) {
        for (const d of details as unknown[]) {
          if (d && typeof d === 'object') {
            const det = d as Record<string, unknown>;
            if (det.type === 'reasoning.text' && typeof det.text === 'string') {
              parts.push(det.text);
            }
          }
        }
      }

      return parts.join('');
    } catch {
      return '';
    }
  }

  /**
   * Build final response from accumulated streaming data
   * Normalizes OpenRouter snake_case to our camelCase types
   */
  private buildFinalResponse(
    metadata: { id: string; model: string; created: number; object: string },
    streamChoices: StreamChoice[],
    usage?: LLMUsage
  ): LLMResponse {
    const choices = streamChoices.length > 0 ? streamChoices : [{ content: '', finishReason: 'stop' }];

    // Narrow toolCalls entries to those with a non-empty function name (guards against placeholder chunks)
    type ToolCallCandidate = { id?: string; function?: { name?: unknown; arguments?: unknown } };
    type ValidToolCall = { id?: string; function: { name: string; arguments?: string; argumentsJson?: unknown } };
    const isValidToolCall = (tc: unknown): tc is ValidToolCall => {
      if (!tc || typeof tc !== 'object') return false;
      const cand = tc as ToolCallCandidate;
      return typeof cand.function?.name === 'string' && cand.function.name.length > 0;
    };

    // Normalize usage if present (OpenRouter snake_case to camelCase)
    const normalizedUsage = usage ? this.normalizeUsage(usage) : undefined;

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
          ...(choice.reasoning ? { reasoning: choice.reasoning } : {}),
          ...(choice.reasoningDetails ? { reasoningDetails: choice.reasoningDetails } : {}),
          ...(choice.toolCalls && choice.toolCalls.some(isValidToolCall)
            ? {
                toolCalls: (choice.toolCalls.filter(isValidToolCall) as ValidToolCall[]).map((tc, i) => {
                  // Parse accumulated arguments string to object for LlmFunctionCall.arguments
                  const argsStr = typeof tc.function.arguments === 'string' ? tc.function.arguments : '';
                  let argsObj: unknown = {};
                  if (argsStr) {
                    try {
                      let s = argsStr.replace(/\r/g, '').trim();
                      let parsed = false;
                      for (let k = 0; k < 3; k++) {
                        const first = s[0],
                          last = s[s.length - 1];
                        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
                          s = s.slice(1, -1);
                        }
                        try {
                          const result = JSON.parse(s);
                          if (result && typeof result === 'object') {
                            argsObj = result as unknown;
                            parsed = true;
                            break;
                          }
                        } catch {
                          /* ignore */
                        }
                      }
                      if (!parsed) {
                        const result = JSON.parse(s);
                        if (result && typeof result === 'object') {
                          argsObj = result as unknown;
                        }
                      }
                    } catch {
                      // If parsing fails, use empty object
                      argsObj = {};
                    }
                  }
                  return {
                    id: tc.id || `call_${index}_${i}`,
                    type: 'function',
                    function: {
                      name: tc.function.name, // guaranteed string by isValidToolCall
                      arguments: argsObj, // Parsed object per LlmFunctionCall type
                    },
                  };
                }),
              }
            : {}),
        },
        finishReason: choice.finishReason || 'stop',
      })),
      usage: normalizedUsage,
    };
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

  // Header parsing removed; relying solely on SSE usage payload (usage.include = true)

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
