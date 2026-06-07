// Codex app-server JSON-RPC client.
//
// codex has no hook mechanism: `codex exec` is observe-only (no approval channel). The
// supported way to get interactive mid-run approval is `codex app-server` — a persistent
// JSON-RPC server over stdio (newline-delimited JSON, NO `jsonrpc` field). We spawn it as
// a duplex process (see run_agent_duplex), drive the handshake, stream its item.*
// notifications into the live run, and answer its approval requests on its own stdin.
//
// Protocol verified against codex-cli 0.137.0 (github.com/openai/codex, codex-rs/
// app-server-protocol). The v2 (slash-delimited) API is current/default. If a future codex
// changes method names or the decision enum, this file is the single place to adjust.
//
// KNOWN LIMITATIONS (validate against your installed codex):
//   - No cross-turn session resume yet: each turn spins up a fresh app-server run.
//   - cwd is left to codex's default (the app process cwd); there's no project concept here.
//   - Auth/model come from the user's $CODEX_HOME (auth.json) + codex config, as usual.
import { Channel } from '@tauri-apps/api/core';
import { closeAgentInput, runAgentDuplex, sendAgentInput, type StreamMsg } from './tauri';
import { applyLiveUpdate, appendRaw } from './liveRuns';
import { requestApproval } from './approvals';
import type { PermissionPolicy } from './permissions';
import type { StreamUpdate, TranscriptTurn } from './transcript';

const CODEX_MAX = 20_000;
const clip = (s: string): string => (s.length > CODEX_MAX ? `${s.slice(0, CODEX_MAX)}…` : s);
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Map one app-server notification into live-run updates (assistant text + tool turns). */
function parseNotification(method: string, params: Record<string, unknown>): StreamUpdate[] {
  if (method === 'item/agentMessage/delta') {
    const delta = params.delta;
    return typeof delta === 'string' && delta ? [{ kind: 'delta', text: delta }] : [];
  }
  if (method !== 'item/completed') return [];

  const item = (params.item ?? {}) as Record<string, unknown>;
  switch (item.type) {
    case 'agentMessage': {
      const text = String(item.text ?? '').trim();
      return text ? [{ kind: 'assistant', turns: [{ role: 'assistant', text: clip(text) }] }] : [];
    }
    case 'commandExecution': {
      const command = Array.isArray(item.command) ? item.command.join(' ') : String(item.command ?? '');
      const output = String(item.aggregatedOutput ?? '').trim();
      const exit = item.exitCode;
      const turns: TranscriptTurn[] = [{ role: 'tool', tool: 'shell', text: clip(command) }];
      turns.push({ role: 'result', tool: 'result', text: clip(output || (typeof exit === 'number' ? `(exit ${exit})` : '(no output)')) });
      return [{ kind: 'toolResults', turns }];
    }
    case 'fileChange': {
      const changes = item.changes as Record<string, unknown> | undefined;
      const files = changes ? Object.keys(changes) : [];
      return [{ kind: 'toolResults', turns: [{ role: 'tool', tool: 'apply_patch', text: clip(files.join('\n') || '(patch)') }] }];
    }
    default:
      return []; // reasoning, mcpToolCall, webSearch, … omitted from the rendered transcript
  }
}

export interface CodexOutcome {
  ok: boolean;
  durationMs: number;
  exitCode: number | null;
}

/**
 * Run one codex turn over app-server, streaming into the live run keyed by `dispatchId`
 * and routing approval requests to the shared approvals queue.
 */
export async function runCodexAppServer(opts: {
  dispatchId: string;
  prompt: string;
  env: Record<string, string>;
  policy: PermissionPolicy;
  /** Aborting closes the app-server's stdin (EOF), so the process exits and the turn ends. */
  signal?: AbortSignal;
}): Promise<CodexOutcome> {
  const { dispatchId, prompt, env, policy, signal } = opts;
  const bypass = policy.mode === 'all';

  // Cancellation: closing stdin tells codex app-server to shut down; the Promise.race below
  // then resolves via the process-exit branch. (No caller passes a signal yet — the engine/UI
  // Stop wiring is a cross-runtime follow-up — but the capability is here once it lands.)
  const onAbort = () => void closeAgentInput(dispatchId).catch(() => {});
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  let nextId = 1;
  const pending = new Map<number, { resolve: (result: unknown) => void; reject: (e: Error) => void }>();
  let resolveTurn: ((status: string) => void) | null = null;
  const turnComplete = new Promise<string>((res) => {
    resolveTurn = res;
  });

  const channel = new Channel<StreamMsg>();

  // stdin may not be registered the instant we start writing; retry briefly.
  async function send(obj: unknown): Promise<void> {
    const line = JSON.stringify(obj);
    for (let i = 0; i < 40; i++) {
      try {
        await sendAgentInput(dispatchId, line);
        return;
      } catch {
        await delay(50);
      }
    }
    throw new Error('codex app-server stdin never became ready');
  }
  const request = (method: string, params?: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      // Surface a stuck/non-responsive app-server as an error instead of hanging forever.
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`codex ${method} timed out (no response from app-server)`));
      }, 30_000);
      pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      void send(params !== undefined ? { id, method, params } : { id, method }).catch(reject);
    });
  const notify = (method: string): void => void send({ method });
  const reply = (id: unknown, result: unknown): void => void send({ id, result });

  function handleServerRequest(msg: Record<string, unknown>): void {
    const method = String(msg.method ?? '');
    const params = (msg.params ?? {}) as Record<string, unknown>;
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      const isPatch = method.includes('fileChange');
      const toolName = isPatch ? 'Apply patch' : 'Shell';
      const toolInput = isPatch
        ? { changes: params.changes ?? params.reason }
        : { command: Array.isArray(params.command) ? params.command.join(' ') : params.command };
      requestApproval({
        correlation: dispatchId,
        runtime: 'codex',
        toolName,
        toolInput,
        // accept / acceptForSession / decline — exact app-server decision enum.
        resolve: (decision) => reply(msg.id, { decision: decision === 'deny' ? 'decline' : decision === 'allow-session' ? 'acceptForSession' : 'accept' }),
      });
    } else {
      // Unknown server request — refuse so codex doesn't wait on us forever.
      void send({ id: msg.id, error: { code: -32601, message: 'unsupported request' } });
    }
  }

  channel.onmessage = (m) => {
    if (m.kind === 'stderr') {
      appendRaw(dispatchId, m.data.line);
      return;
    }
    if (m.kind !== 'stdout') return; // 'exit' handled via the awaited duplex promise
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(m.data.line) as Record<string, unknown>;
    } catch {
      return;
    }
    const hasId = msg.id !== undefined && msg.id !== null;
    if (hasId && (msg.result !== undefined || msg.error !== undefined)) {
      const p = pending.get(msg.id as number);
      if (p) {
        pending.delete(msg.id as number);
        if (msg.error) p.reject(new Error(String((msg.error as Record<string, unknown>).message ?? 'codex error')));
        else p.resolve(msg.result);
      }
      return;
    }
    if (hasId && msg.method) {
      handleServerRequest(msg);
      return;
    }
    if (msg.method) {
      const params = (msg.params ?? {}) as Record<string, unknown>;
      for (const u of parseNotification(String(msg.method), params)) applyLiveUpdate(dispatchId, u);
      if (msg.method === 'turn/completed') {
        const turn = params.turn as Record<string, unknown> | undefined;
        resolveTurn?.(String(turn?.status ?? 'completed'));
      }
    }
  };

  const resultPromise = runAgentDuplex({ runId: dispatchId, command: 'codex', args: ['app-server'], env, onEvent: channel });

  try {
    // experimentalApi:true is REQUIRED for the approval surface: `approvalPolicy` on
    // thread/start and the item/*/requestApproval server requests are experimental-gated.
    // Without it codex ignores our policy and never asks.
    await request('initialize', {
      clientInfo: { name: 'starship-desktop', title: 'Starship', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    notify('initialized');
    // Restrict mode: `untrusted` asks before any non-trivial command, and a `read-only`
    // sandbox forces an approval for anything that writes or runs with effects — so the
    // dialog reliably fires (codex only asks when an action needs to escape the sandbox).
    // Allow-all: never ask, full access.
    const thread = (await request('thread/start', {
      approvalPolicy: bypass ? 'never' : 'untrusted',
      sandbox: bypass ? 'danger-full-access' : 'read-only',
    })) as Record<string, unknown> | undefined;
    const threadId = ((thread?.thread as Record<string, unknown> | undefined)?.id ?? null) as string | null;
    if (!threadId) throw new Error('codex thread/start returned no thread id');
    await request('turn/start', { threadId, input: [{ type: 'text', text: prompt, textElements: [] }] });

    // Resolve on turn/completed, or earlier if the process exits unexpectedly.
    const outcome = await Promise.race([
      turnComplete.then((status) => ({ kind: 'turn' as const, status })),
      resultPromise.then((r) => ({ kind: 'exit' as const, r })),
    ]);
    if (outcome.kind === 'exit') {
      return { ok: false, durationMs: outcome.r.duration_ms, exitCode: outcome.r.exit_code };
    }
    await closeAgentInput(dispatchId).catch(() => {});
    const r = await resultPromise;
    return { ok: outcome.status === 'completed', durationMs: r.duration_ms, exitCode: r.exit_code };
  } catch (e) {
    appendRaw(dispatchId, `codex app-server error: ${(e as Error).message}`);
    // Cancel any outstanding request() timers so they don't fire after we've returned.
    for (const { reject: rej } of pending.values()) rej(new Error('codex session ended'));
    pending.clear();
    await closeAgentInput(dispatchId).catch(() => {});
    const r = await resultPromise.catch(() => ({ exit_code: null as number | null, duration_ms: 0 }));
    return { ok: false, durationMs: r.duration_ms, exitCode: r.exit_code };
  }
}
