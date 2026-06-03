/**
 * Authed HTTP client handed to a code connector action (`ctx.http`).
 *
 * Resolves a relative path against the connector's effective base URL, merges default +
 * session (auth) + per-call headers, standard-encodes query params, and normalizes the
 * response into the HttpEnvelope shape. Response/body semantics mirror the former runner
 * `http()` so behavior is unchanged after moving execution server-side.
 */

import type { AuthedHttp, HttpEnvelope, HttpRequestOptions } from '@starships/connectors';

export interface AuthedHttpOptions {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  sessionHeaders?: Record<string, unknown>;
  defaultTimeoutMs?: number;
  signal?: AbortSignal;
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

function buildQuery(query: Record<string, unknown> | undefined, rawQuery: string | undefined): string {
  const parts: string[] = [];
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      // Drop absent params. Code actions commonly use a "" fallback for optional
      // query args; treat empty string as absent so we don't emit `key=`.
      if (v === undefined || v === null || v === '') continue;
      qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) parts.push(s);
  }
  if (rawQuery && rawQuery.trim()) parts.push(rawQuery.replace(/^\?/, ''));
  return parts.join('&');
}

function mergeHeaders(...sources: Array<Record<string, unknown> | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined || v === null) continue;
      out[k] = String(v);
    }
  }
  return out;
}

export function createAuthedHttp(opts: AuthedHttpOptions): AuthedHttp {
  const request = async (method: string, path: string, reqOpts: HttpRequestOptions = {}): Promise<HttpEnvelope> => {
    const finalMethod = method.toUpperCase();
    let url = joinUrl(opts.baseUrl, path);
    const q = buildQuery(reqOpts.query, reqOpts.rawQuery);
    if (q) url = `${url}${url.includes('?') ? '&' : '?'}${q}`;

    const headers = mergeHeaders(opts.defaultHeaders, opts.sessionHeaders, reqOpts.headers);

    const timeout =
      typeof reqOpts.timeoutMs === 'number' && Number.isFinite(reqOpts.timeoutMs) && reqOpts.timeoutMs > 0
        ? reqOpts.timeoutMs
        : opts.defaultTimeoutMs && opts.defaultTimeoutMs > 0
          ? opts.defaultTimeoutMs
          : 30000;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutController.signal]) : timeoutController.signal;

    try {
      const init: RequestInit = { method: finalMethod, headers, signal };
      const body = reqOpts.body;
      if (body !== undefined && finalMethod !== 'GET' && finalMethod !== 'HEAD') {
        if (
          typeof body === 'string' ||
          (typeof Blob !== 'undefined' && body instanceof Blob) ||
          (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
          (typeof FormData !== 'undefined' && body instanceof FormData) ||
          body instanceof ArrayBuffer ||
          ArrayBuffer.isView(body)
        ) {
          init.body = body as RequestInit['body'];
        } else {
          init.body = JSON.stringify(body);
          const h = new Headers(init.headers as RequestInit['headers']);
          if (!h.has('content-type')) h.set('content-type', 'application/json');
          init.headers = h;
        }
      }

      const resp = await fetch(url, init);
      const contentType = resp.headers.get('content-type') || '';
      let responseBody: unknown;
      if (reqOpts.responseType === 'arrayBuffer') {
        responseBody = await resp.arrayBuffer();
      } else if (reqOpts.responseType === 'base64') {
        const ct = (resp.headers.get('content-type') || 'application/octet-stream').trim() || 'application/octet-stream';
        const ab = await resp.arrayBuffer();
        responseBody = `data:${ct};base64,${Buffer.from(ab).toString('base64')}`;
      } else if (reqOpts.responseType === 'text') {
        responseBody = await resp.text();
      } else {
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

      return { status: resp.status, statusText: resp.statusText, headers: responseHeaders, body: responseBody, url: resp.url };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return {
    request,
    get: (path, o) => request('GET', path, o),
    post: (path, o) => request('POST', path, o),
    put: (path, o) => request('PUT', path, o),
    patch: (path, o) => request('PATCH', path, o),
    delete: (path, o) => request('DELETE', path, o),
  };
}
