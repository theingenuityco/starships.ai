import type { HostRuntime, LlmHostRequest } from '@starships/autopilot';
import OpenAI from 'openai';

/**
 * Connector-aware HTTP configuration passed from the embedding host (API server)
 * to the runner process.
 *
 * IMPORTANT: This data is ONLY consumed inside the HostRuntime implementation.
 * It is never exposed to workflows as runtimeEnv or node state, so secrets
 * carried in headers remain invisible to blueprints/code nodes.
 */
export interface ConnectorHttpConfig {
  /**
   * Optional base URL used when HttpRequest nodes specify a relative URL
   * (e.g., "/starships/{id}/connectors"). When provided and the request URL
   * is relative, the final URL will be resolved against this base.
   */
  baseUrl?: string;

  /**
   * Headers to inject on every HTTP request executed via this connector.
   * Typically used for Authorization or other connector-specific metadata.
   */
  headers?: Record<string, string>;
}

/**
 * LLM runtime configuration passed from the embedding host.
 *
 * This is used by HostRuntime.llm to talk to the underlying provider
 * (currently OpenRouter). Workflows never see this configuration; they
 * just specify model/messages and the host owns provider details.
 */
export interface LlmRuntimeConfig {
  apiKey: string;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
}

export interface RunnerHostRuntimeOptions {
  /**
   * Map of connector slug -> HTTP configuration. Keys MUST match the
   * connector identifiers used in HttpRequestParams.connector, e.g.:
   *   { starships: { baseUrl, headers }, linkedin: { baseUrl, headers } }
   */
  connectors?: Record<string, ConnectorHttpConfig | undefined>;

  /**
   * Optional LLM runtime configuration. When provided, HostRuntime.llm will
   * use this instead of reading from process.env.
   */
  llm?: LlmRuntimeConfig;
}

/**
 * HostRuntime implementation for the autopilot-runner process.
 *
 * This is responsible for:
 * - Performing HTTP calls on behalf of HttpRequest nodes
 * - Executing LLM calls via OpenRouter (or other providers in the future)
 *
 * The embedding host (Starships API server) may pass connector-aware HTTP
 * configuration (base URLs, auth headers, etc.) via RunnerHostRuntimeOptions.
 * Workflows only see the connector slug; they never see the underlying
 * headers or URLs used here.
 */
export function createRunnerHostRuntime(options: RunnerHostRuntimeOptions = {}): HostRuntime {
  const connectorConfigs = options.connectors ?? {};

  const http: HostRuntime['http'] = async ({ method, url, headers = {}, body, timeoutMs, connector }) => {
    const controller = new AbortController();
    const timeout = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const finalMethod = method.toUpperCase();

      // Start from caller-provided URL and headers
      let finalUrl = url;
      let finalHeaders: Record<string, unknown> = { ...(headers as Record<string, unknown>) };

      // If a connector slug is provided and we have configuration for it,
      // apply baseUrl + header injection. This keeps connector-specific
      // behavior entirely inside the HostRuntime.
      if (connector && typeof connector === 'string') {
        const cfg = connectorConfigs[connector];
        if (cfg) {
          const { baseUrl, headers: connectorHeaders } = cfg;

          // Resolve relative URLs against connector baseUrl, when provided.
          if (typeof baseUrl === 'string' && typeof finalUrl === 'string' && !/^https?:\/\//i.test(finalUrl)) {
            const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
            const normalizedPath = finalUrl.startsWith('/') ? finalUrl : `/${finalUrl}`;
            finalUrl = `${normalizedBase}${normalizedPath}`;
          }

          // Merge connector headers last so they can override generic ones.
          if (connectorHeaders && typeof connectorHeaders === 'object') {
            finalHeaders = {
              ...finalHeaders,
              ...connectorHeaders,
            };
          }
        }
      }

      const init: RequestInit = {
        method: finalMethod,
        headers: finalHeaders as RequestInit['headers'],
        signal: controller.signal,
      };

      if (body !== undefined && finalMethod !== 'GET' && finalMethod !== 'HEAD') {
        let bodyInit: RequestInit['body'];

        if (
          typeof body === 'string' ||
          (typeof Blob !== 'undefined' && body instanceof Blob) ||
          (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
          (typeof FormData !== 'undefined' && body instanceof FormData) ||
          body instanceof ArrayBuffer ||
          ArrayBuffer.isView(body as ArrayBufferLike)
        ) {
          bodyInit = body as RequestInit['body'];
        } else {
          bodyInit = JSON.stringify(body) as RequestInit['body'];
          const currentHeaders = new Headers(init.headers as RequestInit['headers']);
          if (!currentHeaders.has('content-type')) {
            currentHeaders.set('content-type', 'application/json');
          }
          init.headers = currentHeaders;
        }

        init.body = bodyInit;
      }

      const resp: Response = await fetch(finalUrl, init);
      const contentType = resp.headers.get('content-type') || '';
      let responseBody: unknown;

      if (contentType.includes('application/json')) {
        try {
          responseBody = await resp.json();
        } catch {
          responseBody = await resp.text();
        }
      } else {
        responseBody = await resp.text();
      }

      const responseHeaders: Record<string, string> = {};
      resp.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: resp.status,
        statusText: resp.statusText,
        headers: responseHeaders,
        body: responseBody,
        url: resp.url,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const llm = async (request: LlmHostRequest): Promise<AsyncIterable<unknown>> => {
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

    const openaiRequest: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: request.model,
      messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      stream: true,
      stream_options: { include_usage: true },
    };

    if (typeof request.temperature === 'number') {
      openaiRequest.temperature = request.temperature;
    }
    if (typeof request.maxTokens === 'number') {
      openaiRequest.max_tokens = request.maxTokens;
    }
    if (typeof request.topP === 'number') {
      openaiRequest.top_p = request.topP;
    }
    if (typeof request.frequencyPenalty === 'number') {
      openaiRequest.frequency_penalty = request.frequencyPenalty;
    }
    if (typeof request.presencePenalty === 'number') {
      openaiRequest.presence_penalty = request.presencePenalty;
    }
    if (request.reasoning && typeof request.reasoning === 'object') {
      (openaiRequest as OpenAI.Chat.ChatCompletionCreateParamsStreaming & { reasoning?: unknown }).reasoning = request.reasoning;
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

      openaiRequest.tools = tools;
    }

    const stream = await client.chat.completions.create(openaiRequest);
    return stream as AsyncIterable<unknown>;
  };

  return { http, llm };
}
