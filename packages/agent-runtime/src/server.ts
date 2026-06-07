// The agent-runtime HTTP service.
//
// Runs as a local sidecar the desktop spawns (and is deployable to the cloud unchanged,
// since it only ever reads keys from env). The webview POSTs a run and reads the result
// as an SSE stream of Claude-compatible stream-json lines; mid-run tool approvals flow
// back over a separate POST.
//
// On boot it prints `RUNTIME_LISTENING {"port":<n>}` to stdout so the parent process can
// discover the (possibly OS-assigned) port. SSE/results travel over HTTP, never stdout.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { runAgent } from './runtime';
import { validateKey } from './validate';
import type { ApprovalDecision, ProviderId, RunRequest } from './types';

interface ActiveRun {
  abort: AbortController;
  /** toolUseId -> resolver for a parked approval request. */
  pending: Map<string, (d: ApprovalDecision) => void>;
}

const runs = new Map<string, ActiveRun>();

const app = new Hono();

// The desktop webview (origin tauri://localhost, or http://localhost:<port> under the dev
// server) calls this over http://127.0.0.1, which is cross-origin — without CORS headers
// WKWebView blocks every fetch with "Load failed". Restrict CORS to the app's own webview
// origins so a page in the user's system browser can't drive the loopback service via fetch.
const ALLOWED_ORIGINS = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);
function corsOrigin(origin: string): string | null {
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  // Tauri dev runs the webview from the local vite server.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}
app.use('*', cors({ origin: corsOrigin, allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type'] }));

app.get('/health', (c) => c.json({ ok: true }));

app.post('/validate', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { provider?: ProviderId; apiKey?: string };
  if (!body.provider || !body.apiKey) return c.json({ ok: false, error: 'provider and apiKey required' }, 400);
  return c.json(await validateKey(body.provider, body.apiKey));
});

// Validate the key already in this service's env (injected from the OS keychain at spawn).
// Lets the desktop re-test a saved key without ever handling the secret in the webview.
app.get('/validate-stored', async (c) => {
  const provider = c.req.query('provider') as ProviderId | undefined;
  if (provider !== 'anthropic' && provider !== 'openai') return c.json({ ok: false, error: 'unknown provider' }, 400);
  const key = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (!key) return c.json({ ok: false, error: 'no key configured' });
  return c.json(await validateKey(provider, key));
});

// Deliver an approval decision to a parked tool call.
app.post('/runs/:id/approve', async (c) => {
  const run = runs.get(c.req.param('id'));
  const body = (await c.req.json().catch(() => ({}))) as { toolUseId?: string; decision?: ApprovalDecision };
  if (!run || !body.toolUseId || !body.decision) return c.json({ ok: false }, 404);
  const resolve = run.pending.get(body.toolUseId);
  if (!resolve) return c.json({ ok: false, error: 'no such pending approval' }, 404);
  run.pending.delete(body.toolUseId);
  resolve(body.decision);
  return c.json({ ok: true });
});

// Cancel a run.
app.post('/runs/:id/abort', (c) => {
  const run = runs.get(c.req.param('id'));
  if (run) run.abort.abort();
  return c.json({ ok: Boolean(run) });
});

// Start a run; stream Claude-compatible stream-json lines back as SSE.
app.post('/runs', async (c) => {
  const body = (await c.req.json().catch(() => null)) as (RunRequest & { runId?: string }) | null;
  if (!body || !body.provider || !body.model || typeof body.prompt !== 'string' || !body.sessionId) {
    return c.json({ error: 'provider, model, prompt and sessionId are required' }, 400);
  }
  const runId = body.runId ?? crypto.randomUUID();
  const active: ActiveRun = { abort: new AbortController(), pending: new Map() };
  runs.set(runId, active);
  // Abort the run if the client disconnects.
  c.req.raw.signal.addEventListener('abort', () => active.abort.abort(), { once: true });

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'meta', data: JSON.stringify({ runId }) });
    try {
      await runAgent(body, {
        signal: active.abort.signal,
        onLine: (line) => {
          // Fire-and-forget: writeSSE is async but ordering is preserved by Hono's queue.
          void stream.writeSSE({ event: 'line', data: JSON.stringify(line) });
        },
        requestApproval: (req) =>
          new Promise<ApprovalDecision>((resolve) => {
            // Park the resolver, then ask the client. A disconnect/abort denies.
            active.pending.set(req.toolUseId, resolve);
            const onAbort = () => {
              if (active.pending.delete(req.toolUseId)) resolve('deny');
            };
            active.abort.signal.addEventListener('abort', onAbort, { once: true });
            void stream.writeSSE({ event: 'permission', data: JSON.stringify(req) });
          }),
      });
    } catch (e) {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: e instanceof Error ? e.message : String(e) }) });
    } finally {
      runs.delete(runId);
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ runId }) });
    }
  });
});

const port = Number(process.env.PORT ?? 0);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  // The parent (Tauri) parses this line to learn the actual (possibly OS-assigned) port.
  process.stdout.write(`RUNTIME_LISTENING ${JSON.stringify({ port: info.port })}\n`);
});

// NOTE: intentionally no module exports here — when this file is the bundle entry, a default
// export that looks like a server config makes Bun's `--compile` auto-serve and clash with
// the explicit serve() above. The library surface lives in index.ts.
