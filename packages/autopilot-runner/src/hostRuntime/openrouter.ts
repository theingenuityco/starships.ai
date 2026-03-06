import type { LlmHostRequest } from '@starships/autopilot';
import OpenAI from 'openai';
import { CancelledError } from '@starships/autopilot';
import type { LlmRuntimeConfig } from './RunnerHostRuntime';

type OpenAIChatCompletionCreateParamsNonStreaming = Omit<OpenAI.Chat.ChatCompletionCreateParamsStreaming, 'stream' | 'stream_options'> & {
  stream: false;
};

export interface InvokeOpenRouterOptions {
  llm?: LlmRuntimeConfig;
  signal?: AbortSignal;
}

export async function invokeOpenRouter(
  request: LlmHostRequest,
  providerModelId: string,
  options: InvokeOpenRouterOptions = {}
): Promise<AsyncIterable<unknown>> {
  const llmConfig = options.llm;
  const isAnthropicModel = typeof providerModelId === 'string' && providerModelId.startsWith('anthropic/');

  // OpenRouter/OpenAI Chat Completions expects messages without provider-specific
  // reasoning metadata. Some providers (and OpenRouter normalization) can return
  // additional per-message fields like `reasoning_details`; if we echo these back
  // in subsequent requests, OpenRouter/proxies may translate them into Anthropic
  // `thinking` blocks with `signature`, which Anthropic validates and can reject.
  //
  // We keep "thinking enabled" via top-level `reasoning`, but we strip:
  // - message.reasoning / message.reasoning_details
  // - any content blocks of type "thinking"
  // - any "signature" fields inside content blocks (defensive)
  const sanitizeMessagesForProvider = (): OpenAI.Chat.ChatCompletionMessageParam[] => {
    const msgs = Array.isArray(request.messages) ? (request.messages as unknown[]) : [];
    const sanitizeContent = (content: unknown): unknown => {
      if (typeof content === 'string') return content;
      if (!Array.isArray(content)) return content;
      const parts: unknown[] = [];
      for (const part of content as unknown[]) {
        if (!part || typeof part !== 'object') {
          parts.push(part);
          continue;
        }
        const p = part as Record<string, unknown>;
        const type = typeof p.type === 'string' ? p.type : undefined;
        if (type === 'thinking') {
          // Never replay thinking blocks through OpenRouter's OpenAI-compatible endpoint.
          continue;
        }
        const out: Record<string, unknown> = { ...p };
        if ('signature' in out) delete out.signature;
        if (out.thinking && typeof out.thinking === 'object') {
          const t = out.thinking as Record<string, unknown>;
          if ('signature' in t) {
            const nt = { ...t };
            delete nt.signature;
            out.thinking = nt;
          }
        }
        parts.push(out);
      }
      return parts;
    };

    return msgs
      .map((m) => {
        if (!m || typeof m !== 'object') return undefined;
        const msg = m as Record<string, unknown>;
        if (typeof msg.role !== 'string') return undefined;
        const out: Record<string, unknown> = { ...msg };
        if ('reasoning' in out) delete out.reasoning;
        if ('reasoning_details' in out) delete out.reasoning_details;
        if ('reasoningDetails' in out) delete out.reasoningDetails;
        if ('content' in out) out.content = sanitizeContent(out.content);
        return out as unknown as OpenAI.Chat.ChatCompletionMessageParam;
      })
      .filter((x): x is OpenAI.Chat.ChatCompletionMessageParam => !!x);
  };

  const sanitizedMessages = sanitizeMessagesForProvider();

  // Prefer host-provided LLM configuration; fall back to process.env for
  // backwards compatibility when running the runner standalone.
  const apiKey = llmConfig?.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OpenRouter API key is required. Provide it via llm.apiKey in RunnerHostRuntimeOptions or set OPENROUTER_API_KEY in the runner environment.'
    );
  }

  // IMPORTANT: don't set a default timeout here. If no explicit timeout is provided
  // by the caller, match the OpenAI SDK's default behavior (same as main).
  const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey,
    baseURL: llmConfig?.baseUrl ?? 'https://openrouter.ai/api/v1',
    maxRetries: 2,
    defaultHeaders: {
      'HTTP-Referer': 'https://starships.ai',
      'X-Title': 'Starships.ai',
      ...(llmConfig?.defaultHeaders ?? {}),
    },
  };

  const client = new OpenAI(clientOptions);

  const summarizeProviderError = (err: unknown): Record<string, unknown> => {
    const e: Record<string, unknown> =
      err && (typeof err === 'object' || typeof err === 'function') ? (err as Record<string, unknown>) : {};

    // Best-effort extraction for openai@6 API errors (also used by OpenRouter).
    const status = typeof e.status === 'number' ? e.status : undefined;
    const name = typeof e.name === 'string' ? e.name : undefined;
    const message = typeof e.message === 'string' ? e.message : String(err);
    const code = typeof e.code === 'string' ? e.code : undefined;
    const type = typeof e.type === 'string' ? e.type : undefined;

    // OpenAI SDK may attach the parsed JSON error body at e.error
    const apiError = e.error && typeof e.error === 'object' ? (e.error as Record<string, unknown>) : undefined;
    const apiErrorMessage = typeof apiError?.message === 'string' ? apiError.message : undefined;
    const apiErrorType = typeof apiError?.type === 'string' ? apiError.type : undefined;
    const apiErrorCode = typeof apiError?.code === 'string' ? apiError.code : undefined;

    // Request id can appear as request_id or in headers (OpenRouter sometimes uses x-request-id)
    const requestId =
      typeof (e as { request_id?: unknown }).request_id === 'string'
        ? ((e as { request_id: string }).request_id as string)
        : (() => {
            const headers = (e as { headers?: unknown }).headers;
            if (!headers || typeof headers !== 'object') return undefined;
            const h = headers as Record<string, unknown>;
            return typeof h['x-request-id'] === 'string'
              ? (h['x-request-id'] as string)
              : typeof h['x-openrouter-request-id'] === 'string'
                ? (h['x-openrouter-request-id'] as string)
                : undefined;
          })();
    // Provide a safe payload snippet (no prompts); OpenRouter often returns { error: { message, code, ... } }
    let apiErrorSnippet: string | undefined;
    try {
      if (apiError) {
        const s = JSON.stringify(apiError);
        apiErrorSnippet = s.length > 1200 ? `${s.slice(0, 1200)}…` : s;
      }
    } catch {
      apiErrorSnippet = undefined;
    }

    return {
      status,
      name,
      message,
      code,
      type,
      requestId,
      apiErrorMessage,
      apiErrorType,
      apiErrorCode,
      apiErrorSnippet,
    };
  };

  const isRetryableStreamError = (err: unknown): boolean => {
    if (!err) return false;
    const e = err as Record<string, unknown> | undefined;
    const name = typeof e?.name === 'string' ? e.name : undefined;
    const message = typeof e?.message === 'string' ? e.message : typeof err === 'string' ? err : '';
    const code = typeof e?.code === 'string' ? e.code : undefined;
    const msg = message.toLowerCase();
    return (
      (typeof name === 'string' && name.toLowerCase().includes('timeout')) ||
      msg.includes('timed out') ||
      msg.includes('timeout') ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET'
    );
  };

  const summarizeRequestForLogs = (): Record<string, unknown> => {
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
        // Only count text blocks; ignore image_url payload sizes.
        for (const part of c as unknown[]) {
          if (!part || typeof part !== 'object') continue;
          const p = part as Record<string, unknown>;
          if (p.type === 'text') totalTextChars += safeTextLen(p.text);
        }
      }
    }

    const toolsCount = Array.isArray(request.tools) ? request.tools.length : 0;
    const modalities = Array.isArray(request.modalities) ? request.modalities : undefined;
    return {
      model: providerModelId, // Log mapped ID
      wantsStream: typeof request.stream === 'boolean' ? request.stream : true,
      modalities,
      toolsCount,
      messagesCount: messages.length,
      totalTextChars,
    };
  };

  const modalities = request.modalities;
  const hasImageInMessages = (() => {
    const msgs = Array.isArray(request.messages) ? (request.messages as unknown[]) : [];
    for (const m of msgs) {
      if (!m || typeof m !== 'object') continue;
      const rec = m as Record<string, unknown>;
      const c = rec.content;
      if (!Array.isArray(c)) continue;
      for (const part of c as unknown[]) {
        if (!part || typeof part !== 'object') continue;
        const p = part as Record<string, unknown>;
        // OpenAI/OpenRouter style: { type: 'image_url', image_url: { url } }
        if (p.type === 'image_url') return true;
        // Some SDKs may use camelCase (OpenRouter SDK uses imageUrl); be defensive.
        if (p.type === 'image_url' || p.type === 'imageUrl') return true;
      }
    }
    return false;
  })();
  // OpenRouter docs show multimodal examples with stream: false. Even when modalities isn't provided,
  // presence of image parts implies an image request; force non-stream for reliability.
  const isImageRequest = (Array.isArray(modalities) && modalities.includes('image')) || hasImageInMessages;
  const wantsStream = typeof request.stream === 'boolean' ? request.stream : true;

  const resolveProviderEndUserId = (): string => {
    const raw = (request as unknown as { endUserId?: unknown }).endUserId;
    const id = typeof raw === 'string' ? raw.trim() : '';
    // Provider-side identifiers should be short + opaque.
    // OpenAI docs: max length 64 for safety_identifier.
    return id ? id.slice(0, 64) : '';
  };
  const endUserId = resolveProviderEndUserId();

  const baseRequest: Record<string, unknown> = {
    model: providerModelId, // Use mapped ID
    messages: sanitizedMessages,
  };

  // Provider-side attribution (not part of prompt text).
  // OpenAI Chat Completions: prefer safety_identifier + prompt_cache_key; include `user` for compatibility.
  if (endUserId) {
    baseRequest.safety_identifier = endUserId;
    baseRequest.prompt_cache_key = endUserId;
    baseRequest.user = endUserId;
  }

  // OpenRouter usage accounting (required for reliable cost reporting, especially BYOK).
  // Docs: include usage in final response / last SSE message.
  // NOTE: This can add ~100-300ms to the final chunk.
  baseRequest.usage = { include: true };

  // OpenRouter image generation (OpenRouter extension):
  // - modalities: ['image','text']
  // - image_config: { aspect_ratio: '16:9', ... }
  try {
    if (Array.isArray(modalities) && modalities.length > 0) {
      baseRequest.modalities = modalities;
    }
    const imageConfig = request.imageConfig;
    if (imageConfig && typeof imageConfig === 'object') {
      // OpenRouter expects snake_case
      baseRequest.image_config = imageConfig;
    }
  } catch {
    // Non-fatal: ignore unsupported fields
  }

  // Structured outputs (OpenAI-compatible):
  // - response_format: { type: 'json_schema', json_schema: { name, schema, strict } }
  try {
    const rf = (request as unknown as { responseFormat?: unknown }).responseFormat;
    if (rf && typeof rf === 'object') {
      baseRequest.response_format = rf;
    }
  } catch {
    // Non-fatal: ignore unsupported fields
  }

  // OpenRouter plugins (e.g., web browsing):
  // - plugins: [{ id: 'web', max_results: 3 }]
  try {
    if (Array.isArray(request.plugins) && request.plugins.length > 0) {
      baseRequest.plugins = request.plugins;
    }
  } catch {
    // Non-fatal: ignore unsupported fields
  }

  if (typeof request.temperature === 'number') {
    baseRequest.temperature = request.temperature;
  }
  if (typeof request.maxTokens === 'number') {
    baseRequest.max_tokens = request.maxTokens;
  }
  if (typeof request.topP === 'number') {
    baseRequest.top_p = request.topP;
  }
  if (typeof request.frequencyPenalty === 'number') {
    baseRequest.frequency_penalty = request.frequencyPenalty;
  }
  if (typeof request.presencePenalty === 'number') {
    baseRequest.presence_penalty = request.presencePenalty;
  }
  // OpenRouter normalizes reasoning/thinking across providers via the `reasoning` object.
  // For Anthropic models, OpenRouter expects `reasoning.max_tokens` (Anthropic-style),
  // not `reasoning.effort` (OpenAI-style). Passing `enabled/effort` for Anthropic can
  // lead OpenRouter/proxy translation to produce invalid Anthropic thinking blocks.
  //
  // Strategy:
  // - Non-Anthropic: pass through `request.reasoning` as-is.
  // - Anthropic: map { enabled/effort } -> { max_tokens } and keep exclude if present.
  const normalizeReasoningForOpenRouter = (): Record<string, unknown> | undefined => {
    const raw = request.reasoning;
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;

    const exclude = typeof r.exclude === 'boolean' ? r.exclude : undefined;
    if (!isAnthropicModel) {
      // For non-Anthropic models, we rely on OpenRouter to interpret effort/max_tokens.
      return r;
    }

    // Anthropic-style: use max_tokens.
    const explicitMax = typeof r.max_tokens === 'number' ? r.max_tokens : typeof r.maxTokens === 'number' ? r.maxTokens : undefined;
    if (typeof explicitMax === 'number' && Number.isFinite(explicitMax)) {
      const out: Record<string, unknown> = { max_tokens: explicitMax };
      if (typeof exclude === 'boolean') out.exclude = exclude;
      return out;
    }

    // Derive a safe default budget from requested output tokens (if provided).
    // Anthropic manual thinking budgets are typically >= 1024; OpenRouter docs allow
    // specifying any max_tokens, but too-low values can lead to provider rejection.
    const maxOut = typeof request.maxTokens === 'number' && Number.isFinite(request.maxTokens) ? request.maxTokens : 8000;

    // Map effort/enabled into a budget; if no effort provided but enabled true, assume "medium".
    const effortRaw = typeof r.effort === 'string' ? r.effort.toLowerCase() : undefined;
    const enabled = typeof r.enabled === 'boolean' ? r.enabled : undefined;
    const effort =
      effortRaw ??
      (enabled === true ? 'medium' : undefined);

    const pct =
      effort === 'none'
        ? 0
        : effort === 'minimal'
          ? 0.1
          : effort === 'low'
            ? 0.2
            : effort === 'high'
              ? 0.8
              : effort === 'xhigh'
                ? 0.95
                : 0.5; // medium/default

    // Keep within a reasonable bound and >= 1024 when enabled.
    const derived = Math.floor(maxOut * pct);
    const budget = derived <= 0 ? 0 : Math.max(1024, Math.min(derived, 12000));

    const out: Record<string, unknown> = { max_tokens: budget };
    if (typeof exclude === 'boolean') out.exclude = exclude;
    return out;
  };

  const normalizedReasoning = normalizeReasoningForOpenRouter();
  if (normalizedReasoning) {
    baseRequest.reasoning = normalizedReasoning;
  }

  // Convert ToolParams[] into provider-native tool definitions for OpenAI/OpenRouter.
  // ToolParams come from the host as rich tool configs (including blueprint, transforms, etc.).
  // For function calling we only need the JSON-schema parameters and stable function name.
  if (Array.isArray(request.tools) && request.tools.length > 0) {
    const tools: OpenAI.Chat.ChatCompletionTool[] = request.tools.map((tool) => {
      const t = tool as unknown as {
        name?: string;
        slug?: string;
        description?: string;
        parameters?: Record<string, unknown>;
      };

      // Prefer slug as the function name (matches how tools are referenced elsewhere),
      // fall back to name if slug is not present.
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
          // parameters is already a JSON Schema object on ToolParams; pass through as‑is.
          parameters: t.parameters as Record<string, unknown> | undefined,
        },
      } as OpenAI.Chat.ChatCompletionTool;
    });

    baseRequest.tools = tools;
  }

  const wrapNonStreamAsOneChunk = (completion: unknown): AsyncIterable<unknown> => {
    const c = completion as OpenAI.Chat.Completions.ChatCompletion;
    const oneChunk = {
      id: c?.id,
      object: (c as unknown as { object?: unknown })?.object,
      created: (c as unknown as { created?: unknown })?.created,
      model: c?.model,
      usage: (c as unknown as { usage?: unknown })?.usage,
      choices: [
        {
          index: 0,
          // LLM node checks both delta and message; include full message snapshot.
          message: c?.choices?.[0]?.message,
          finish_reason: c?.choices?.[0]?.finish_reason ?? (c?.choices?.[0] as unknown as { finishReason?: unknown })?.finishReason,
        },
      ],
    };
    async function* gen() {
      yield oneChunk;
    }
    return gen();
  };

  // Some models/providers only include certain payloads (notably images) in the final
  // non-stream response. Also, some Gemini variants can require a follow-up "turn"
  // to produce images; using non-stream reduces partial/empty parsing failures.
  //
  // Policy:
  // - Always force non-stream for image requests
  // - Respect explicit stream=false for text requests
  if (isImageRequest || !wantsStream) {
    let completion: unknown;
    try {
      completion = await client.chat.completions.create(
        {
          ...(baseRequest as Record<string, unknown>),
          stream: false,
        } as unknown as OpenAIChatCompletionCreateParamsNonStreaming,
        options.signal ? ({ signal: options.signal } as unknown as { signal: AbortSignal }) : undefined
      );
    } catch (e: unknown) {
      if (options.signal?.aborted) {
        throw new CancelledError('cancelled');
      }
      // Log provider error details for diagnosis (do NOT log prompts or raw messages).
      console.error('[RunnerHostRuntime.llm] Provider error (non-stream)', {
        request: summarizeRequestForLogs(),
        provider: summarizeProviderError(e),
      });
      throw e;
    }
    return wrapNonStreamAsOneChunk(completion);
  }

  const openaiRequest: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
    ...(baseRequest as unknown as Omit<OpenAI.Chat.ChatCompletionCreateParamsStreaming, 'stream' | 'stream_options'>),
    stream: true,
    stream_options: { include_usage: true },
  };
  let stream: unknown;
  try {
    stream = await client.chat.completions.create(
      openaiRequest,
      options.signal ? ({ signal: options.signal } as unknown as { signal: AbortSignal }) : undefined
    );
  } catch (e: unknown) {
    if (options.signal?.aborted) {
      throw new CancelledError('cancelled');
    }
    // Log provider error details for diagnosis (do NOT log prompts or raw messages).
    console.error('[RunnerHostRuntime.llm] Provider error (stream)', {
      request: summarizeRequestForLogs(),
      provider: summarizeProviderError(e),
    });

    // Some providers/models are flaky with SSE streaming and can time out even though
    // the same request would succeed non-streaming. Fall back to non-stream once.
    if (!isImageRequest && wantsStream && isRetryableStreamError(e)) {
      try {
        const completion = await client.chat.completions.create(
          {
            ...(baseRequest as Record<string, unknown>),
            stream: false,
          } as unknown as OpenAIChatCompletionCreateParamsNonStreaming,
          options.signal ? ({ signal: options.signal } as unknown as { signal: AbortSignal }) : undefined
        );
        console.warn('[RunnerHostRuntime.llm] Stream failed; fell back to non-stream', {
          request: summarizeRequestForLogs(),
          provider: summarizeProviderError(e),
        });
        return wrapNonStreamAsOneChunk(completion);
      } catch (e2: unknown) {
        if (options.signal?.aborted) {
          throw new CancelledError('cancelled');
        }
        console.error('[RunnerHostRuntime.llm] Provider error (non-stream fallback)', {
          request: summarizeRequestForLogs(),
          provider: summarizeProviderError(e2),
        });
        throw e2;
      }
    }

    throw e;
  }
  return stream as AsyncIterable<unknown>;
}
