/**
 * Bright Data `/request` envelope normalization, ported verbatim from the former runner
 * interpreter. The gateway returns `{ status_code, headers, body|result, url }`; this
 * unwraps it into a standard HttpEnvelope so callers see the proxied response directly.
 */

import { STATUS_CODES } from 'node:http';
import type { HttpEnvelope } from '../../framework';

function getHeaderValue(h: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!h) return undefined;
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

export function unwrapBrightDataEnvelope(resp: HttpEnvelope): HttpEnvelope {
  const body = resp?.body as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return resp;
  const obj = body as Record<string, unknown>;
  const status =
    coerceHttpStatusCode(obj.status_code) ?? coerceHttpStatusCode(obj.statusCode) ?? coerceHttpStatusCode(obj.status) ?? null;
  if (status === null) return resp;

  const headersRaw =
    obj.headers && typeof obj.headers === 'object' && !Array.isArray(obj.headers) ? (obj.headers as Record<string, unknown>) : null;
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

  return { status, statusText: statusTextFromCode(status), headers, body: outBody, url };
}
