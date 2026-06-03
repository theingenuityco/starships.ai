/**
 * OpenRouterClient
 *
 * A lean, standalone model client for the agent loop. Talks to an
 * OpenRouter-compatible chat-completions endpoint via the openai SDK, streams
 * the response, and accumulates one assistant message (content + tool calls +
 * reasoning + usage).
 *
 * Deliberately NOT in scope (host concerns, injected elsewhere if needed):
 * multi-provider routing/failover, attachment URL resolution, vision
 * augmentation. This client just turns messages + tools into one assistant turn.
 */

import OpenAI from 'openai';
import type {
  AssistantMessage,
  AssistantToolCall,
  ChatMessage,
  JsonObjectSchema,
  LlmExtras,
  ModelClientConfig,
  StepUsage,
} from '@/types';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/** A tool exposed to the model (OpenAI function-calling schema). */
export interface ModelTool {
  name: string;
  description: string;
  parameters: JsonObjectSchema;
}

export interface LlmCallInput {
  model: string;
  messages: ChatMessage[];
  tools: ModelTool[];
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean };
  extras?: LlmExtras;
}

export interface LlmCallResult {
  message: AssistantMessage;
  /** Provider finish reason: 'stop' | 'length' | 'tool_calls' | ... */
  finishReason: string;
  usage?: StepUsage;
}

/** Called for every streamed text delta so the host can forward it live. */
export type DeltaSink = (text: string) => void;

/** Minimal shape of a streamed chunk; OpenRouter adds reasoning fields beyond the SDK types. */
interface RawDelta {
  content?: string | null;
  reasoning?: string | null;
  reasoning_details?: unknown[];
  images?: unknown[];
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface RawChoice {
  delta?: RawDelta;
  finish_reason?: string | null;
}

interface RawChunk {
  choices?: RawChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  } | null;
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  args: string;
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Serialize the transcript into the OpenRouter/OpenAI wire shape. */
function toWireMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === 'assistant') {
      const hasToolCalls = !!(m.toolCalls && m.toolCalls.length > 0);
      // Tool-call-only turns must send content: null (not ""): several providers
      // (e.g. Anthropic via OpenRouter) reject an empty-string content there.
      const content = typeof m.content === 'string' && m.content.length === 0 && hasToolCalls ? null : (m.content ?? '');
      const wire: Record<string, unknown> = { role: 'assistant', content };
      if (m.reasoning) wire.reasoning = m.reasoning;
      if (m.reasoningDetails && m.reasoningDetails.length > 0) wire.reasoning_details = m.reasoningDetails;
      if (m.images && m.images.length > 0) wire.images = m.images;
      if (m.toolCalls && m.toolCalls.length > 0) {
        wire.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        }));
      }
      return wire;
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) };
    }
    const base: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.name) base.name = m.name;
    return base;
  });
}

function toWireTools(tools: ModelTool[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export class OpenRouterClient {
  private readonly client: OpenAI;

  constructor(
    config: ModelClientConfig,
    private readonly onDelta?: DeltaSink
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? DEFAULT_BASE_URL,
      ...(config.defaultHeaders ? { defaultHeaders: config.defaultHeaders } : {}),
    });
  }

  async call(input: LlmCallInput, signal?: AbortSignal): Promise<LlmCallResult> {
    const body: Record<string, unknown> = {
      model: input.model,
      messages: toWireMessages(input.messages),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (input.tools.length > 0) {
      body.tools = toWireTools(input.tools);
      body.tool_choice = 'auto';
    }
    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.maxTokens !== undefined) body.max_tokens = input.maxTokens;
    if (input.reasoning) body.reasoning = input.reasoning;
    if (input.extras?.modalities) body.modalities = input.extras.modalities;
    if (input.extras?.imageConfig) body.image_config = input.extras.imageConfig;
    if (input.extras?.plugins) body.plugins = input.extras.plugins;
    if (input.extras?.responseFormat) body.response_format = input.extras.responseFormat;

    const requestOpts: { signal?: AbortSignal; timeout?: number } = {};
    if (signal) requestOpts.signal = signal;
    if (input.timeout !== undefined) requestOpts.timeout = input.timeout;

    const stream = (await this.client.chat.completions.create(
      body as unknown as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
      requestOpts
    )) as unknown as AsyncIterable<RawChunk>;

    let content = '';
    let reasoning = '';
    const reasoningDetails: unknown[] = [];
    const images: unknown[] = [];
    const toolCallsByIndex = new Map<number, ToolCallAccumulator>();
    let finishReason = 'stop';
    let usage: StepUsage | undefined;

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage = {
          ...(typeof chunk.usage.prompt_tokens === 'number' ? { promptTokens: chunk.usage.prompt_tokens } : {}),
          ...(typeof chunk.usage.completion_tokens === 'number' ? { completionTokens: chunk.usage.completion_tokens } : {}),
          ...(typeof chunk.usage.total_tokens === 'number' ? { totalTokens: chunk.usage.total_tokens } : {}),
          ...(typeof chunk.usage.cost === 'number' ? { cost: chunk.usage.cost } : {}),
        };
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (!delta) continue;

      if (typeof delta.content === 'string' && delta.content.length > 0) {
        content += delta.content;
        this.onDelta?.(delta.content);
      }
      if (typeof delta.reasoning === 'string' && delta.reasoning.length > 0) {
        reasoning += delta.reasoning;
      }
      if (Array.isArray(delta.reasoning_details) && delta.reasoning_details.length > 0) {
        reasoningDetails.push(...delta.reasoning_details);
      }
      if (Array.isArray(delta.images) && delta.images.length > 0) {
        images.push(...delta.images);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const acc = toolCallsByIndex.get(tc.index) ?? { id: '', name: '', args: '' };
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (typeof tc.function?.arguments === 'string') acc.args += tc.function.arguments;
          toolCallsByIndex.set(tc.index, acc);
        }
      }
    }

    const toolCalls: AssistantToolCall[] = [...toolCallsByIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, acc]) => ({
        id: acc.id || `call_${index}`,
        name: acc.name,
        args: parseArgs(acc.args),
      }));

    const message: AssistantMessage = {
      role: 'assistant',
      content,
      ...(reasoning ? { reasoning } : {}),
      ...(reasoningDetails.length > 0 ? { reasoningDetails } : {}),
      ...(images.length > 0 ? { images } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };

    return { message, finishReason, usage };
  }
}
