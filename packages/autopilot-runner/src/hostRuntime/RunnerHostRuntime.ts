import type { HostRuntime, LlmHostRequest } from '@starships/autopilot';
import type { ConnectorEndpointV2, ConnectorTemplateRuntimeFieldsV2 } from '@starships/protocol';
import OpenAI from 'openai';
import Ajv from 'ajv';

/**
 * Connector sessions passed from the embedding host (API server) to the runner.
 *
 * Sessions carry injected auth headers (never exposed to workflows).
 */
export interface ConnectorSession {
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
   * Connector templates (safe, no raw secrets) keyed by connector slug/provider.
   */
  connectorTemplates?: Record<string, ConnectorTemplateRuntimeFieldsV2 | undefined>;

  /**
   * Connector sessions (auth headers, no raw secrets exposed to workflows)
   * keyed by connector slug/provider.
   */
  connectorSessions?: Record<string, ConnectorSession | undefined>;

  /**
   * Non-secret runtime env values (same as Engine runtimeEnv). Needed for
   * template expression evaluation in connector_action mappings.
   */
  runtimeEnv?: Record<string, unknown>;

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
  const connectorTemplates = options.connectorTemplates ?? {};
  const connectorSessions = options.connectorSessions ?? {};
  const runtimeEnv = options.runtimeEnv ?? {};

  const http: HostRuntime['http'] = async ({ method, url, headers = {}, body, timeoutMs }) => {
    const controller = new AbortController();
    const timeout = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const finalMethod = method.toUpperCase();

      // Start from caller-provided URL and headers
      const finalUrl = url;
      const finalHeaders: Record<string, unknown> = { ...(headers as Record<string, unknown>) };

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

  const ajv = new Ajv({ allErrors: true, strict: false });

  const evalTemplate = (value: unknown, ctx: { args: Record<string, unknown>; runtimeEnv: Record<string, unknown> }): unknown => {
    if (typeof value !== 'string') return value;

    const raw = value;
    const fullOnly = /^\s*\{\{\s*[\s\S]*?\s*\}\}\s*$/.test(raw);
    const re = /\{\{\s*([\s\S]*?)\s*\}\}/g;

    const evalExpr = (expr: string): unknown => {
      // eslint-disable-next-line no-new-func
      const fn = new Function('args', 'runtimeEnv', `return (${expr});`);
      return fn(ctx.args, ctx.runtimeEnv);
    };

    if (fullOnly) {
      const m = raw.match(/^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/);
      if (!m) return raw;
      return evalExpr(m[1]);
    }

    return raw.replace(re, (_m, expr) => {
      const out = evalExpr(String(expr));
      return out === null || out === undefined ? '' : String(out);
    });
  };

  const connectorAction: HostRuntime['connectorAction'] = async ({ connector, action, args = {}, timeoutMs }) => {
    const c = String(connector || '').trim();
    const a = String(action || '').trim();
    if (!c) throw new Error('connectorAction.connector is required');
    if (!a) throw new Error('connectorAction.action is required');

    const tpl = connectorTemplates[c];
    if (!tpl) {
      throw new Error(`Unknown connector "${c}" (template not provided to runner)`);
    }

    const endpoint = (tpl.endpoints || []).find((e) => e && e.name === a) as ConnectorEndpointV2 | undefined;
    if (!endpoint) {
      throw new Error(`Unknown connector action "${a}" for connector "${c}"`);
    }

    // Validate args if schema is present.
    if (endpoint.parameters && typeof endpoint.parameters === 'object') {
      const validate = ajv.compile(endpoint.parameters as any);
      const ok = validate(args);
      if (!ok) {
        const msg = ajv.errorsText(validate.errors || [], { separator: '; ' });
        throw new Error(`Invalid connector_action args for ${c}.${a}: ${msg}`);
      }
    }

    const ctx = { args, runtimeEnv };

    const baseUrlRaw = endpoint.baseUrlOverride || tpl.baseUrl;
    const baseUrlEvaluated = String(evalTemplate(baseUrlRaw, ctx) ?? '').trim();
    if (!/^https?:\/\//i.test(baseUrlEvaluated)) {
      throw new Error(`Invalid baseUrl for connector "${c}": must be absolute http(s) URL`);
    }

    // Resolve path variables
    const pathVars = (endpoint.mapping && endpoint.mapping.path) || {};
    const resolvedPath = String(endpoint.path || '').replace(/\{([^}]+)\}/g, (_m, name) => {
      const key = String(name);
      const expr = (pathVars as Record<string, string>)[key];
      const val = expr !== undefined ? evalTemplate(expr, ctx) : (args as any)[key];
      if (val === undefined || val === null || String(val) === '') {
        throw new Error(`Missing path variable "${key}" for connector "${c}" action "${a}"`);
      }
      return encodeURIComponent(String(val));
    });

    const url = `${baseUrlEvaluated.replace(/\/+$/,'')}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`;

    // Build headers (sessions first, then mapping overrides)
    const sessionHeaders = connectorSessions[c]?.headers ?? {};
    const headers: Record<string, unknown> = { ...sessionHeaders };
    if (endpoint.mapping?.headers) {
      for (const [k, v] of Object.entries(endpoint.mapping.headers)) {
        const out = evalTemplate(v, ctx);
        headers[k] = out as any;
      }
    }

    // Build query/body based on mapping or requestStyle
    const method = String(endpoint.method || 'GET').toUpperCase();
    let finalUrl = url;
    let body: unknown = undefined;

    const mapping = endpoint.mapping;
    if (mapping?.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(mapping.query)) {
        const out = evalTemplate(v, ctx);
        if (out === undefined || out === null) continue;
        qs.set(k, String(out));
      }
      const q = qs.toString();
      if (q) finalUrl = `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}${q}`;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      if (mapping?.rawBody !== undefined) {
        body = evalTemplate(mapping.rawBody, ctx);
      } else if (mapping?.body) {
        const obj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(mapping.body)) {
          obj[k] = evalTemplate(v, ctx) as any;
        }
        body = obj;
      } else {
        // fallback: send args as JSON for non-GET when no explicit body mapping
        body = args;
      }
    }

    return await http({
      method,
      url: finalUrl,
      headers,
      body,
      timeoutMs,
    });
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

    const modalities = (request as unknown as { modalities?: unknown }).modalities;
    const isImageRequest = Array.isArray(modalities) && modalities.includes('image');
    const requestedStream = (request as unknown as { stream?: unknown }).stream;
    const wantsStream = typeof requestedStream === 'boolean' ? requestedStream : true;

    const baseRequest: Record<string, unknown> = {
      model: request.model,
      messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
    };

    // OpenRouter image generation (OpenRouter extension):
    // - modalities: ['image','text']
    // - image_config: { aspect_ratio: '16:9', ... }
    try {
      if (Array.isArray(modalities) && modalities.length > 0) {
        baseRequest.modalities = modalities;
      }
      const imageConfig = (request as unknown as { imageConfig?: unknown }).imageConfig;
      if (imageConfig && typeof imageConfig === 'object') {
        // OpenRouter expects snake_case
        baseRequest.image_config = imageConfig;
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

    const wrapNonStreamAsOneChunk = (completion: any): AsyncIterable<unknown> => {
      const oneChunk = {
        id: completion?.id,
        object: completion?.object,
        created: completion?.created,
        model: completion?.model,
        usage: completion?.usage,
        choices: [
          {
            index: 0,
            // LLM node checks both delta and message; include full message snapshot.
            message: completion?.choices?.[0]?.message,
            finish_reason: completion?.choices?.[0]?.finish_reason ?? completion?.choices?.[0]?.finishReason,
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
      const completion = (await client.chat.completions.create({ ...(baseRequest as any), stream: false } as any)) as any;
      return wrapNonStreamAsOneChunk(completion);
    }

    const openaiRequest: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      ...(baseRequest as unknown as Omit<OpenAI.Chat.ChatCompletionCreateParamsStreaming, 'stream' | 'stream_options'>),
      stream: true,
      stream_options: { include_usage: true },
    };
    const stream = await client.chat.completions.create(openaiRequest);
    return stream as AsyncIterable<unknown>;
  };

  return { http, connectorAction, llm };
}
