import type { HostRuntime, LlmHostRequest } from '@starships/autopilot';
import type {
  ConnectorEndpointV2,
  ConnectorTemplateRuntimeFieldsV2,
  ConnectorQueryParamMapping,
  ExprString,
  HttpMethod,
  QueryParamEncoding,
} from '@starships/protocol';
import OpenAI from 'openai';
import { CancelledError } from '@starships/autopilot';
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message as BedrockMessage,
  type ContentBlock as BedrockContentBlock,
  type Tool as BedrockTool,
  type ToolConfiguration as BedrockToolConfiguration,
  type ImageFormat as BedrockImageFormat,
  type ConverseStreamCommandInput,
} from '@aws-sdk/client-bedrock-runtime';

type OpenAIChatCompletionCreateParamsNonStreaming = Omit<OpenAI.Chat.ChatCompletionCreateParamsStreaming, 'stream' | 'stream_options'> & {
  stream: false;
};

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

export interface AwsRuntimeConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface ProviderRoute {
  provider: 'openrouter' | 'aws_bedrock';
  providerModelId: string;
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
   * Connector instance metadata (non-secret) keyed by connector slug/provider.
   * This is used for template evaluation in connector_action baseUrl/mappings.
   */
  connectorMetadata?: Record<string, Record<string, unknown> | undefined>;

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

  /**
   * AWS runtime configuration for Bedrock.
   */
  aws?: AwsRuntimeConfig;

  /**
   * Model routing table. Maps canonical model ID to one or more provider routes,
   * ordered by descending priority. The host may provide multiple routes so the
   * runner can fail over between providers.
   */
  modelRoutes?: Record<string, ProviderRoute[] | undefined>;

  /**
   * Execution-wide abort signal. When aborted, all in-flight host runtime operations
   * (HTTP + LLM) should be cancelled promptly.
   */
  signal?: AbortSignal;
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
  const connectorMetadata = options.connectorMetadata ?? {};
  const runtimeEnv = options.runtimeEnv ?? {};

  // Initialize clients lazily or once
  let _bedrockClient: BedrockRuntimeClient | null = null;
  const getBedrockClient = (): BedrockRuntimeClient => {
    if (!_bedrockClient) {
      if (!options.aws) {
        throw new Error('AWS credentials not configured in RunnerHostRuntimeOptions');
      }
      _bedrockClient = new BedrockRuntimeClient({
        region: options.aws.region,
        credentials: {
          accessKeyId: options.aws.accessKeyId,
          secretAccessKey: options.aws.secretAccessKey,
        },
      });
    }
    return _bedrockClient;
  };

  const http: HostRuntime['http'] = async ({ method, url, headers = {}, body, timeoutMs }) => {
    const redactHeadersForLogs = (h: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      const sensitive = new Set([
        'authorization',
        'proxy-authorization',
        'cookie',
        'set-cookie',
        'x-api-key',
        'api-key',
        'apikey',
        'x-auth-token',
      ]);
      for (const [k, v] of Object.entries(h)) {
        const lk = k.toLowerCase();
        out[k] = sensitive.has(lk) ? '[REDACTED]' : v;
      }
      return out;
    };

    const redactUrlForLogs = (rawUrl: string): string => {
      try {
        const u = new URL(rawUrl);
        const sensitiveParams = new Set([
          'token',
          'access_token',
          'auth',
          'authorization',
          'api_key',
          'apikey',
          'key',
          'secret',
          'signature',
        ]);
        for (const [k] of u.searchParams) {
          if (sensitiveParams.has(k.toLowerCase())) {
            u.searchParams.set(k, '[REDACTED]');
          }
        }
        return u.toString();
      } catch {
        return rawUrl;
      }
    };

    const summarizeFetchError = (err: unknown): Record<string, unknown> => {
      const e = err as any;
      const cause = e?.cause;
      const pick = (x: any): Record<string, unknown> => {
        if (!x || (typeof x !== 'object' && typeof x !== 'function')) return {};
        return {
          name: typeof x.name === 'string' ? x.name : undefined,
          message: typeof x.message === 'string' ? x.message : undefined,
          code: typeof x.code === 'string' ? x.code : undefined,
          errno: typeof x.errno === 'number' ? x.errno : undefined,
          syscall: typeof x.syscall === 'string' ? x.syscall : undefined,
          address: typeof x.address === 'string' ? x.address : undefined,
          port: typeof x.port === 'number' ? x.port : undefined,
          hostname: typeof x.hostname === 'string' ? x.hostname : undefined,
        };
      };

      const primary = pick(e);
      const underlying = pick(cause);
      const code = (underlying.code ?? primary.code) as string | undefined;
      const msg = (underlying.message ?? primary.message) as string | undefined;

      // A compact one-liner that is safe to embed in Error.message.
      const summary =
        code && msg ? `${code}: ${msg}` : code ? code : msg ? msg : typeof err === 'string' ? err : 'fetch failed';

      return {
        summary,
        error: primary,
        cause: underlying,
      };
    };

    const timeoutController = new AbortController();
    const timeout = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

    try {
      const finalMethod = method.toUpperCase();

      // Start from caller-provided URL and headers
      const finalUrl = url;
      const finalHeaders: Record<string, unknown> = { ...(headers as Record<string, unknown>) };

      const combinedSignal = options.signal ? AbortSignal.any([options.signal, timeoutController.signal]) : timeoutController.signal;

      const init: RequestInit = {
        method: finalMethod,
        headers: finalHeaders as RequestInit['headers'],
        signal: combinedSignal,
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

      let resp: Response;
      try {
        resp = await fetch(finalUrl, init);
      } catch (e: unknown) {
        if (options.signal?.aborted) {
          throw new CancelledError('cancelled');
        }
        if (timeoutController.signal.aborted) {
          const safeUrl = redactUrlForLogs(finalUrl);
          const err = new Error(`HTTP fetch timed out after ${timeout}ms: ${finalMethod} ${safeUrl}`);
          console.error('[RunnerHostRuntime.http] fetch_timeout', {
            method: finalMethod,
            url: safeUrl,
            timeoutMs: timeout,
          });
          throw err;
        }

        const safeUrl = redactUrlForLogs(finalUrl);
        const safeHeaders = redactHeadersForLogs(finalHeaders);
        const bodyInfo =
          body === undefined
            ? { hasBody: false }
            : typeof body === 'string'
              ? { hasBody: true, bodyType: 'string', bodyLength: body.length }
              : body instanceof ArrayBuffer
                ? { hasBody: true, bodyType: 'ArrayBuffer', bodyByteLength: body.byteLength }
                : ArrayBuffer.isView(body as ArrayBufferLike)
                  ? { hasBody: true, bodyType: 'ArrayBufferView', bodyByteLength: (body as ArrayBufferView).byteLength }
                  : typeof body === 'object'
                    ? { hasBody: true, bodyType: 'object' }
                    : { hasBody: true, bodyType: typeof body };

        const summary = summarizeFetchError(e);
        console.error('[RunnerHostRuntime.http] fetch_failed', {
          method: finalMethod,
          url: safeUrl,
          timeoutMs: timeout,
          headers: safeHeaders,
          ...bodyInfo,
          error: summary,
        });

        const wrapped = new Error(`HTTP fetch failed: ${finalMethod} ${safeUrl} (${summary.summary})`) as Error & {
          cause?: unknown;
        };
        wrapped.cause = e;
        throw wrapped;
      }
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

  const evalTemplate = (
    value: unknown,
    ctx: {
      args: Record<string, unknown>;
      runtimeEnv: Record<string, unknown>;
      metadata: Record<string, unknown>;
      vars: Record<string, unknown>;
    }
  ): unknown => {
    if (typeof value !== 'string') return value;

    const raw = value;
    const fullOnly = /^\s*\{\{\s*[\s\S]*?\s*\}\}\s*$/.test(raw);
    const re = /\{\{\s*([\s\S]*?)\s*\}\}/g;

    const evalExpr = (expr: string): unknown => {
      // Provide a merged scope so templates can reference:
      // - args / runtimeEnv / metadata (explicit objects)
      // - connector variables directly by name (e.g. {{ shop }})
      const scope = {
        args: ctx.args,
        runtimeEnv: ctx.runtimeEnv,
        metadata: ctx.metadata,
        vars: ctx.vars,
        ...ctx.vars,
      };

      const fn = new Function('scope', `with (scope) { return (${expr}); }`);
      return fn(scope);
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

    const endpoint = tpl.endpoints.find((e: ConnectorEndpointV2) => e.name === a);
    if (!endpoint) {
      throw new Error(`Unknown connector action "${a}" for connector "${c}"`);
    }

    const metadata = (connectorMetadata[c] ?? {}) as Record<string, unknown>;

    // Resolve connector variables (declared in template) into a flat scope.
    // These are also spread into the template scope to support {{ varName }}.
    const vars: Record<string, unknown> = {};
    for (const v of tpl.variables ?? []) {
      if (!v || typeof v.name !== 'string' || !v.name.trim()) continue;
      const name = v.name.trim();
      const source = v.source;
      const key = typeof v.key === 'string' ? v.key : '';
      let rawValue: unknown;

      if (source === 'args') rawValue = (args as Record<string, unknown>)[key];
      else if (source === 'runtimeEnv') rawValue = (runtimeEnv as Record<string, unknown>)[key];
      else if (source === 'metadata') rawValue = (metadata as Record<string, unknown>)[key];

      if (v.transform && typeof v.transform === 'string' && v.transform.trim()) {
        // Provide `value` to transforms (in addition to args/runtimeEnv/metadata/vars).
        const transformCtx = {
          args,
          runtimeEnv,
          metadata,
          vars: { ...vars, value: rawValue },
        };
        rawValue = evalTemplate(v.transform, transformCtx);
      }

      vars[name] = rawValue;
    }

    const ctx = { args, runtimeEnv, metadata, vars };

    const baseUrlRaw = endpoint.baseUrlOverride || tpl.baseUrl;
    const baseUrlEvaluated = String(evalTemplate(baseUrlRaw, ctx) ?? '').trim();
    if (!/^https?:\/\//i.test(baseUrlEvaluated)) {
      throw new Error(`Invalid baseUrl for connector "${c}": must be absolute http(s) URL`);
    }

    // Resolve path variables
    const pathVars: Record<string, ExprString> = endpoint.mapping?.path ?? {};
    const resolvedPath = String(endpoint.path || '').replace(/\{([^}]+)\}/g, (_m, name) => {
      const key = String(name);
      const expr = pathVars[key];
      const val = expr !== undefined ? evalTemplate(expr, ctx) : args[key];
      if (val === undefined || val === null || String(val) === '') {
        throw new Error(`Missing path variable "${key}" for connector "${c}" action "${a}"`);
      }
      return encodeURIComponent(String(val));
    });

    const url = `${baseUrlEvaluated.replace(/\/+$/, '')}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`;

    // Build headers (sessions first, then mapping overrides)
    const sessionHeaders = connectorSessions[c]?.headers ?? {};
    const headers: Record<string, unknown> = { ...sessionHeaders };
    if (endpoint.mapping?.headers) {
      for (const [k, v] of Object.entries(endpoint.mapping.headers)) {
        const out = evalTemplate(v, ctx);
        headers[k] = out;
      }
    }

    // Build query/body based on mapping or requestStyle
    const method: HttpMethod = endpoint.method;
    let finalUrl = url;
    let body: unknown = undefined;

    const mapping = endpoint.mapping;
    if (mapping?.query) {
      const defaultEncoding: QueryParamEncoding = mapping.queryEncoding ?? 'standard';
      const parts: string[] = [];

      for (const [k, v] of Object.entries(mapping.query as Record<string, ConnectorQueryParamMapping>)) {
        let expr: unknown = v;
        let encoding: QueryParamEncoding = defaultEncoding;

        if (typeof v === 'object' && v !== null && 'value' in v) {
          const vv = v as { value: unknown; encoding?: unknown };
          expr = vv.value;
          if (vv.encoding === 'none' || vv.encoding === 'standard') {
            encoding = vv.encoding;
          }
        }

        const out = evalTemplate(expr, ctx);
        if (out === undefined || out === null) continue;
        const valueStr = String(out);

        if (encoding === 'none') {
          // Preserve value exactly; still encode the key for safety.
          parts.push(`${encodeURIComponent(k)}=${valueStr}`);
        } else {
          // Backwards-compatible encoding behavior.
          const qs = new URLSearchParams();
          qs.set(k, valueStr);
          const s = qs.toString();
          if (s) parts.push(s);
        }
      }

      const q = parts.filter(Boolean).join('&');
      if (q) finalUrl = `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}${q}`;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      if (mapping?.rawBody !== undefined) {
        body = evalTemplate(mapping.rawBody, ctx);
      } else if (mapping?.body) {
        const obj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(mapping.body)) {
          obj[k] = evalTemplate(v, ctx);
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
    // 1. Determine provider routes (ordered by priority).
    const configuredRoutes = options.modelRoutes?.[request.model];
    const routes: ProviderRoute[] =
      Array.isArray(configuredRoutes) && configuredRoutes.length > 0
        ? configuredRoutes
        : [
            // Backwards-compatible default: treat the canonical model as an OpenRouter ID.
            { provider: 'openrouter', providerModelId: request.model },
          ];

    const failures: Array<{ provider: string; providerModelId: string; error: unknown }> = [];

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const provider = route.provider;
      const providerModelId = route.providerModelId || request.model;

      console.log(
        `[RunnerHostRuntime.llm] Routing model "${request.model}" to provider: ${provider} (ID: ${providerModelId}) [attempt ${i + 1}/${routes.length}]`,
      );

      try {
        if (provider === 'aws_bedrock') {
          return await invokeBedrock(request, providerModelId);
        }

        // Default/OpenRouter
        return await invokeOpenRouter(request, providerModelId);
      } catch (e) {
        failures.push({ provider, providerModelId, error: e });
        console.error('[RunnerHostRuntime.llm] Provider route failed', {
          model: request.model,
          provider,
          providerModelId,
          attempt: i + 1,
          attemptsTotal: routes.length,
          error: e,
        });

        // If this was the last route, surface an aggregated error.
        if (i === routes.length - 1) {
          const err = new Error('All LLM provider routes failed');
          (err as any).causes = failures;
          throw err;
        }
        // Otherwise, continue to the next provider route.
      }
    }

    // Should be unreachable, but keep a defensive fallback.
    throw new Error('No LLM provider routes available');
  };

  const invokeBedrock = async (request: LlmHostRequest, providerModelId: string): Promise<AsyncIterable<unknown>> => {
    const client = getBedrockClient();

    // Separate system prompts from messages
    const bedrockMessages: BedrockMessage[] = [];
    const system: { text: string }[] = [];

    const rawMessages = request.messages as OpenAI.Chat.ChatCompletionMessageParam[];
    
    for (const m of rawMessages) {
      if (m.role === 'system') {
        if (typeof m.content === 'string') {
          system.push({ text: m.content });
        }
        continue;
      }
      
      const content: BedrockContentBlock[] = [];
      if (typeof m.content === 'string') {
        content.push({ text: m.content });
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === 'text' && part.text) {
            content.push({ text: part.text });
          } else if (part.type === 'image_url' && part.image_url?.url) {
             const matches = part.image_url.url.match(/^data:image\/([a-z]+);base64,(.+)$/);
             if (matches) {
               const format = matches[1] as BedrockImageFormat;
               const bytes = Buffer.from(matches[2], 'base64');
               content.push({ image: { format, source: { bytes } } });
             }
          }
        }
      }

      // Map other roles to user/assistant. 
      // Note: Bedrock strictly alternates user/assistant usually, but Converse API is more flexible.
      // However, it expects 'user' or 'assistant'.
      const role = m.role === 'user' ? 'user' : 'assistant';
      bedrockMessages.push({
        role,
        content,
      });
    }

    // Map Tools
    let toolConfig: BedrockToolConfiguration | undefined;
    if (Array.isArray(request.tools) && request.tools.length > 0) {
      const tools: BedrockTool[] = request.tools.map((t) => {
        // Safe cast as we know the shape from LlmHostRequest
        const params = t as unknown as { slug?: string; name?: string; description?: string; parameters: unknown };
        return {
          toolSpec: {
            name: params.slug || params.name || 'tool',
            description: params.description,
            inputSchema: { json: params.parameters },
          },
        };
      });
      toolConfig = { tools };
    }

    const input: ConverseStreamCommandInput = {
      modelId: providerModelId,
      messages: bedrockMessages,
      toolConfig,
      inferenceConfig: {
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        topP: request.topP,
      },
    };

    if (system.length > 0) {
      input.system = system;
    }

    try {
      const command = new ConverseStreamCommand(input);
      // Cast to any to avoid spurious TS error "Property 'send' does not exist"
      // which happens despite BedrockRuntimeClient inheriting from Client
      const response = await (client as any).send(command);

      async function* gen() {
        if (!response.stream) return;

        // Bedrock streams a sequence of structured events (messageStart,
        // contentBlockStart, contentBlockDelta, contentBlockStop, messageStop, ...).
        // We normalize these into OpenAI-style ChatCompletionChunk objects so the
        // existing LLM node tooling (including tool call handling) continues to work.
        type BedrockToolUseState = {
          toolUseId: string;
          name: string;
        };
        const toolUseStates: Record<number, BedrockToolUseState> = {};

        for await (const event of response.stream as AsyncIterable<any>) {
          // Text deltas
          if (event.contentBlockDelta && event.contentBlockDelta.delta) {
            const idx = event.contentBlockDelta.contentBlockIndex ?? 0;
            const delta = event.contentBlockDelta.delta;

            // Tool calling: map Bedrock toolUse deltas to OpenAI-style tool_calls
            if (delta.toolUse) {
              const toolState = toolUseStates[idx];
              if (toolState) {
                const argsFragment = typeof delta.toolUse.input === 'string' ? delta.toolUse.input : '';
                yield {
                  id: 'bedrock-stream',
                  object: 'chat.completion.chunk',
                  created: Date.now(),
                  model: providerModelId,
                  choices: [
                    {
                      index: idx,
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: toolState.toolUseId,
                            type: 'function',
                            function: {
                              name: toolState.name,
                              arguments: argsFragment,
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                };
              }
              continue;
            }

            // Plain text delta
            if (typeof delta.text === 'string' && delta.text.length > 0) {
              yield {
                id: 'bedrock-stream',
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: providerModelId,
                choices: [
                  {
                    index: idx,
                    delta: { content: delta.text },
                    finish_reason: null,
                  },
                ],
              };
            }
          }

          // Tool use start: remember toolUseId + name for this content block index
          if (event.contentBlockStart && event.contentBlockStart.start?.toolUse) {
            const idx = event.contentBlockStart.contentBlockIndex ?? 0;
            const tu = event.contentBlockStart.start.toolUse;
            if (tu && typeof tu.toolUseId === 'string' && typeof tu.name === 'string') {
              toolUseStates[idx] = {
                toolUseId: tu.toolUseId,
                name: tu.name,
              };
            }
            continue;
          }

          // We currently don't need to emit anything for messageStart/contentBlockStop/messageStop
          // because the LLM node infers finishReason when the stream completes and tool calls
          // are reconstructed from the accumulated tool_calls deltas.
        }
      }

      return gen();
    } catch (e: unknown) {
      console.error('[RunnerHostRuntime.llm] Bedrock error', e);
      throw e;
    }
  };

  const invokeOpenRouter = async (request: LlmHostRequest, providerModelId: string): Promise<AsyncIterable<unknown>> => {
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
  };

  return { http, connectorAction, llm };
}
