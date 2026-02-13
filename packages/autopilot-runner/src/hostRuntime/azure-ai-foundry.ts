import type { LlmHostRequest } from '@starships/autopilot';
import { CancelledError } from '@starships/autopilot';
import type { AzureAiFoundryRuntimeConfig } from './RunnerHostRuntime';

export interface InvokeAzureAiFoundryOptions {
  azure?: AzureAiFoundryRuntimeConfig;
  signal?: AbortSignal;
}

type AzureChatCompletionTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

const summarizeRequestForLogs = (request: LlmHostRequest, providerModelId: string): Record<string, unknown> => {
  const safeTextLen = (v: unknown): number => (typeof v === 'string' ? v.length : 0);
  const messages = Array.isArray(request.messages) ? (request.messages as unknown[]) : [];
  let totalTextChars = 0;
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const rec = m as Record<string, unknown>;
    const c = rec.content;
    if (typeof c === 'string') {
      totalTextChars += c.length;
    } else if (Array.isArray(c)) {
      for (const part of c as unknown[]) {
        if (!part || typeof part !== 'object') continue;
        const p = part as Record<string, unknown>;
        if (p.type === 'text') totalTextChars += safeTextLen(p.text);
      }
    }
  }

  return {
    model: providerModelId,
    wantsStream: typeof request.stream === 'boolean' ? request.stream : true,
    modalities: Array.isArray(request.modalities) ? request.modalities : undefined,
    toolsCount: Array.isArray(request.tools) ? request.tools.length : 0,
    messagesCount: messages.length,
    totalTextChars,
  };
};

const summarizeProviderError = (err: unknown): Record<string, unknown> => {
  const e =
    err && (typeof err === 'object' || typeof err === 'function') ? (err as Record<string, unknown> & { cause?: unknown }) : undefined;
  const cause = e?.cause;
  const pick = (x: unknown): Record<string, unknown> => {
    if (!x || (typeof x !== 'object' && typeof x !== 'function')) return {};
    const rec = x as Record<string, unknown>;
    return {
      name: typeof rec.name === 'string' ? rec.name : undefined,
      message: typeof rec.message === 'string' ? rec.message : undefined,
      code: typeof rec.code === 'string' ? rec.code : undefined,
      status: typeof rec.status === 'number' ? rec.status : undefined,
    };
  };
  return {
    error: pick(e),
    cause: pick(cause),
  };
};

const buildEndpoint = (endpoint: string, apiVersion?: string): string => {
  if (!/^https?:\/\//i.test(endpoint)) {
    throw new Error('Azure AI Foundry endpoint must be an absolute http(s) URL');
  }
  const base = endpoint.replace(/\/+$/, '');
  const trimmed = base.endsWith('/models') ? base.slice(0, -'/models'.length) : base;
  const version = typeof apiVersion === 'string' ? apiVersion.trim() : '';
  const path = `${trimmed}/models/chat/completions`;
  return version.length > 0 ? `${path}?api-version=${encodeURIComponent(version)}` : path;
};

const buildTools = (request: LlmHostRequest): AzureChatCompletionTool[] | undefined => {
  if (!Array.isArray(request.tools) || request.tools.length === 0) return undefined;
  return request.tools.map((tool) => {
    const t = tool as unknown as {
      name?: string;
      slug?: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
    const functionName =
      (typeof t.slug === 'string' && t.slug.trim().length > 0
        ? t.slug.trim()
        : typeof t.name === 'string' && t.name.trim().length > 0
          ? t.name.trim()
          : 'tool') || 'tool';

    return {
      type: 'function',
      function: {
        name: functionName,
        description: typeof t.description === 'string' ? t.description : '',
        parameters: t.parameters as Record<string, unknown> | undefined,
      },
    };
  });
};

const isAnthropicRequest = (request: LlmHostRequest, providerModelId: string): boolean => {
  return (
    (typeof providerModelId === 'string' && providerModelId.toLowerCase().includes('claude')) ||
    (typeof request.model === 'string' && request.model.startsWith('anthropic/'))
  );
};

const toTextFromContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = content as Array<{ type?: unknown; text?: unknown }>;
  return parts
    .map((p) => (p && p.type === 'text' && typeof p.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n');
};

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

type AnthropicMessage = { role: 'user' | 'assistant'; content: AnthropicContentBlock[] };

const computeThinkingBudgetTokens = (
  request: LlmHostRequest,
  override?: {
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    exclude?: boolean;
    enabled?: boolean;
  }
): number => {
  const reasoningCfg =
    override ??
    (request.reasoning as
      | {
          effort?: 'low' | 'medium' | 'high';
          max_tokens?: number;
          exclude?: boolean;
          enabled?: boolean;
        }
      | undefined);
  if (!reasoningCfg || reasoningCfg.exclude === true || reasoningCfg.enabled === false) return 0;
  const requestedBudget = typeof reasoningCfg.max_tokens === 'number' ? reasoningCfg.max_tokens : undefined;
  let budgetTokens =
    typeof requestedBudget === 'number' && Number.isFinite(requestedBudget) && requestedBudget > 0
      ? Math.floor(requestedBudget)
      : reasoningCfg.effort === 'low'
        ? 256
        : reasoningCfg.effort === 'high'
          ? 2048
          : 1024;

  const maxTokens = typeof request.maxTokens === 'number' && Number.isFinite(request.maxTokens) ? Math.floor(request.maxTokens) : undefined;
  if (typeof maxTokens === 'number') {
    if (maxTokens <= 1) {
      budgetTokens = 0;
    } else if (budgetTokens >= maxTokens) {
      budgetTokens = Math.max(1, maxTokens - 1);
    }
  }
  return budgetTokens;
};

const parseToolArguments = (raw: unknown): Record<string, unknown> => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const buildAnthropicContentBlocksFromOpenAIMessage = async (message: {
  role?: string;
  content?: unknown;
  tool_calls?: unknown;
  tool_call_id?: unknown;
}): Promise<AnthropicContentBlock[]> => {
  const blocks: AnthropicContentBlock[] = [];

  const content = message.content;
  if (typeof content === 'string') {
    const text = content.trim().length > 0 ? content : ' ';
    blocks.push({ type: 'text', text });
  } else if (Array.isArray(content)) {
    for (const part of content as Array<{ type?: unknown; text?: unknown; image_url?: { url?: unknown } }>) {
      if (part?.type === 'text') {
        const text = typeof part.text === 'string' && part.text.trim().length > 0 ? part.text : ' ';
        blocks.push({ type: 'text', text });
      } else if (part?.type === 'image_url' && part.image_url?.url) {
        const rawUrl = String(part.image_url.url);
        const dataMatch = rawUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        try {
          if (dataMatch) {
            const mediaType = dataMatch[1];
            const data = dataMatch[2];
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data },
            });
          } else {
            const resp = await fetch(rawUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const ab = await resp.arrayBuffer();
            const bytes = Buffer.from(ab);
            const extMatch = rawUrl.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
            const mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: bytes.toString('base64') },
            });
          }
        } catch {
          blocks.push({ type: 'text', text: `Image: ${rawUrl}` });
        }
      }
    }
  }

  const toolCalls = message.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls as Array<{ id?: unknown; function?: { name?: unknown; arguments?: unknown } }>) {
      const id = typeof tc.id === 'string' ? tc.id : `tool_${Math.random().toString(36).slice(2, 8)}`;
      const name = typeof tc.function?.name === 'string' ? tc.function?.name : 'tool';
      const input = parseToolArguments(tc.function?.arguments);
      blocks.push({
        type: 'tool_use',
        id,
        name,
        input,
      });
    }
  }

  return blocks.length > 0 ? blocks : [{ type: 'text', text: ' ' }];
};
const buildAnthropicPayload = async (request: LlmHostRequest, providerModelId: string): Promise<Record<string, unknown>> => {
  const messages = Array.isArray(request.messages)
    ? (request.messages as Array<{ role?: string; content?: unknown; tool_calls?: unknown; tool_call_id?: unknown }>)
    : [];
  const systemParts: string[] = [];
  const outMessages: AnthropicMessage[] = [];

  for (const m of messages) {
    const role = m?.role;
    if (role === 'system') {
      const txt = toTextFromContent(m?.content);
      if (txt) systemParts.push(txt);
      continue;
    }

    if (role === 'tool') {
      const toolUseId = typeof m.tool_call_id === 'string' ? m.tool_call_id : '';
      const contentText = toTextFromContent(m?.content);
      outMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId || 'tool_result',
            content: contentText || '',
          },
        ],
      });
      continue;
    }

    const mappedRole = role === 'assistant' ? 'assistant' : 'user';
    const blocks = await buildAnthropicContentBlocksFromOpenAIMessage(m);
    outMessages.push({ role: mappedRole, content: blocks });
  }

  let maxTokens = typeof request.maxTokens === 'number' && Number.isFinite(request.maxTokens) ? Math.floor(request.maxTokens) : 1024;
  const payload: Record<string, unknown> = {
    model: providerModelId,
    messages: outMessages,
    max_tokens: maxTokens,
  };
  const hasAssistantHistory = messages.some((m) => m?.role === 'assistant');
  let thinkingBudgetTokens = computeThinkingBudgetTokens(request);
  if (hasAssistantHistory) {
    thinkingBudgetTokens = 0;
  }
  if (systemParts.length > 0) {
    payload.system = systemParts.join('\n');
  }
  if (typeof request.temperature === 'number') payload.temperature = request.temperature;
  if (typeof request.topP === 'number') payload.top_p = request.topP;

  if (thinkingBudgetTokens > 0) {
    // Anthropic requires max_tokens > thinking.budget_tokens.
    if (maxTokens <= thinkingBudgetTokens) {
      if (maxTokens <= 1) {
        thinkingBudgetTokens = 0;
      } else {
        maxTokens = thinkingBudgetTokens + 1;
        payload.max_tokens = maxTokens;
      }
    }
    if (thinkingBudgetTokens > 0) {
      payload.thinking = { type: 'enabled', budget_tokens: thinkingBudgetTokens };
      // Anthropic requires temperature=1 when thinking is enabled; avoid top_p conflicts.
      payload.temperature = 1;
      delete payload.top_p;
    }
  }

  if (Array.isArray(request.tools) && request.tools.length > 0) {
    payload.tools = request.tools.map((tool) => {
      const t = tool as unknown as { name?: string; slug?: string; description?: string; parameters?: Record<string, unknown> };
      const name =
        (typeof t.slug === 'string' && t.slug.trim().length > 0
          ? t.slug.trim()
          : typeof t.name === 'string' && t.name.trim().length > 0
            ? t.name.trim()
            : 'tool') || 'tool';
      return {
        name,
        description: typeof t.description === 'string' ? t.description : '',
        input_schema: t.parameters as Record<string, unknown> | undefined,
      };
    });
  }

  return payload;
};

async function* streamAnthropicSse(resp: Response, signal: AbortSignal | undefined, canonicalModel: string): AsyncIterable<unknown> {
  if (!resp.body) {
    throw new Error('Azure AI Foundry response body missing');
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneStreaming = false;
  let usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;
  const toolUseStatesByIndex: Record<number, { id: string; name: string; args: string }> = {};

  const processBuffer = async function* (): AsyncIterable<unknown> {
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLines = rawEvent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''));

      if (dataLines.length > 0) {
        const data = dataLines.join('\n').trim();
        if (data === '[DONE]') {
          doneStreaming = true;
          return;
        }
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const type = parsed.type;
          if (type === 'content_block_start') {
            const index =
              typeof (parsed as { index?: unknown }).index === 'number'
                ? (parsed as { index: number }).index
                : typeof (parsed as { content_block_index?: unknown }).content_block_index === 'number'
                  ? (parsed as { content_block_index: number }).content_block_index
                  : 0;
            const contentBlock = (parsed as { content_block?: unknown }).content_block as
              | { type?: unknown; id?: unknown; name?: unknown }
              | undefined;
            if (contentBlock?.type === 'tool_use') {
              const toolId = typeof contentBlock.id === 'string' ? contentBlock.id : `tool_${index}`;
              const name = typeof contentBlock.name === 'string' ? contentBlock.name : 'tool';
              const toolUseStates = toolUseStatesByIndex;
              toolUseStates[index] = { id: toolId, name, args: '' };
              yield {
                id: 'anthropic-stream',
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: (parsed as { model?: unknown }).model ?? canonicalModel,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index,
                          id: toolId,
                          type: 'function',
                          function: { name, arguments: '' },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              };
            }
          }
          if (type === 'content_block_delta') {
            const delta = parsed.delta as { type?: unknown; text?: unknown; partial_json?: unknown } | undefined;
            const index =
              typeof (parsed as { index?: unknown }).index === 'number'
                ? (parsed as { index: number }).index
                : typeof (parsed as { content_block_index?: unknown }).content_block_index === 'number'
                  ? (parsed as { content_block_index: number }).content_block_index
                  : 0;
            if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
              yield {
                id: 'anthropic-stream',
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: (parsed as { model?: unknown }).model ?? canonicalModel,
                choices: [
                  {
                    index: 0,
                    delta: { content: delta.text },
                    finish_reason: null,
                  },
                ],
              };
            }
            if (
              (delta?.type === 'thinking_delta' || delta?.type === 'reasoning_delta') &&
              ((delta as { thinking?: unknown }).thinking || delta?.text)
            ) {
              const reasoningText =
                typeof (delta as { thinking?: unknown }).thinking === 'string'
                  ? ((delta as { thinking: string }).thinking as string)
                  : typeof delta?.text === 'string'
                    ? delta.text
                    : '';
              if (reasoningText.length > 0) {
                yield {
                  id: 'anthropic-stream',
                  object: 'chat.completion.chunk',
                  created: Date.now(),
                  model: (parsed as { model?: unknown }).model ?? canonicalModel,
                  choices: [
                    {
                      index: 0,
                      delta: { reasoning: reasoningText },
                      finish_reason: null,
                    },
                  ],
                };
              }
            }
            if (delta?.type === 'input_json_delta') {
              const state = toolUseStatesByIndex[index];
              const fragment = typeof delta.partial_json === 'string' ? delta.partial_json : '';
              if (state && fragment.length > 0) {
                state.args += fragment;
                yield {
                  id: 'anthropic-stream',
                  object: 'chat.completion.chunk',
                  created: Date.now(),
                  model: (parsed as { model?: unknown }).model ?? canonicalModel,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index,
                            id: state.id,
                            type: 'function',
                            function: {
                              name: state.name,
                              arguments: fragment,
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                };
              }
            }
          }
          if (type === 'message_stop') {
            doneStreaming = true;
          }
          const u = (parsed as { usage?: unknown }).usage as { input_tokens?: unknown; output_tokens?: unknown } | undefined;
          if (u && (typeof u.input_tokens === 'number' || typeof u.output_tokens === 'number')) {
            const inputTokens = typeof u.input_tokens === 'number' ? u.input_tokens : undefined;
            const outputTokens = typeof u.output_tokens === 'number' ? u.output_tokens : undefined;
            const totalTokens =
              typeof inputTokens === 'number' && typeof outputTokens === 'number' ? inputTokens + outputTokens : undefined;
            usage = {
              ...(typeof inputTokens === 'number' ? { input_tokens: inputTokens } : {}),
              ...(typeof outputTokens === 'number' ? { output_tokens: outputTokens } : {}),
              ...(typeof totalTokens === 'number' ? { total_tokens: totalTokens } : {}),
            };
          }
        } catch {
          // Ignore malformed chunks.
        }
      }
      idx = buffer.indexOf('\n\n');
    }
  };

  while (true) {
    if (signal?.aborted) {
      throw new CancelledError('cancelled');
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    yield* processBuffer();
    if (doneStreaming) break;
  }

  if (usage) {
    yield {
      id: 'anthropic-stream',
      object: 'chat.completion.chunk',
      created: Date.now(),
      model: canonicalModel,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
        completion_tokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
        total_tokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : 0,
      },
    };
  }
}

const wrapAnthropicNonStreamAsOneChunk = (completion: Record<string, unknown>, canonicalModel: string): AsyncIterable<unknown> => {
  const toolCalls: Array<{
    id?: string;
    type: 'function';
    function: { name: string; arguments: string };
  }> = [];
  const reasoningParts: string[] = [];
  const content = Array.isArray(completion.content)
    ? (completion.content as Array<{ type?: unknown; text?: unknown; name?: unknown; id?: unknown; input?: unknown; thinking?: unknown }>)
        .map((c) => {
          if (!c || typeof c !== 'object') return '';
          if (c.type === 'text' && typeof c.text === 'string') return c.text;
          if (c.type === 'thinking' && typeof (c as { thinking?: unknown }).thinking === 'string') {
            reasoningParts.push((c as { thinking: string }).thinking);
            return '';
          }
          if (c.type === 'tool_use') {
            const name = typeof c.name === 'string' ? c.name : 'tool';
            const id = typeof c.id === 'string' ? c.id : undefined;
            let args = '{}';
            try {
              args = JSON.stringify((c as { input?: unknown }).input ?? {});
            } catch {
              args = '{}';
            }
            toolCalls.push({
              id,
              type: 'function',
              function: { name, arguments: args },
            });
            return '';
          }
          return '';
        })
        .filter(Boolean)
        .join('')
    : '';
  const usage = completion.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  const oneChunk = {
    id: completion.id,
    object: completion.object ?? 'chat.completion',
    created: completion.created,
    model: canonicalModel || completion.model,
    usage: usage
      ? {
          prompt_tokens: usage.input_tokens ?? 0,
          completion_tokens: usage.output_tokens ?? 0,
          total_tokens:
            typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number'
              ? usage.input_tokens + usage.output_tokens
              : 0,
        }
      : undefined,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          reasoning: reasoningParts.length > 0 ? reasoningParts.join('') : undefined,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finish_reason: 'stop',
      },
    ],
  };
  async function* gen() {
    yield oneChunk;
  }
  return gen();
};

const wrapNonStreamAsOneChunk = (completion: Record<string, unknown>, canonicalModel?: string): AsyncIterable<unknown> => {
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const oneChunk = {
    id: completion.id,
    object: completion.object,
    created: completion.created,
    model: typeof canonicalModel === 'string' && canonicalModel.trim().length > 0 ? canonicalModel : completion.model,
    usage: completion.usage,
    choices: [
      {
        index: 0,
        message: firstChoice?.message,
        finish_reason: firstChoice?.finish_reason,
      },
    ],
  };
  async function* gen() {
    yield oneChunk;
  }
  return gen();
};

async function* streamSse(resp: Response, signal?: AbortSignal, canonicalModel?: string): AsyncIterable<unknown> {
  if (!resp.body) {
    throw new Error('Azure AI Foundry response body missing');
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneStreaming = false;

  const processBuffer = async function* (): AsyncIterable<unknown> {
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLines = rawEvent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''));

      if (dataLines.length > 0) {
        const data = dataLines.join('\n').trim();
        if (data === '[DONE]') {
          doneStreaming = true;
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === 'object' && typeof canonicalModel === 'string' && canonicalModel.trim().length > 0) {
            yield { ...(parsed as Record<string, unknown>), model: canonicalModel };
          } else {
            yield parsed;
          }
        } catch {
          // Ignore malformed chunks; continue streaming.
        }
      }
      idx = buffer.indexOf('\n\n');
    }
  };

  while (true) {
    if (signal?.aborted) {
      throw new CancelledError('cancelled');
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    yield* processBuffer();
    if (doneStreaming) return;
  }

  if (!doneStreaming && buffer.trim().length > 0) {
    const rawEvent = buffer;
    buffer = '';
    const dataLines = rawEvent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''));
    if (dataLines.length > 0) {
      const data = dataLines.join('\n').trim();
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === 'object' && typeof canonicalModel === 'string' && canonicalModel.trim().length > 0) {
            yield { ...(parsed as Record<string, unknown>), model: canonicalModel };
          } else {
            yield parsed;
          }
        } catch {
          // Ignore malformed trailing chunk.
        }
      }
    }
  }
}

export async function invokeAzureAiFoundry(
  request: LlmHostRequest,
  providerModelId: string,
  options: InvokeAzureAiFoundryOptions = {}
): Promise<AsyncIterable<unknown>> {
  const azureConfig = options.azure;
  const apiKey = azureConfig?.apiKey ?? process.env.AZURE_AI_FOUNDRY_API_KEY;
  const endpoint = azureConfig?.endpoint ?? process.env.AZURE_AI_FOUNDRY_ENDPOINT;
  const apiVersion = azureConfig?.apiVersion ?? process.env.AZURE_AI_FOUNDRY_API_VERSION;
  if (!apiKey || !endpoint) {
    throw new Error(
      'Azure AI Foundry API key and endpoint are required. Provide them via azureAiFoundry in RunnerHostRuntimeOptions or set AZURE_AI_FOUNDRY_API_KEY and AZURE_AI_FOUNDRY_ENDPOINT in the runner environment.'
    );
  }

  if (isAnthropicRequest(request, providerModelId)) {
    const anthropicUrl = endpoint.replace(/\/+$/, '') + '/anthropic/v1/messages';
    const payload = await buildAnthropicPayload(request, providerModelId);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    const wantsStream = typeof request.stream === 'boolean' ? request.stream : true;
    const isImageRequest = Array.isArray(request.modalities) && request.modalities.includes('image');
    const useStream = wantsStream && !isImageRequest;

    let resp: Response;
    try {
      resp = await fetch(anthropicUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, stream: useStream }),
        signal: options.signal,
      });
    } catch (e) {
      if (options.signal?.aborted) throw new CancelledError('cancelled');
      console.error('[RunnerHostRuntime.llm] Azure AI Foundry fetch failed (anthropic)', {
        request: summarizeRequestForLogs(request, providerModelId),
        provider: summarizeProviderError(e),
      });
      throw e;
    }

    if (!resp.ok) {
      const raw = await resp.text().catch(() => '');
      const bodySnippet = raw ? raw.slice(0, 1200) : '';
      console.error('[RunnerHostRuntime.llm] Azure AI Foundry error (anthropic)', {
        request: summarizeRequestForLogs(request, providerModelId),
        status: resp.status,
        statusText: resp.statusText,
        bodySnippet,
      });
      throw new Error(`Azure AI Foundry responded with ${resp.status} ${resp.statusText}`);
    }

    if (useStream) {
      return streamAnthropicSse(resp, options.signal, String(request.model || providerModelId));
    }

    const completion = (await resp.json()) as Record<string, unknown>;
    return wrapAnthropicNonStreamAsOneChunk(completion, String(request.model || providerModelId));
  }

  const url = buildEndpoint(endpoint, apiVersion);
  const wantsStream = typeof request.stream === 'boolean' ? request.stream : true;
  const modalities = request.modalities;
  const isImageRequest = Array.isArray(modalities) && modalities.includes('image');

  const payload: Record<string, unknown> = {
    model: providerModelId,
    // Azure OpenAI chat/completions schema is strict; drop any OpenRouter-specific fields
    // (e.g., assistant reasoning/reasoning_details) that may be present on messages.
    messages: Array.isArray(request.messages)
      ? (request.messages as Array<Record<string, unknown>>).map((m) => {
          const role = typeof m?.role === 'string' ? m.role : 'user';
          const content = (m as { content?: unknown })?.content;
          const out: Record<string, unknown> = { role, content };
          const name = typeof m?.name === 'string' ? m.name : undefined;
          if (name) out.name = name;
          const toolCalls = (m as { tool_calls?: unknown }).tool_calls;
          if (Array.isArray(toolCalls)) out.tool_calls = toolCalls;
          const toolCallIdRaw = (m as { tool_call_id?: unknown }).tool_call_id;
          const toolCallId = typeof toolCallIdRaw === 'string' ? toolCallIdRaw : undefined;
          if (toolCallId) out.tool_call_id = toolCallId;
          return out;
        })
      : request.messages,
  };

  if (Array.isArray(modalities) && modalities.length > 0) {
    payload.modalities = modalities;
  }
  if (typeof request.temperature === 'number') payload.temperature = request.temperature;
  if (typeof request.maxTokens === 'number') payload.max_tokens = request.maxTokens;
  if (typeof request.topP === 'number') payload.top_p = request.topP;
  if (typeof request.frequencyPenalty === 'number') payload.frequency_penalty = request.frequencyPenalty;
  if (typeof request.presencePenalty === 'number') payload.presence_penalty = request.presencePenalty;

  const tools = buildTools(request);
  if (tools) payload.tools = tools;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'api-key': apiKey,
    ...(azureConfig?.defaultHeaders ?? {}),
  };

  if (isImageRequest || !wantsStream) {
    payload.stream = false;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: options.signal,
      });
    } catch (e) {
      if (options.signal?.aborted) throw new CancelledError('cancelled');
      console.error('[RunnerHostRuntime.llm] Azure AI Foundry fetch failed (non-stream)', {
        request: summarizeRequestForLogs(request, providerModelId),
        provider: summarizeProviderError(e),
      });
      throw e;
    }

    if (!resp.ok) {
      const raw = await resp.text().catch(() => '');
      const bodySnippet = raw ? raw.slice(0, 1200) : '';
      const err = new Error(`Azure AI Foundry responded with ${resp.status} ${resp.statusText}`);
      console.error('[RunnerHostRuntime.llm] Azure AI Foundry error (non-stream)', {
        request: summarizeRequestForLogs(request, providerModelId),
        status: resp.status,
        statusText: resp.statusText,
        bodySnippet,
      });
      throw err;
    }

    const completion = (await resp.json()) as Record<string, unknown>;
    return wrapNonStreamAsOneChunk(completion, String(request.model || providerModelId));
  }

  payload.stream = true;
  payload.stream_options = { include_usage: true };

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: options.signal,
    });
  } catch (e) {
    if (options.signal?.aborted) throw new CancelledError('cancelled');
    console.error('[RunnerHostRuntime.llm] Azure AI Foundry fetch failed (stream)', {
      request: summarizeRequestForLogs(request, providerModelId),
      provider: summarizeProviderError(e),
    });
    throw e;
  }

  if (!resp.ok) {
    const raw = await resp.text().catch(() => '');
    const bodySnippet = raw ? raw.slice(0, 1200) : '';
    const err = new Error(`Azure AI Foundry responded with ${resp.status} ${resp.statusText}`);
    console.error('[RunnerHostRuntime.llm] Azure AI Foundry error (stream)', {
      request: summarizeRequestForLogs(request, providerModelId),
      status: resp.status,
      statusText: resp.statusText,
      bodySnippet,
    });
    throw err;
  }

  return streamSse(resp, options.signal, String(request.model || providerModelId));
}
