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
  reasoning_details?: ReasoningDetail[];
  finishReason: string | null;
  tool_calls?: {
    id?: string;
    function: {
      name?: string;
      arguments?: string;
      // Accumulated parse (best-effort) of arguments into JSON, when possible
      arguments_json?: unknown;
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
    console.log('[LLM] Starting execution with params:', {
      model: params.model,
      hasMessages: !!params.messages,
      messageCount: Array.isArray(params.messages) ? params.messages.length : 0,
      hasTools: !!params.tools,
      toolCount: Array.isArray(params.tools) ? params.tools.length : 0
    });
    
    const secureEnv = this.getOptions()?.secureEnv;
    const apiKey = secureEnv?.OPEN_ROUTER_KEY ?? autopilot.getOpenRouterApiKey();
    if (!apiKey) {
      console.error('[LLM] No API key found!');
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
      
      console.log('[LLM] Final message count:', Array.isArray(messages) ? messages.length : 0);
      if (Array.isArray(messages) && messages.length > 0) {
        console.log('[LLM] Last message:', {
          role: messages[messages.length - 1].role,
          contentLength: messages[messages.length - 1].content?.length || 0
        });
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

      // Add reasoning config (OpenRouter unified parameter) if provided
      // Ref: https://openrouter.ai/docs/use-cases/reasoning-tokens
      if (params.reasoning !== undefined) {
        (requestBody as { reasoning?: unknown }).reasoning = params.reasoning as unknown;
      }

      // Removed verbose LLM request log

      console.log('[LLM] Making API call to OpenRouter...');
      console.log('[LLM] Request body size:', JSON.stringify(requestBody).length, 'bytes');
      
      let response;
      try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': 'Starships-Autopilot/1.0',
          },
          body: JSON.stringify(requestBody),
        });
      } catch (fetchError) {
        console.error('[LLM] Fetch error details:', fetchError);
        console.error('[LLM] Fetch error name:', fetchError instanceof Error ? fetchError.name : 'Unknown');
        console.error('[LLM] Fetch error cause:', (fetchError as any).cause);
        
        // Try to provide more context about the network error
        if (fetchError instanceof Error && fetchError.message.includes('fetch failed')) {
          const cause = (fetchError as any).cause;
          if (cause) {
            console.error('[LLM] Network error cause:', cause.message || cause);
            if (cause.code) console.error('[LLM] Error code:', cause.code);
            if (cause.syscall) console.error('[LLM] Syscall:', cause.syscall);
          }
        }
        throw fetchError;
      }

      console.log('[LLM] Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[LLM] API Error:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
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

      console.log('[LLM] Processing streaming response...');
      const llmResponse = await this.processStreamingResponse(reader);
      console.log('[LLM] Streaming complete, wrapping response');
      const result = ExecutionItemUtils.wrapSingle(llmResponse, input?.[0]);
      console.log('[LLM] Returning result with', result.length, 'items');
      return result;
    } catch (error) {
      console.error('[LLM] ERROR in execute:', error instanceof Error ? error.message : error);
      console.error('[LLM] Error stack:', error instanceof Error ? error.stack : 'No stack');
      throw this.handleExecutionError(error, 'LLM execution failed');
    }
  }

  /**
   * Process streaming response from OpenRouter
   */
  private async processStreamingResponse(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<LLMResponse> {
    console.log('[LLM] Starting to process streaming response');
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
    let chunkCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[LLM] Stream reading complete, received', chunkCount, 'chunks');
          break;
        }

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
            chunkCount++;
            this.processStreamChunk(parsed, responseMetadata, choices);

            if (parsed.usage) {
              usage = parsed.usage;
            }

            const eventCallback = this.getEventCallback();
            // console.log({ parsed: JSON.stringify(parsed, null, 2) });

            if (eventCallback) {
              await eventCallback({
                type: 'content_chunk',
                timestamp: new Date().toISOString(),
                executionDepth,
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
        await eventCallback({ type: 'content_complete', timestamp: new Date().toISOString(), executionDepth });
      }

      console.log('[LLM] Building final response from', choices.length, 'choices');
      const finalResponse = this.buildFinalResponse(responseMetadata, choices, usage);
      console.log('[LLM] Final response built successfully');
      return finalResponse;
    } catch (error) {
      console.error('[LLM] ERROR in processStreamingResponse:', error);
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

        // Extract reasoning_details (unified OpenRouter shape)
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

        // Accumulate reasoning_details if present
        if (mergedDetails.length > 0) {
          if (!choices[index].reasoning_details) choices[index].reasoning_details = [];
          choices[index].reasoning_details.push(...mergedDetails);
        }

        // Accumulate tool_calls if present (OpenAI/OpenRouter-style streaming)
        if (hasDeltaToolCalls) {
          if (!choices[index].tool_calls) {
            choices[index].tool_calls = [];
          }
          // Use ToolCallDelta type defined above
          for (const tc of deltaToolCalls) {
            const t = tc || {};
            const tcIndex = typeof t.index === 'number' ? t.index : 0;
            // Ensure tool_call slot
            while ((choices[index].tool_calls?.length || 0) <= tcIndex) {
              choices[index].tool_calls?.push({ id: undefined, function: { name: undefined, arguments: '' } });
            }
            const target = choices[index].tool_calls![tcIndex];
            if (t.id) target.id = t.id;
            if (t.function?.name) target.function.name = t.function.name;
            if (t.function?.arguments) {
              target.function.arguments = (target.function.arguments || '') + t.function.arguments;
              // Note: JSON parsing is deferred to buildFinalResponse to avoid parsing incomplete JSON
            }
          }
        } else if (hasMessageToolCalls) {
          type NormalizedToolCall = { id?: string; function: { name?: string; arguments: string; arguments_json?: unknown } };
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
                ...(parsed && typeof parsed === 'object' ? { arguments_json: parsed } : {}),
              },
            };
          });
          const valid = normalized.filter(
            (tc): tc is { id?: string; function: { name: string; arguments: string } } =>
              typeof tc.function.name === 'string' && tc.function.name.length > 0
          );
          if (!choices[index].tool_calls) {
            choices[index].tool_calls = [];
          }
          choices[index].tool_calls = valid;
        }

        if (finishReason) {
          choices[index].finishReason = finishReason;
        }
      }
    }
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

      // Also gather from reasoning_details chunks when provided
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
   */
  private buildFinalResponse(
    metadata: { id: string; model: string; created: number; object: string },
    streamChoices: StreamChoice[],
    usage?: LLMUsage
  ): LLMResponse {
    const choices = streamChoices.length > 0 ? streamChoices : [{ content: '', finishReason: 'stop' }];
    
    console.log('[LLM] Building final response:', {
      choiceCount: choices.length,
      firstChoice: choices[0] ? {
        hasContent: !!choices[0].content,
        contentLength: choices[0].content?.length || 0,
        finishReason: choices[0].finishReason,
        toolCallCount: choices[0].tool_calls?.length || 0
      } : null
    });

    // Narrow tool_calls entries to those with a non-empty function name (guards against placeholder chunks)
    type ToolCallCandidate = { id?: string; function?: { name?: unknown; arguments?: unknown } };
    type ValidToolCall = { id?: string; function: { name: string; arguments?: string; arguments_json?: unknown } };
    const isValidToolCall = (tc: unknown): tc is ValidToolCall => {
      if (!tc || typeof tc !== 'object') return false;
      const cand = tc as ToolCallCandidate;
      return typeof cand.function?.name === 'string' && cand.function.name.length > 0;
    };

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
          ...(choice.tool_calls && choice.tool_calls.some(isValidToolCall)
            ? {
                tool_calls: (choice.tool_calls.filter(isValidToolCall) as ValidToolCall[]).map((tc, i) => {
                  // Always parse arguments_json from the final accumulated arguments string
                  const argsStr = typeof tc.function.arguments === 'string' ? tc.function.arguments : '';
                  let argsJson: unknown = undefined;
                  if (argsStr) {
                    try {
                      let s = argsStr.replace(/\r/g, '').trim();
                      for (let k = 0; k < 3; k++) {
                        const first = s[0],
                          last = s[s.length - 1];
                        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
                          s = s.slice(1, -1);
                        }
                        try {
                          const parsed = JSON.parse(s);
                          if (parsed && typeof parsed === 'object') {
                            argsJson = parsed as unknown;
                            break;
                          }
                        } catch {
                          /* ignore */
                        }
                      }
                      if (argsJson === undefined) {
                        const parsed = JSON.parse(s);
                        if (parsed && typeof parsed === 'object') {
                          argsJson = parsed as unknown;
                        }
                      }
                    } catch {
                      /* ignore */
                    }
                  }
                  return {
                    id: tc.id || `call_${index}_${i}`,
                    type: 'function',
                    function: {
                      name: tc.function.name, // guaranteed string by isValidToolCall
                      arguments: argsStr,
                      ...(argsJson !== undefined ? { arguments_json: argsJson } : {}),
                    },
                  };
                }),
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
