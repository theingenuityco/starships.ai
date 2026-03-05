import type { HostRuntime, LlmHostRequest } from '@starships/autopilot';
import type {
  ConnectorEndpointV2,
  ConnectorHttpEndpointV2,
  ConnectorSqlEndpointV2,
  ConnectorSessionV2,
  ConnectorDbSessionV2,
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
import { invokeAzureAiFoundry } from './azure-ai-foundry';
import { Pool } from 'pg';
import type { FieldDef, PoolClient } from 'pg';
import { lookup } from 'node:dns/promises';
import { STATUS_CODES } from 'node:http';
import { Socket } from 'node:net';
import { ensureSingleStatement, hostMatchesAllowlist, isPrivateIp, isReadOnlyStatement } from './sqlGuards';

function isSqlEndpoint(endpoint: ConnectorEndpointV2): endpoint is ConnectorSqlEndpointV2 {
  return (endpoint as { kind?: unknown }).kind === 'sql';
}

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
]);

const SENSITIVE_URL_PARAM_KEYS = new Set([
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

function redactHeadersForLogs(h: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(h)) {
    const lk = k.toLowerCase();
    out[k] = SENSITIVE_HEADER_KEYS.has(lk) ? '[REDACTED]' : v;
  }
  return out;
}

function redactUrlForLogs(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    for (const [k] of u.searchParams) {
      if (SENSITIVE_URL_PARAM_KEYS.has(k.toLowerCase())) {
        u.searchParams.set(k, '[REDACTED]');
      }
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function summarizeFetchError(err: unknown): Record<string, unknown> {
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
  const summary = code && msg ? `${code}: ${msg}` : code ? code : msg ? msg : typeof err === 'string' ? err : 'fetch failed';

  return {
    summary,
    error: primary,
    cause: underlying,
  };
}

function getHeaderValue(h: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!h) return undefined;
  const direct = h[name];
  if (typeof direct === 'string') return direct;
  const alt = h[name.toLowerCase()];
  if (typeof alt === 'string') return alt;
  const alt2 = h[name.toUpperCase()];
  if (typeof alt2 === 'string') return alt2;
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === target && typeof v === 'string') return v;
  }
  return undefined;
}

function normalizeHeadersToStrings(h: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h || {})) {
    if (!k) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
    else if (Array.isArray(v)) out[k] = v.map((x) => (x === undefined || x === null ? '' : String(x))).filter(Boolean).join(',');
    else out[k] = String(v);
  }
  return out;
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return t.startsWith('{') || t.startsWith('[');
}

function coerceHttpStatusCode(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.floor(v);
    return n >= 100 && n <= 599 ? n : null;
  }
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) {
      const m = Math.floor(n);
      return m >= 100 && m <= 599 ? m : null;
    }
  }
  return null;
}

function statusTextFromCode(code: number): string {
  return STATUS_CODES[code] ?? String(code);
}

/**
 * Connector sessions passed from the embedding host (API server) to the runner.
 *
 * Sessions carry injected auth headers (never exposed to workflows).
 */
export type ConnectorSession = ConnectorSessionV2;

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

export interface AzureAiFoundryRuntimeConfig {
  apiKey: string;
  endpoint: string;
  apiVersion?: string;
  defaultHeaders?: Record<string, string>;
}

export interface ProviderRoute {
  provider: 'openrouter' | 'aws_bedrock' | 'azure_ai_foundry';
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
   * Azure AI Foundry runtime configuration.
   */
  azureAiFoundry?: AzureAiFoundryRuntimeConfig;

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

  const tcpProbe = async (
    host: string,
    port: number,
    timeoutMs: number = 1500
  ): Promise<{ outcome: 'connected' | 'timeout' | 'error'; elapsedMs: number; error: string | null }> => {
    const startedAt = Date.now();
    const socket = new Socket();
    let finished = false;

    return await new Promise((resolve) => {
      const finish = (outcome: 'connected' | 'timeout' | 'error', err?: unknown) => {
      if (finished) return;
      finished = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      const payload = {
        outcome,
        elapsedMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : err ? String(err) : null,
      };
      resolve(payload);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish('connected'));
    socket.once('timeout', () => finish('timeout'));
    socket.once('error', (e) => finish('error', e));
    socket.connect({ host, port });
    });
  };

  // Best-effort DB pool cache (per-process).
  const pgPools = new Map<string, Pool>();
  const getPgPool = (db: ConnectorDbSessionV2): Pool => {
    const key = JSON.stringify({
      driver: db.driver,
      host: db.host,
      port: db.port,
      database: db.database,
      user: db.user,
      password: db.password ?? '',
      ssl: Boolean(db.ssl),
    });
    const existing = pgPools.get(key);
    if (existing) return existing;

    const ssl =
      db.ssl === true
        ? {
            rejectUnauthorized: true,
          }
        : db.ssl === false
          ? false
          : undefined;

    const pool = new Pool({
      host: db.host,
      port: db.port,
      database: db.database,
      user: db.user,
      password: db.password,
      ssl,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pgPools.set(key, pool);
    return pool;
  };

  const assertDbHostAllowed = async (host: string): Promise<void> => {
    const h = host.trim();
    if (!h) throw new Error('DB host is required');
    if (h.toLowerCase() === 'localhost' || h.toLowerCase().endsWith('.localhost')) {
      throw new Error('DB host is not allowed');
    }

    const allowPrivate = process.env.CONNECTOR_DB_ALLOW_PRIVATE_NETWORKS === 'true' || process.env.CONNECTOR_DB_ALLOW_PRIVATE_NETWORKS === '1';
    const allowlistRaw = process.env.CONNECTOR_DB_ALLOWED_HOSTS ?? '';
    const allowlist = allowlistRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowlist.length > 0 && !hostMatchesAllowlist(h, allowlist)) {
      throw new Error('DB host is not in allowlist');
    }

    // If host is a literal IP, enforce private checks directly.
    if (isPrivateIp(h)) {
      if (!allowPrivate) throw new Error('DB host resolves to a private network and is blocked by policy');
      return;
    }

    // Best-effort DNS resolution to catch private endpoints behind hostnames.
    try {
      const dnsStartedAt = Date.now();
      const records = await lookup(h, { all: true });
      const dnsElapsedMs = Date.now() - dnsStartedAt;
      const privateAddrs = records.filter((r) => isPrivateIp(r.address)).map((r) => r.address);
      const resolved = records.slice(0, 3).map((r) => ({ address: r.address, family: r.family ?? null }));
      void dnsElapsedMs;
      void resolved;
      void privateAddrs;
      for (const r of records) {
        if (isPrivateIp(r.address) && !allowPrivate) {
          throw new Error('DB host resolves to a private network and is blocked by policy');
        }
      }
    } catch (e) {
      // If DNS lookup fails, fall back to the allowlist result (if configured),
      // otherwise let the connection attempt fail with a clearer error.
      if (allowlist.length > 0) throw e;
    }
  };


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
        // Default: best-effort JSON, otherwise text. Read once to avoid
        // Undici "Body has already been read" when JSON parsing fails.
        const text = await resp.text();
        if (contentType.includes('application/json')) {
          try {
            responseBody = text.trim().length ? JSON.parse(text) : text;
          } catch {
            responseBody = text;
          }
        } else {
          responseBody = text;
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

  const unwrapBrightDataEnvelope = (
    resp: Awaited<ReturnType<HostRuntime['http']>>
  ): Awaited<ReturnType<HostRuntime['http']>> => {
    const body = resp?.body as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return resp;
    const obj = body as Record<string, unknown>;
    const status =
      coerceHttpStatusCode(obj.status_code) ?? coerceHttpStatusCode(obj.statusCode) ?? coerceHttpStatusCode(obj.status) ?? null;
    if (status === null) return resp;

    const headersRaw = obj.headers && typeof obj.headers === 'object' && !Array.isArray(obj.headers) ? (obj.headers as Record<string, unknown>) : null;
    const headers = headersRaw ? normalizeHeadersToStrings(headersRaw) : (resp.headers as Record<string, string>);
    const url = typeof obj.url === 'string' && obj.url.trim().length > 0 ? obj.url.trim() : resp.url;

    const payloadBody = obj.body ?? obj.result;
    const contentType = (getHeaderValue(headersRaw ?? (headers as unknown as Record<string, unknown>), 'content-type') ?? '').toLowerCase();

    let outBody: unknown = payloadBody;
    if (typeof payloadBody === 'string') {
      const t = payloadBody;
      if (contentType.includes('application/json') || looksLikeJson(t)) {
        try {
          outBody = t.trim().length ? JSON.parse(t) : t;
        } catch {
          outBody = t;
        }
      } else {
        outBody = t;
      }
    }

    return {
      status,
      statusText: statusTextFromCode(status),
      headers,
      body: outBody,
      url,
    };
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

    // SQL endpoints (native DB transport)
    if (isSqlEndpoint(endpoint)) {
      const e = endpoint;
      if (String(e.driver || '').trim().toLowerCase() !== 'postgres') {
        throw new Error(`Unsupported SQL driver for connector "${c}": ${String(e.driver || '')}`);
      }

      const session = connectorSessions[c] as ConnectorSession | undefined;
      const db = session?.db;
      if (!db) {
        throw new Error(`Connector "${c}" does not have a DB session (not connected or missing db config)`);
      }

      await assertDbHostAllowed(db.host);

      const sqlRaw = evalTemplate(e.sql, ctx);
      const sql = ensureSingleStatement(String(sqlRaw ?? ''));
      if (!sql.trim()) throw new Error(`Empty SQL for connector "${c}" action "${a}"`);

      const readOnly = e.readOnly !== false;
      if (readOnly && !isReadOnlyStatement(sql)) {
        throw new Error('SQL statement is not allowed (read-only policy)');
      }

      const mode: 'query' | 'execute' = e.mode === 'execute' ? 'execute' : 'query';
      const rowLimitHint = typeof e.rowLimit === 'number' && Number.isFinite(e.rowLimit) ? Math.max(1, Math.floor(e.rowLimit)) : null;
      const maxRows = Math.min(rowLimitHint ?? 1000, 5000);

      const argsRec = args as Record<string, unknown>;
      const paramsRaw = argsRec.params;
      const params: unknown[] = paramsRaw === undefined ? [] : Array.isArray(paramsRaw) ? paramsRaw : (() => { throw new Error('args.params must be an array when provided'); })();

      const hostLower = String(db.host).toLowerCase();
      const isSupabaseHost = hostLower.endsWith('.supabase.co');
      const isDefaultPgPort = Number(db.port) === 5432;

      // Fast preflight: if we can't open a TCP connection, the query will never succeed.
      const preflightMain = await tcpProbe(db.host, db.port, 1500);
      const preflightPooler = isSupabaseHost && isDefaultPgPort ? await tcpProbe(db.host, 6543, 1500) : null;

      if (preflightMain.outcome !== 'connected' && (preflightPooler?.outcome ?? 'timeout') !== 'connected') {
        let resolvedIp: string | null = null;
        try {
          const r = await lookup(String(db.host), { family: 4 });
          resolvedIp = r?.address ?? null;
        } catch {
          // ignore
        }
        const extra =
          isSupabaseHost && isDefaultPgPort
            ? ' For Supabase, also verify your project Network Restrictions / IP allowlist and consider using the pooler port (6543) if required.'
            : '';
        throw new Error(
          `Cannot reach Postgres host "${db.host}" on port ${db.port} (TCP ${preflightMain.outcome}${resolvedIp ? `; resolved IPv4 ${resolvedIp}` : ''}). This looks like a network/firewall/egress restriction: the runner must be able to open outbound TCP to your database port.${extra}`
        );
      }

      const pool = getPgPool(db);

      // Ensure timeouts are bounded and safe.
      const effectiveTimeoutMs =
        typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
          ? Math.min(120_000, Math.floor(timeoutMs))
          : typeof e.timeoutMs === 'number' && Number.isFinite(e.timeoutMs) && e.timeoutMs > 0
            ? Math.min(120_000, Math.floor(e.timeoutMs))
            : 30_000;

      const safeUrl = `sql:postgres://${encodeURIComponent(db.host)}:${encodeURIComponent(String(db.port))}/${encodeURIComponent(db.database)}`;

      const connectStartedAt = Date.now();
      let client: PoolClient;
      try {
        client = await pool.connect();
      } catch (err) {
        const code = (err as { code?: unknown } | null)?.code;
        if (
          code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
          code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
          code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
        ) {
          throw new Error(
            [
              `Postgres SSL verification failed while connecting to "${db.host}:${db.port}" (${String(code)}).`,
              `This usually means the server (or a network proxy) presented a certificate chain that isn't trusted by the runner.`,
              `Fix options:`,
              `- Ensure your DB endpoint presents a publicly trusted TLS certificate chain (no MITM/proxy inserting a self-signed cert).`,
              `- If you're using a pooler/proxy, ensure it is configured with a trusted certificate chain.`,
            ].join(' ')
          );
        }
        throw err;
      }
      try {
        void connectStartedAt;

        // Apply statement timeout for this session.
        // Note: statement_timeout is per-connection; we reset defensively for every call.
        await client.query(`SET statement_timeout = ${effectiveTimeoutMs}`);

        // Best-effort: cap query result size by truncating rows array (does not stop the server from producing more).
        // For strict limits, prefer writing templates with LIMIT, or add a gateway in front.
        const startedAt = Date.now();
        const result =
          mode === 'execute'
            ? await client.query({ text: sql, values: params })
            : await client.query({ text: sql, values: params });
        const elapsedMs = Date.now() - startedAt;
        void elapsedMs;

        const fields = Array.isArray(result.fields)
          ? (result.fields as FieldDef[]).map((f: FieldDef) => ({ name: f.name, dataTypeId: f.dataTypeID }))
          : [];
        const rows = Array.isArray(result.rows) ? result.rows.slice(0, maxRows) : [];

        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: {
            driver: 'postgres',
            command: result.command,
            rowCount: typeof result.rowCount === 'number' ? result.rowCount : null,
            fields,
            rows,
            truncated: Array.isArray(result.rows) ? result.rows.length > rows.length : false,
          },
          url: safeUrl,
        };
      } finally {
        client.release();
      }
    }

    // HTTP endpoints (existing behavior)
    const httpEndpoint: ConnectorHttpEndpointV2 = endpoint;
    const baseUrlRaw = httpEndpoint.baseUrlOverride || tpl.baseUrl;
    const baseUrlEvaluated = String(evalTemplate(baseUrlRaw, ctx) ?? '').trim();
    if (!/^https?:\/\//i.test(baseUrlEvaluated)) {
      throw new Error(`Invalid baseUrl for connector "${c}": must be absolute http(s) URL`);
    }

    // Resolve path variables
    const pathVars: Record<string, ExprString> = httpEndpoint.mapping?.path ?? {};
    const resolvedPath = String(httpEndpoint.path || '').replace(/\{([^}]+)\}/g, (_m, name) => {
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
    if (httpEndpoint.mapping?.headers) {
      for (const [k, v] of Object.entries(httpEndpoint.mapping.headers)) {
        const out = evalTemplate(v, ctx);
        headers[k] = out;
      }
    }

    // Build query/body based on mapping or requestStyle
    const method: HttpMethod = httpEndpoint.method;
    let finalUrl = url;
    let body: unknown = undefined;

    const mapping = httpEndpoint.mapping;
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

    const resp = await http({
      method,
      url: finalUrl,
      headers,
      body,
      timeoutMs,
    });
    // Reserved system connector: unwrap Bright Data /request envelopes into a normalized HTTP response.
    if (c === 'system' && (a === 'webFetch' || a === 'webSearch')) {
      return unwrapBrightDataEnvelope(resp);
    }
    return resp;
  };

  const llm = async (request: LlmHostRequest): Promise<AsyncIterable<unknown>> => {
    const __getAttachmentPreviewUrls = async (ids: string[]): Promise<Array<{ id: string; previewUrl: string }>> => {
      const starshipIdRaw = (runtimeEnv as Record<string, unknown>)?.STARSHIP_ID;
      const starshipId = typeof starshipIdRaw === 'string' && starshipIdRaw.trim().length > 0 ? starshipIdRaw.trim() : '';
      const serverUrlRaw = (runtimeEnv as Record<string, unknown>)?.SERVER_URL;
      const serverUrl = typeof serverUrlRaw === 'string' ? serverUrlRaw.trim().replace(/\/+$/, '') : '';
      if (!serverUrl || !starshipId || !Array.isArray(ids) || ids.length === 0) return [];

      const authHeaders = connectorSessions['starships']?.headers ?? {};
      const url = `${serverUrl}/api/v1/attachments?ids=${encodeURIComponent(ids.join(','))}&starshipId=${encodeURIComponent(starshipId)}`;
      const resp = await http({
        method: 'GET',
        url,
        headers: authHeaders as unknown as Record<string, unknown>,
        timeoutMs: 15000,
      });

      const body = resp?.body as unknown;
      const list =
        Array.isArray(body)
          ? body
          : body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).data)
            ? ((body as Record<string, unknown>).data as unknown[])
            : body && typeof body === 'object' && (body as Record<string, unknown>).success === true && Array.isArray((body as Record<string, unknown>).data)
              ? ((body as Record<string, unknown>).data as unknown[])
              : [];

      const out: Array<{ id: string; previewUrl: string }> = [];
      for (const a of list) {
        if (!a || typeof a !== 'object') continue;
        const rec = a as Record<string, unknown>;
        const id = rec.id;
        const pr = rec.previewUrl;
        if (typeof id === 'string' && id.trim() && typeof pr === 'string' && pr.trim()) {
          out.push({ id: id.trim(), previewUrl: pr.trim() });
        }
      }
      return out;
    };

    // Best-effort: refresh any short-lived presigned attachment URLs embedded in message content blocks.
    // Some upstream paths (ConversationService.buildMessageContent) generate 60s URLs, which can expire mid-run.
    const __refreshEmbeddedAttachmentUrls = async (): Promise<void> => {
      try {
        const msgs = Array.isArray(request.messages) ? (request.messages as unknown[]) : [];
        if (msgs.length === 0) return;

        const ATTACHMENT_ID_RE = /attachmentId="([^"]+)"/g;
        const ids: string[] = [];
        const seen = new Set<string>();

        for (const m of msgs) {
          if (!m || typeof m !== 'object') continue;
          const rec = m as Record<string, unknown>;
          const c = rec.content;
          if (!Array.isArray(c)) continue;
          for (const part of c as unknown[]) {
            if (!part || typeof part !== 'object') continue;
            const p = part as Record<string, unknown>;
            if (p.type !== 'text' || typeof p.text !== 'string') continue;
            const text = p.text;
            if (!text.includes('attachmentId="')) continue;
            ATTACHMENT_ID_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = ATTACHMENT_ID_RE.exec(text))) {
              const id = match[1]?.trim();
              if (id && !seen.has(id)) {
                seen.add(id);
                ids.push(id);
              }
            }
          }
        }

        if (ids.length === 0) return;

        const urlById = new Map<string, string>();
        const list = await __getAttachmentPreviewUrls(ids);
        for (const a of list) urlById.set(a.id, a.previewUrl);
        if (urlById.size === 0) return;

        let replacedImageUrls = 0;
        let replacedFiles = 0;

        for (const m of msgs) {
          if (!m || typeof m !== 'object') continue;
          const rec = m as Record<string, unknown>;
          const c = rec.content;
          if (!Array.isArray(c)) continue;
          let currentAttachmentId: string | undefined;
          for (const part of c as unknown[]) {
            if (!part || typeof part !== 'object') continue;
            const p = part as Record<string, unknown>;
            if (p.type === 'text' && typeof p.text === 'string' && p.text.includes('attachmentId="')) {
              ATTACHMENT_ID_RE.lastIndex = 0;
              const m1 = ATTACHMENT_ID_RE.exec(p.text);
              const id = m1?.[1]?.trim();
              if (id) currentAttachmentId = id;
              continue;
            }
            if (p.type === 'image_url' && p.image_url && typeof p.image_url === 'object') {
              const next = currentAttachmentId ? urlById.get(currentAttachmentId) : undefined;
              if (next) {
                (p.image_url as Record<string, unknown>).url = next;
                replacedImageUrls++;
              }
              continue;
            }
            if (p.type === 'file' && p.file && typeof p.file === 'object') {
              const next = currentAttachmentId ? urlById.get(currentAttachmentId) : undefined;
              if (next && typeof (p.file as Record<string, unknown>).file_data !== 'undefined') {
                (p.file as Record<string, unknown>).file_data = next;
                replacedFiles++;
              }
              continue;
            }
          }
        }

        void replacedImageUrls;
        void replacedFiles;
      } catch {
        // best-effort: ignore refresh failures
      }
    };
    await __refreshEmbeddedAttachmentUrls();

    // Best-effort: If a tool message references attachments but does not include previewUrl,
    // resolve preview URLs via Starships connector so vision-capable providers can see images.
    // This is intentionally implemented at the host runtime layer so it works regardless of runner type.
    const __augmentVision = async (): Promise<void> => {
      try {
        const msgs = Array.isArray(request.messages) ? (request.messages as unknown[]) : [];
        if (msgs.length === 0) return;

        const MARKER_TEXT = '[Tool produced image attachment(s)]';

        // Strip any previously injected tool-image hint messages so we never reuse expired signed URLs.
        // We will re-inject fresh preview URLs on every call when attachments are present.
        let removedHintMessages = 0;
        const filtered: unknown[] = [];
        for (const m of msgs) {
          if (!m || typeof m !== 'object') {
            filtered.push(m);
            continue;
          }
          const rec = m as Record<string, unknown>;
          const role = rec.role;
          const c = rec.content;
          if (role === 'user' && Array.isArray(c)) {
            let hasMarker = false;
            let hasImageUrl = false;
            for (const part of c as unknown[]) {
              if (!part || typeof part !== 'object') continue;
              const p = part as Record<string, unknown>;
              if (p.type === 'text' && p.text === MARKER_TEXT) hasMarker = true;
              if (p.type === 'image_url') hasImageUrl = true;
            }
            if (hasMarker && hasImageUrl) {
              removedHintMessages++;
              continue;
            }
          }
          filtered.push(m);
        }
        if (removedHintMessages > 0) {
          // IMPORTANT: Assign back to request.messages (type assertion on LHS is not reliable)
          (request as unknown as { messages: unknown[] }).messages = filtered;
        }

        const ids: string[] = [];
        const seen = new Set<string>();
        const msgsAfterStrip = Array.isArray(request.messages) ? (request.messages as unknown[]) : [];
        for (const m of msgsAfterStrip) {
          if (!m || typeof m !== 'object') continue;
          const role = (m as Record<string, unknown>).role;
          if (role !== 'tool') continue;
          const content = (m as Record<string, unknown>).content;
          if (typeof content !== 'string') continue;
          if (!content.includes('"attachments"')) continue;
          try {
            const parsed = JSON.parse(content) as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
            const rec = parsed as Record<string, unknown>;
            const atts = Array.isArray(rec.attachments) ? rec.attachments : [];
            for (const a of atts) {
              if (!a || typeof a !== 'object') continue;
              const id = (a as Record<string, unknown>).id;
              if (typeof id === 'string' && id.trim().length > 0 && !seen.has(id.trim())) {
                seen.add(id.trim());
                ids.push(id.trim());
              }
            }
          } catch {
            // If the tool content isn't valid JSON (e.g., truncated), we can't reliably extract ids.
            continue;
          }
        }

        if (ids.length === 0) return;

        const starshipIdRaw = (runtimeEnv as Record<string, unknown>)?.STARSHIP_ID;
        const starshipId = typeof starshipIdRaw === 'string' && starshipIdRaw.trim().length > 0 ? starshipIdRaw.trim() : '';

        // Resolve previewUrl via existing Starships connector endpoint.
        const resp = await connectorAction({
          connector: 'starships',
          action: 'get-attachments-preview-urls',
          args: { ...(starshipId ? { starshipId } : {}), ids: ids.join(',') },
          timeoutMs: 15000,
        });

        const body = resp?.body as unknown;
        const list =
          Array.isArray(body)
            ? body
            : body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).data)
              ? ((body as Record<string, unknown>).data as unknown[])
              : body && typeof body === 'object' && (body as Record<string, unknown>).success === true && Array.isArray((body as Record<string, unknown>).data)
                ? ((body as Record<string, unknown>).data as unknown[])
                : [];

        const previewUrls: string[] = [];
        for (const a of list) {
          if (!a || typeof a !== 'object') continue;
          const rec = a as Record<string, unknown>;
          const pr = rec.previewUrl;
          if (typeof pr === 'string' && pr.trim().length > 0) previewUrls.push(pr.trim());
        }

        if (previewUrls.length === 0) return;

        // Append a provider-friendly multimodal user message (max 8 images).
        (request.messages as unknown[]).push({
          role: 'user',
          content: [
            { type: 'text', text: MARKER_TEXT },
            ...previewUrls.slice(0, 8).map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        });

      } catch {
        // best-effort: ignore augmentation failures
      }
    };
    await __augmentVision();

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
        if (provider === 'azure_ai_foundry') {
          return await invokeAzureAiFoundry(request, providerModelId, { azure: options.azureAiFoundry, signal: options.signal });
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
