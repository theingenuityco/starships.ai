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

  // Prefer host-provided LLM configuration; fall back to process.env for
  // backwards compatibility when running the runner standalone.
  const apiKey = llmConfig?.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OpenRouter API key is required. Provide it via llm.apiKey in RunnerHostRuntimeOptions or set OPENROUTER_API_KEY in the runner environment.'
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: llmConfig?.baseUrl ?? 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://starships.ai',
      'X-Title': 'Starships.ai',
      ...(llmConfig?.defaultHeaders ?? {}),
    },
  });

  const summarizeProviderError = (err: unknown): Record<string, unknown> => {
    const e = err as any;

    // Best-effort extraction for openai@6 API errors (also used by OpenRouter).
    const status = typeof e?.status === 'number' ? e.status : undefined;
    const name = typeof e?.name === 'string' ? e.name : undefined;
    const message = typeof e?.message === 'string' ? e.message : String(err);
    const code = typeof e?.code === 'string' ? e.code : undefined;
    const type = typeof e?.type === 'string' ? e.type : undefined;

    // OpenAI SDK may attach the parsed JSON error body at e.error
    const apiError = e?.error && typeof e.error === 'object' ? e.error : undefined;
    const apiErrorMessage = typeof apiError?.message === 'string' ? apiError.message : undefined;
    const apiErrorType = typeof apiError?.type === 'string' ? apiError.type : undefined;
    const apiErrorCode = typeof apiError?.code === 'string' ? apiError.code : undefined;

    // Request id can appear as request_id or in headers (OpenRouter sometimes uses x-request-id)
    const requestId =
      typeof e?.request_id === 'string'
        ? e.request_id
        : typeof e?.headers?.['x-request-id'] === 'string'
          ? e.headers['x-request-id']
          : typeof e?.headers?.['x-openrouter-request-id'] === 'string'
            ? e.headers['x-openrouter-request-id']
            : undefined;

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
  const isImageRequest = Array.isArray(modalities) && modalities.includes('image');
  const wantsStream = typeof request.stream === 'boolean' ? request.stream : true;

  const baseRequest: Record<string, unknown> = {
    model: providerModelId, // Use mapped ID
    messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
  };

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
  if (request.reasoning && typeof request.reasoning === 'object') {
    baseRequest.reasoning = request.reasoning;
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
        options.signal ? ({ signal: options.signal } as any) : undefined
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
    stream = await client.chat.completions.create(openaiRequest, options.signal ? ({ signal: options.signal } as any) : undefined);
  } catch (e: unknown) {
    if (options.signal?.aborted) {
      throw new CancelledError('cancelled');
    }
    // Log provider error details for diagnosis (do NOT log prompts or raw messages).
    console.error('[RunnerHostRuntime.llm] Provider error (stream)', {
      request: summarizeRequestForLogs(),
      provider: summarizeProviderError(e),
    });
    throw e;
  }
  return stream as AsyncIterable<unknown>;
}

