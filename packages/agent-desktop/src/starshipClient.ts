// Client for the in-house agent-runtime sidecar (@starships/agent-runtime).
//
// Unlike the CLI runtimes (spawned via Rust run_agent) this talks HTTP to a local service:
// POST /runs returns an SSE stream of Claude-compatible stream-json lines, which we feed
// straight into the existing parser (parseClaudeStreamLine) so the live conversation
// renders unchanged. Mid-run tool approvals arrive as `permission` SSE events and are
// answered with POST /runs/:id/approve — reusing the shared approvals queue (the same
// dialog as claude/codex). The sidecar lifecycle + API keys are owned by Rust; here we just
// ask for its base URL.
import { requestApproval } from './approvals';
import { appendRaw, applyLiveUpdate } from './liveRuns';
import { runtimeBaseUrl } from './tauri';
import { parseClaudeStreamLine } from './transcript';
import type { PermissionPolicy } from './permissions';
import type { Persona, ProviderId } from './store';

export interface StarshipOutcome {
  ok: boolean;
  durationMs: number;
  exitCode: number | null;
}

/** Pick the provider for a starship run: explicit `--provider` in the executor, else infer from the model. */
function resolveProvider(model: string | undefined, executor: string): ProviderId {
  const explicit = /--provider\s+(anthropic|openai)/.exec(executor);
  if (explicit) return explicit[1] as ProviderId;
  const id = (model ?? '').toLowerCase();
  if (id.startsWith('gpt') || /^o[1-9]/.test(id) || id.includes('openai')) {
    return 'openai';
  }
  return 'anthropic';
}

const DEFAULT_MODEL: Record<ProviderId, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o',
};

/** Optional `--workspace <path>` override baked into the runtime's executor. */
function resolveWorkspace(executor: string): string | undefined {
  return /--workspace\s+(\S+)/.exec(executor)?.[1];
}

/**
 * Run one turn against the local runtime, streaming into the live run keyed by `dispatchId`
 * and routing approvals to the shared queue. Resume is automatic: the service keys thread
 * history by `sessionId`, so reusing it on a follow-up continues the conversation.
 */
export async function runStarship(opts: {
  dispatchId: string;
  persona: Persona;
  executor: string;
  prompt: string;
  sessionId: string;
  policy: PermissionPolicy;
  /** Working directory chosen for this thread; overrides the executor's `--workspace`. */
  cwd?: string | null;
}): Promise<StarshipOutcome> {
  const { dispatchId, persona, executor, prompt, sessionId, policy, cwd } = opts;
  const start = Date.now();

  let base: string;
  try {
    base = await runtimeBaseUrl();
  } catch (e) {
    appendRaw(dispatchId, `runtime unavailable: ${(e as Error).message}`);
    return { ok: false, durationMs: Date.now() - start, exitCode: null };
  }

  const provider = resolveProvider(persona.model, executor);
  const body = {
    runId: dispatchId,
    provider,
    model: persona.model || DEFAULT_MODEL[provider],
    prompt,
    systemPrompt: persona.systemPrompt,
    sessionId,
    mode: policy.mode,
    allow: policy.allow,
    workspace: cwd || resolveWorkspace(executor),
    // Deferred toolsets the runtime connects/loads for this run (advertised in the catalog,
    // pulled into context on demand via tool_search).
    mcpServers: persona.mcpServers,
    bundles: persona.bundles,
  };

  const approve = (toolUseId: string, decision: string): void => {
    void fetch(`${base}/runs/${dispatchId}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toolUseId, decision }),
    }).catch(() => {});
  };

  let isError = false;
  const handleEvent = (event: string, data: string): void => {
    if (event === 'line') {
      for (const u of parseClaudeStreamLine(data)) applyLiveUpdate(dispatchId, u);
      // `result` with is_error marks the run failed without throwing.
      if (/"type"\s*:\s*"result"/.test(data) && /"is_error"\s*:\s*true/.test(data)) isError = true;
    } else if (event === 'permission') {
      let req: { toolUseId?: string; toolName?: string; toolInput?: unknown };
      try {
        req = JSON.parse(data);
      } catch {
        return;
      }
      if (!req.toolUseId) {
        // No id to correlate to a pending resolver (approve() is keyed by toolUseId), so a deny
        // here would no-op. The runtime's abort-on-disconnect path denies anything still parked.
        console.warn('[starship] permission event missing toolUseId — ignoring');
        return;
      }
      requestApproval({
        correlation: dispatchId,
        runtime: 'starship',
        toolName: req.toolName ?? 'tool',
        toolInput: req.toolInput,
        resolve: (decision) => approve(req.toolUseId!, decision),
      });
    } else if (event === 'error') {
      isError = true;
      let msg = data;
      try {
        msg = (JSON.parse(data) as { message?: string }).message ?? data;
      } catch {
        // keep raw
      }
      appendRaw(dispatchId, `runtime error: ${msg}`);
    }
  };

  try {
    const res = await fetch(`${base}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      appendRaw(dispatchId, `runtime error: HTTP ${res.status}`);
      return { ok: false, durationMs: Date.now() - start, exitCode: 1 };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        let event = 'message';
        const dataLines: string[] = [];
        for (const raw of frame.split('\n')) {
          if (raw.startsWith('event:')) event = raw.slice(6).trim();
          else if (raw.startsWith('data:')) dataLines.push(raw.slice(5).replace(/^ /, ''));
        }
        if (dataLines.length) handleEvent(event, dataLines.join('\n'));
      }
    }
  } catch (e) {
    appendRaw(dispatchId, `runtime error: ${(e as Error).message}`);
    isError = true;
  }

  return { ok: !isError, durationMs: Date.now() - start, exitCode: isError ? 1 : 0 };
}
