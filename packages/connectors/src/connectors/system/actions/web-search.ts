import { z } from 'zod';
import { defineAction } from '../../../framework';
import { unwrapBrightDataEnvelope } from '../envelope';

/** Build the SERP URL for the requested engine, mirroring the former gateway template. */
function buildSerpUrl(args: {
  url?: unknown;
  q?: unknown;
  engine?: unknown;
  hl?: unknown;
  gl?: unknown;
  num?: unknown;
  start?: unknown;
}): string {
  const override = typeof args.url === 'string' ? args.url.trim() : '';
  if (override) return override;
  const q = String(args.q ?? '').trim();
  const engine = String(args.engine ?? 'google').toLowerCase();
  const hl = String(args.hl ?? 'en').trim();
  const gl = String(args.gl ?? 'us').trim();
  const num = args.num;
  const start = args.start;
  if (engine === 'bing') {
    let u = 'https://www.bing.com/search?q=' + encodeURIComponent(q);
    if (hl) u += '&setlang=' + encodeURIComponent(hl);
    if (gl) u += '&cc=' + encodeURIComponent(gl);
    if (typeof start === 'number' && Number.isFinite(start) && start > 0) u += '&first=' + encodeURIComponent(String(Math.floor(start)));
    return u;
  }
  let u = 'https://www.google.com/search?q=' + encodeURIComponent(q);
  if (hl) u += '&hl=' + encodeURIComponent(hl);
  if (gl) u += '&gl=' + encodeURIComponent(gl);
  if (typeof num === 'number' && Number.isFinite(num) && num > 0) u += '&num=' + encodeURIComponent(String(Math.floor(num)));
  if (typeof start === 'number' && Number.isFinite(start) && start > 0) u += '&start=' + encodeURIComponent(String(Math.floor(start)));
  return u;
}

export const webSearch = defineAction({
  name: 'webSearch',
  description: 'Run a web search via the system search gateway',
  method: 'POST',
  path: '/request',
  params: z
    .object({
      q: z.string().describe('Search query'),
      engine: z.enum(['google', 'bing']).describe('Search engine (default google)').optional(),
      hl: z.string().describe('Language code (e.g. en)').optional(),
      gl: z.string().describe('Country code (e.g. us)').optional(),
      num: z.number().describe('Requested number of results (engine dependent)').optional(),
      start: z.number().describe('Result offset / page start (engine dependent)').optional(),
      format: z.enum(['raw', 'json']).describe('Backend response format. Default json.').optional(),
      dataFormat: z.string().describe('Optional backend data_format (e.g. parsed_light, markdown).').optional(),
      country: z.string().describe('Optional ISO country code for routing.').optional(),
      url: z.string().describe('Optional override: full SERP URL to request (advanced)').optional(),
    })
    .catchall(z.unknown()),
  run: (args, ctx) =>
    ctx.http
      .post('/request', {
        timeoutMs: 45000,
        body: {
          zone: String(ctx.metadata.webSearchZone ?? ''),
          url: buildSerpUrl(args),
          format: String(args.format ?? 'json'),
          country: args.country,
          data_format: args.dataFormat,
        },
      })
      .then(unwrapBrightDataEnvelope),
});
