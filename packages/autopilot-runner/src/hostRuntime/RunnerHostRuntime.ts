import type { HostRuntime, LlmHostRequest } from '@starships/autopilot';
import type {
  ConnectorEndpointV2,
  ConnectorTemplateRuntimeFieldsV2,
  ConnectorQueryParamMapping,
  ExprString,
  HttpMethod,
  QueryParamEncoding,
} from '@starships/protocol/src/domains/connector';
import { CancelledError } from '@starships/autopilot';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { invokeBedrock } from './bedrock';
import { invokeOpenRouter } from './openrouter';

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

  const http: HostRuntime['http'] = async (request) => {
    const { method, url, headers = {}, body, timeoutMs } = request as {
      method: string;
      url: string;
      headers?: Record<string, unknown>;
      body?: unknown;
      timeoutMs?: number;
    };
    // Backward/forward compatible: older @starships/autopilot types may not include this field.
    const responseTypeRaw = (request as { responseType?: unknown } | null | undefined)?.responseType;
    const responseType =
      responseTypeRaw === 'json' ||
      responseTypeRaw === 'text' ||
      responseTypeRaw === 'arrayBuffer' ||
      responseTypeRaw === 'base64'
        ? responseTypeRaw
        : undefined;
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
          errno: typeof rec.errno === 'number' ? rec.errno : undefined,
          syscall: typeof rec.syscall === 'string' ? rec.syscall : undefined,
          address: typeof rec.address === 'string' ? rec.address : undefined,
          port: typeof rec.port === 'number' ? rec.port : undefined,
          hostname: typeof rec.hostname === 'string' ? rec.hostname : undefined,
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

      // Respect explicit responseType first
      if (responseType === 'arrayBuffer') {
        responseBody = await resp.arrayBuffer();
      } else if (responseType === 'base64') {
        const ct = (resp.headers.get('content-type') || 'application/octet-stream').trim() || 'application/octet-stream';
        const ab = await resp.arrayBuffer();
        const b64 = Buffer.from(ab).toString('base64');
        responseBody = `data:${ct};base64,${b64}`;
      } else if (responseType === 'text') {
        responseBody = await resp.text();
      } else {
        // Default: best-effort JSON, otherwise text
        if (contentType.includes('application/json')) {
          try {
            responseBody = await resp.json();
          } catch {
            responseBody = await resp.text();
          }
        } else {
          responseBody = await resp.text();
        }
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
    if (!Array.isArray(configuredRoutes) || configuredRoutes.length === 0) {
      throw new Error(`No provider routes configured for model "${request.model}". Configure routes via modelRoutes in RunnerHostRuntimeOptions.`);
    }
    const routes: ProviderRoute[] = configuredRoutes;

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
          const client = getBedrockClient();
          return await invokeBedrock(request, providerModelId, { client, signal: options.signal });
        }

        // Default/OpenRouter
        return await invokeOpenRouter(request, providerModelId, { llm: options.llm, signal: options.signal });
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
          (err as Error & { causes?: typeof failures }).causes = failures;
          throw err;
        }
        // Otherwise, continue to the next provider route.
      }
    }

    // Should be unreachable, but keep a defensive fallback.
    throw new Error('No LLM provider routes available');
  };

  return { http, connectorAction, llm };
}
