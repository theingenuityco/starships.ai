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
import {
  Cacheable,
  CacheableSystemMessage,
  ContentBlock,
  LLMMessageRole,
  LLMResponse,
  LLMUsage,
  LlmMessage,
  LlmToolCall,
  MessageContent,
} from '@/types/llm';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';

// Typed view over the normalized streaming chunk we forward to the ConversationService
type NormalizedToolCallDelta = {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type NormalizedDelta = {
  content?: string;
  role?: string;
  toolCalls?: NormalizedToolCallDelta[];
};

type NormalizedMessage = {
  role?: string;
  content?: string;
  reasoning?: string;
  toolCalls?: Array<{
    id?: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

type NormalizedChoice = {
  index: number;
  finishReason?: string;
  delta?: NormalizedDelta;
  message?: NormalizedMessage;
};

type NormalizedUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  completionTokensDetails?: { reasoningTokens?: number };
};

type NormalizedChunk = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: NormalizedChoice[];
  usage?: NormalizedUsage;
};

export class LLM extends BaseNode<LlmParams> {
  private emittedToolCalls: Set<string> = new Set();
  private static readonly DEBUG_TOOLCALLS = false;

  constructor(params: LlmParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  /**
   * Compute a non-overlapping append by trimming any prefix of 'fragment' that
   * already exists as a suffix of 'base'. This mirrors the ConversationService
   * behavior to avoid duplicated reasoning/content fragments.
   */
  private static computeNonOverlappingAppend(base: string, fragment: string): string {
    if (!fragment) return '';
    const maxCheck = Math.min(base.length, fragment.length);
    for (let k = maxCheck; k > 0; k--) {
      if (base.endsWith(fragment.slice(0, k))) {
        return fragment.slice(k);
      }
    }
    return fragment;
  }

  /**
   * Execute the LLM request with streaming and optional input items
   * Uses OpenAI SDK for reliable streaming and tool call handling
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    let apiKey: string | null = null;

    // TODO: migrate LLM execution behind slug-based callConnector; for now, read
    // OpenRouter API key directly from process.env in the host environment.
    if (typeof process !== 'undefined') {
      apiKey = process.env.OPENROUTER_API_KEY ?? null;
    }
    if (!apiKey) {
      throw this.handleExecutionError(new Error('OpenRouter API key is required. Set OPENROUTER_API_KEY in the host environment.'));
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

      // Pass through OpenRouter/OpenAI unified reasoning configuration when provided
      if (params.reasoning && typeof params.reasoning === 'object') {
        // The official OpenAI types do not yet expose the `reasoning` field, so we extend at runtime.
        (requestOptions as OpenAI.Chat.ChatCompletionCreateParamsStreaming & { reasoning?: unknown }).reasoning = params.reasoning;
      }

      // Add function calling support if tools are provided
      if (params.tools && Array.isArray(params.tools) && params.tools.length > 0) {
        requestOptions.tools = this.convertToOpenAITools(params.tools);
        requestOptions.tool_choice = 'auto';
        // Prevent multiple tool calls within a single assistant response
        // OpenAI/compatible providers honor `parallel_tool_calls: false`
        requestOptions.parallel_tool_calls = false;
      } else {
        // No tools configured; leave provider defaults
      }

      // Condensed request log: essential params only, with truncated message previews
      // const truncate = (text: unknown, max = 160): string => {
      //   if (typeof text !== 'string') return typeof text === 'undefined' ? '' : '[non-text content]';
      //   const compact = text.replace(/\s+/g, ' ').trim();
      //   return compact.length > max ? `${compact.slice(0, max)}…` : compact;
      // };

      // const summarizedMessages = sourceMessages.map((m, i) => {
      //   const summary: {
      //     index: number;
      //     role: LLMMessageRole;
      //     contentPreview?: string;
      //     toolCalls?: string[];
      //   } = { index: i, role: m.role };

      //   if (typeof m.content === 'string') {
      //     summary.contentPreview = truncate(m.content);
      //   }
      //   if (Array.isArray(m.toolCalls)) {
      //     summary.toolCalls = m.toolCalls.map((tc) => tc.function.name).filter((name): name is string => Boolean(name));
      //   }
      //   return summary;
      // });

      // const requestSummary = {
      //   model: requestOptions.model,
      //   stream: requestOptions.stream === true,
      //   params: {
      //     temperature: typeof requestOptions.temperature === 'number' ? requestOptions.temperature : 'default',
      //     top_p: typeof requestOptions.top_p === 'number' ? requestOptions.top_p : 'default',
      //     max_tokens: typeof requestOptions.max_tokens === 'number' ? requestOptions.max_tokens : 'default',
      //     presence_penalty: typeof requestOptions.presence_penalty === 'number' ? requestOptions.presence_penalty : 'default',
      //     frequency_penalty: typeof requestOptions.frequency_penalty === 'number' ? requestOptions.frequency_penalty : 'default',
      //   },
      //   tools: requestOptions.tools
      //     ? {
      //         count: requestOptions.tools.length,
      //         parallel: requestOptions.parallel_tool_calls ?? false,
      //         choice: requestOptions.tool_choice ?? 'auto',
      //         slugs: requestOptions.tools
      //           .map((t) => (t.type === 'function' ? t.function.name : undefined))
      //           .filter((name): name is string => Boolean(name)),
      //       }
      //     : undefined,
      //   messages: summarizedMessages,
      // };

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
   * Convert ToolParams to OpenAI function calling format with caching
   * Adds cache_control to LAST tool definition (caches all tools as a group)
   * Uses tool.slug as the function name for consistent kebab-case format
   */
  private convertToOpenAITools(tools: ToolParams[]): Array<OpenAI.Chat.ChatCompletionTool & Cacheable> {
    if (!Array.isArray(tools) || tools.length === 0) {
      return [];
    }

    return tools.map((tool, index) => {
      const isLastTool = index === tools.length - 1;

      const toolDef: OpenAI.Chat.ChatCompletionTool & Cacheable = {
        type: 'function' as const,
        function: {
          name: tool.slug,
          description: tool.description,
          parameters: tool.parameters as Record<string, unknown>,
        },
      };

      // Add cache_control to last tool (caches ALL tool definitions)
      if (isLastTool) {
        toolDef.cache_control = { type: 'ephemeral' };
      }

      return toolDef;
    });
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

    // Helper to get string content (for roles that require string)
    const getStringContent = (): string => {
      return typeof contentVal === 'string' ? contentVal : contentVal[0]?.type === 'text' ? contentVal[0].text : '';
    };

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
        content: getStringContent(),
        tool_calls: toolCalls,
      } as OpenAI.Chat.ChatCompletionAssistantMessageParam;
    }

    if (role === 'tool') {
      const toolCallId = typeof m.toolCallId === 'string' ? m.toolCallId : '';
      return {
        role: 'tool',
        content: getStringContent(),
        tool_call_id: toolCallId,
      } as OpenAI.Chat.ChatCompletionToolMessageParam;
    }

    // SYSTEM MESSAGE: Add caching (universal for all OpenRouter providers)
    // Note: cache_control is an OpenRouter extension not in OpenAI's types
    if (role === 'system') {
      const message: CacheableSystemMessage = {
        role: 'system',
        content: [
          {
            type: 'text',
            text: getStringContent(),
            cache_control: { type: 'ephemeral' },
          },
        ],
      };
      return message as OpenAI.Chat.ChatCompletionSystemMessageParam;
    }

    // USER MESSAGE: Support multimodal content (images, etc.)
    // If content is already an array of ContentBlocks, pass directly
    // OpenAI SDK supports both string and ContentPart[] for user messages
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
      // Preserve content as-is if it's a string or array (multimodal content blocks)
      // Only stringify if it's neither (fallback for unexpected types)
      const content: MessageContent =
        typeof obj.content === 'string'
          ? obj.content
          : Array.isArray(obj.content)
            ? (obj.content as ContentBlock[])
            : JSON.stringify(obj.content ?? '');

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
    // Track provider-snapshot arguments per tool call index if present
    const providerArgs: string[] = [];
    // Micro-buffer and state for token-safe flushing per tool call index
    const argStaging: string[] = [];
    const argState: Array<{ inStr: boolean; esc: boolean; depth: number }> = [];

    const flushSafePrefix = (s: string, st: { inStr: boolean; esc: boolean; depth: number }): number => {
      let safeIdx = 0;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (st.esc) {
          st.esc = false;
          continue;
        }
        if (st.inStr) {
          if (ch === '\\') {
            st.esc = true;
          } else if (ch === '"') {
            st.inStr = false;
          }
        } else {
          if (ch === '"') {
            st.inStr = true;
          } else if (ch === '{' || ch === '[') {
            st.depth++;
          } else if (ch === '}' || ch === ']') {
            if (st.depth > 0) st.depth--;
            // Closing a structure is safe to flush up to
            safeIdx = i + 1;
          } else if (ch === ',') {
            // Comma between elements/props outside string is a safe boundary
            safeIdx = i + 1;
          }
        }
      }
      return safeIdx;
    };

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
          const piece = choice.delta.content;
          content += piece;
        }

        // Accumulate reasoning text from providers that support reasoning-capable models
        try {
          const extractReasoning = (node: unknown): string => {
            if (!node || typeof node !== 'object') return '';
            const rec = node as Record<string, unknown>;
            const parts: string[] = [];

            // Unified fields (reasoning / thinking)
            const raw =
              (rec as { reasoning?: unknown; thinking?: unknown }).reasoning ??
              (rec as { reasoning?: unknown; thinking?: unknown }).thinking;

            const appendFromRaw = (r: unknown): void => {
              if (!r) return;
              if (typeof r === 'string') {
                parts.push(r);
                return;
              }
              if (typeof r === 'object' && r !== null) {
                const obj = r as Record<string, unknown>;
                if (typeof obj.content === 'string') parts.push(obj.content);
                const tokens = obj.tokens;
                if (Array.isArray(tokens)) {
                  for (const t of tokens as unknown[]) {
                    if (t && typeof t === 'object') {
                      const tr = t as Record<string, unknown>;
                      const text = typeof tr.text === 'string' ? tr.text : '';
                      const c = typeof tr.content === 'string' ? tr.content : '';
                      if (text) parts.push(text);
                      else if (c) parts.push(c);
                    }
                  }
                }
              }
              if (Array.isArray(r)) {
                for (const p of r as unknown[]) {
                  if (p && typeof p === 'object') {
                    const pr = p as Record<string, unknown>;
                    const text = typeof pr.text === 'string' ? pr.text : '';
                    const c = typeof pr.content === 'string' ? pr.content : '';
                    if (text) parts.push(text);
                    else if (c) parts.push(c);
                  }
                }
              }
            };

            appendFromRaw(raw);

            // OpenRouter unified 'reasoning_details' chunks (if present)
            const details = (rec as { reasoning_details?: unknown }).reasoning_details;
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
          };

          // Prefer delta-level reasoning; fall back to any message snapshot if present
          const fromDelta = extractReasoning((choice as unknown as { delta?: unknown }).delta);
          const fromMessage = extractReasoning((choice as unknown as { message?: unknown }).message);
          const chunkReasoning = fromDelta || fromMessage;
          if (chunkReasoning) {
            const append = LLM.computeNonOverlappingAppend(reasoning, chunkReasoning);
            if (append) {
              reasoning += append;
            }
          }
        } catch {
          // Non-fatal: if reasoning extraction fails, continue without disrupting content/tool streaming
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
              const frag = toolCallDelta.function.arguments;
              // Initialize staging and state
              if (typeof argStaging[index] !== 'string') argStaging[index] = '';
              if (!argState[index]) argState[index] = { inStr: false, esc: false, depth: 0 };
              argStaging[index] = argStaging[index] + frag;
              const base = typeof target.function.arguments === 'string' ? target.function.arguments : '';
              const st = argState[index];
              const cut = flushSafePrefix(argStaging[index], st);
              if (cut > 0) {
                const flush = argStaging[index].slice(0, cut);
                target.function.arguments = base + flush;
                argStaging[index] = argStaging[index].slice(cut);
                if (LLM.DEBUG_TOOLCALLS) {
                  try {
                    console.debug('[LLM] tool_call.delta', {
                      index,
                      id: toolCallDelta.id,
                      name: toolCallDelta.function?.name,
                      argsAdded: flush.length,
                      argsTotal: (target.function.arguments as string).length,
                    });
                  } catch {
                    /* non-fatal */
                  }
                }
              }
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

          // Synthesize snapshot of current toolCalls into choices[0].message.toolCalls so consumers
          // can render incremental arguments even when provider doesn't emit delta.tool_calls.
          try {
            if (Array.isArray(normalizedChunk.choices) && normalizedChunk.choices.length > 0) {
              const choice0 = normalizedChunk.choices[0];
              // Preserve provider-snapshot toolCalls if present, and capture their arguments for final parsing fallback
              try {
                const msg = (choice0 as unknown as { message?: { toolCalls?: Array<{ function?: { arguments?: unknown } }> } }).message;
                if (msg && Array.isArray(msg.toolCalls)) {
                  for (let i = 0; i < msg.toolCalls.length; i++) {
                    const a =
                      msg.toolCalls[i] && msg.toolCalls[i].function
                        ? (msg.toolCalls[i].function as { arguments?: unknown }).arguments
                        : undefined;
                    if (typeof a === 'string' && a.length > 0) {
                      providerArgs[i] = a;
                    }
                  }
                }
              } catch {
                /* noop */
              }
              // Synthesize toolCalls snapshot
              const current: NonNullable<NormalizedMessage['toolCalls']> = toolCalls
                .filter((tc) => tc.function.name && tc.function.name.length > 0)
                .map((tc) => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: { name: tc.function.name, arguments: tc.function.arguments },
                }));
              // Always include an authoritative message.content snapshot to preserve correct ordering on the client
              // This is the cumulatively accumulated content so far
              const existing = (choice0 as unknown as { message?: NormalizedMessage }).message ?? ({} as NormalizedMessage);
              const nextMessage: NormalizedMessage = { ...(existing as NormalizedMessage) } as NormalizedMessage;
              (nextMessage as unknown as { content?: string }).content = content;
              // Only synthesize toolCalls if provider didn't supply them
              if (!existing.toolCalls || (Array.isArray(existing.toolCalls) && existing.toolCalls.length === 0)) {
                if (current.length > 0) nextMessage.toolCalls = current;
              }
              (choice0 as unknown as { message?: NormalizedMessage }).message = nextMessage;
            }
          } catch {
            void 0;
          }

          await eventCallback({
            type: 'content_chunk',
            timestamp: new Date().toISOString(),
            executionDepth,
            data: { chunk: normalizedChunk as unknown as Record<string, unknown> },
          });
        }
      }

      // Flush any remaining staged tool-call fragments at end of stream
      try {
        for (let i = 0; i < toolCalls.length; i++) {
          if (typeof argStaging[i] === 'string' && argStaging[i].length > 0) {
            toolCalls[i].function.arguments += argStaging[i];
            argStaging[i] = '';
          }
        }
      } catch {
        /* noop */
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

          const prefer =
            typeof providerArgs[i] === 'string' && providerArgs[i].length >= (tc.function.arguments?.length || 0)
              ? providerArgs[i]
              : tc.function.arguments;
          if (prefer) {
            try {
              argsObj = JSON.parse(prefer);
            } catch (parseError) {
              console.error(`[LLM FINAL] Failed to parse tool '${tc.function.name}' arguments:`, {
                argsLength: prefer.length,
                error: parseError instanceof Error ? parseError.message : String(parseError),
              });
              // Log full args for debugging
              console.error(`[LLM FINAL] Full arguments:`, prefer);
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
  private normalizeChunkToolCalls(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): NormalizedChunk {
    if (!chunk.choices || !Array.isArray(chunk.choices)) {
      return chunk as unknown as NormalizedChunk;
    }

    const normalizedChoices: NormalizedChoice[] = chunk.choices.map((choice) => {
      const normalized: NormalizedChoice = {
        index: choice.index,
      };

      // Normalize finish_reason → finishReason
      if (choice.finish_reason) {
        normalized.finishReason = choice.finish_reason;
      }

      // Normalize delta object
      if (choice.delta && typeof choice.delta === 'object') {
        const delta = choice.delta as Record<string, unknown>;
        const normalizedDelta: NormalizedDelta = {};

        // Copy standard fields
        if (typeof delta.content === 'string') normalizedDelta.content = delta.content as string;
        if (typeof delta.role === 'string') normalizedDelta.role = delta.role as string;

        // Normalize tool_calls → toolCalls
        if ('tool_calls' in delta && Array.isArray(delta.tool_calls)) {
          normalizedDelta.toolCalls = delta.tool_calls;
        }

        // Handle any other delta fields
        Object.keys(delta).forEach((key) => {
          if (!['content', 'role', 'tool_calls'].includes(key)) {
            (normalizedDelta as unknown as Record<string, unknown>)[key] = delta[key];
          }
        });

        normalized.delta = normalizedDelta;
      }

      return normalized;
    });

    // Normalize usage from snake_case to camelCase
    let normalizedUsage: NormalizedUsage | undefined;
    if (chunk.usage) {
      const base: NormalizedUsage = {
        promptTokens: chunk.usage.prompt_tokens ?? 0,
        completionTokens: chunk.usage.completion_tokens ?? 0,
        totalTokens: chunk.usage.total_tokens ?? 0,
      };
      if (typeof chunk.usage.completion_tokens_details === 'object' && chunk.usage.completion_tokens_details !== null) {
        const details = chunk.usage.completion_tokens_details as Record<string, unknown>;
        const r = details?.reasoning_tokens;
        base.completionTokensDetails = { reasoningTokens: typeof r === 'number' ? r : 0 };
      }
      normalizedUsage = base;
    }

    return {
      id: chunk.id,
      object: chunk.object,
      created: chunk.created,
      model: chunk.model,
      choices: normalizedChoices,
      // Include normalized usage if present
      ...(normalizedUsage ? { usage: normalizedUsage } : {}),
    } as NormalizedChunk;
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

    // Messages must be an array with at least one entry; upstream-input fallback is not relied on.
    const messagesError = this.validateArrayParameter(params.messages, 'Messages', 1);
    if (messagesError) errors.push(messagesError);

    // Tools validation - handle both array and string (template expression)
    if (params.tools !== undefined && !Array.isArray(params.tools) && typeof params.tools !== 'string') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Tools must be an array of ToolParams or a template expression string',
      });
    }

    // API key validation moved to runtime via host-level callbacks only

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
