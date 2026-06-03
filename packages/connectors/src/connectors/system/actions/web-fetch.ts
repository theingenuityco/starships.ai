import { z } from 'zod';
import { defineAction } from '../../../framework';
import { unwrapBrightDataEnvelope } from '../envelope';

/** Normalize a caller-supplied headers map into string values, dropping empties. */
function normalizeHeaders(h: unknown): Record<string, string> | undefined {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (!k) continue;
    if (v === undefined || v === null) continue;
    out[k] = Array.isArray(v) ? v.map((x) => String(x)).join(',') : String(v);
  }
  return out;
}

export const webFetch = defineAction({
  name: 'webFetch',
  description: 'Fetch a public URL via the system web fetch gateway',
  method: 'POST',
  path: '/request',
  params: z
    .object({
      url: z.string().describe('Target URL to fetch (absolute http(s) URL)'),
      method: z.string().describe('HTTP method (GET, POST, ...). Default GET.').optional(),
      headers: z.record(z.string(), z.unknown()).describe('Optional headers to send to the target site.').optional(),
      body: z.unknown().describe('Optional request body (string or JSON object). Ignored for GET/HEAD.').optional(),
      format: z.enum(['raw', 'json']).describe('Backend response format. Default raw.').optional(),
      dataFormat: z.string().describe('Optional backend data_format (e.g. markdown, screenshot).').optional(),
      country: z.string().describe('Optional ISO country code for routing.').optional(),
    })
    .catchall(z.unknown()),
  run: (args, ctx) => {
    const method = String(args.method ?? 'GET').toUpperCase();
    let body: string | undefined;
    if (method !== 'GET' && method !== 'HEAD' && args.body !== undefined && args.body !== null) {
      body = typeof args.body === 'string' ? args.body : safeJson(args.body);
    }
    return ctx.http
      .post('/request', {
        timeoutMs: 60000,
        body: {
          zone: String(ctx.metadata.webFetchZone ?? ''),
          url: String(args.url ?? ''),
          format: String(args.format ?? 'raw'),
          method,
          country: args.country,
          data_format: args.dataFormat,
          headers: normalizeHeaders(args.headers),
          body,
        },
      })
      .then(unwrapBrightDataEnvelope);
  },
});

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
