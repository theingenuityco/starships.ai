// Local execution: turn a persona + prompt into one agent CLI run and record it.
// This replaces the old server dispatch loop (pull/ack/complete over MCP) with a
// direct, in-app call to the Rust `run_agent` command.
import { Channel } from '@tauri-apps/api/core';
import { runAgent, type StreamMsg } from './tauri';
import {
  addEvent,
  appendConversationMessages,
  getStore,
  setConversationSession,
  type ConversationMessage,
  type Persona,
  type Runtime,
  type RuntimeKind,
} from './store';
import { DEFAULT_PERMISSIONS, permissionArgs, streamArgs } from './permissions';
import { appendRaw, applyLiveUpdate, finishLiveRun, getLiveRun, lastAssistantText, startLiveRun } from './liveRuns';
import { parseClaudeStreamLine, parseCodexStreamLine } from './transcript';

/**
 * Tokenize a command line, honoring single/double quotes so multi-word args
 * survive (e.g. `claude --system "be concise" -p {{prompt}}` → 5 tokens).
 */
function tokenize(s: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}

/**
 * Resolve `{{…}}` tokens in one arg against the run's prompt + persona. Single-pass:
 * each token site is replaced exactly once, so a substituted value that happens to
 * contain `{{…}}` text (e.g. a prompt of "what is {{sessionId}}?") is never re-scanned.
 */
function substitute(arg: string, prompt: string, sessionId: string, persona: Persona): string {
  const values: Record<string, string> = {
    '{{prompt}}': prompt,
    '{{sessionId}}': sessionId,
    '{{systemPrompt}}': persona.systemPrompt ?? '',
    '{{model}}': persona.model ?? '',
    '{{instructions}}': persona.instructions ?? '',
  };
  return arg.replace(/\{\{(?:prompt|sessionId|systemPrompt|model|instructions)\}\}/g, (token) => values[token] ?? token);
}

export interface RunOutcome {
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  /** Lets callers subscribe to the live conversation via `useLiveRun(dispatchId)`. */
  dispatchId: string;
}

/** Richer result for callers (conversations) that need the produced turns + session. */
interface ExecuteResult extends RunOutcome {
  /** Finished agent turns (assistant + tool/result) from this run — excludes the user prompt. */
  committed: ConversationMessage[];
  /** Whether the executor actually threads `{{sessionId}}` (i.e. resume is possible). */
  usesSession: boolean;
}

/**
 * For a follow-up turn, rewrite the session flag so the CLI resumes the existing session
 * instead of trying to create it again. Only claude-code's `--session-id` → `--resume`
 * swap is verified; other kinds don't carry context across turns yet, so a follow-up there
 * runs as an independent invocation (still appended to the same visible thread).
 */
function resumeParts(parts: string[], kind: RuntimeKind): string[] {
  if (kind !== 'claude-code') return parts;
  return parts.map((p) => (p === '--session-id' ? '--resume' : p));
}

/**
 * Core run: drive `runtime` with `prompt` under `sessionId`, stream it live, and record the
 * `command_dispatched` + `command_output`/`command_failed` events under one dispatch id.
 * `resume` continues an existing session (follow-up turns). Shared by one-shot persona runs
 * and conversation turns.
 */
async function executeRun(opts: {
  persona: Persona;
  runtime: Runtime;
  prompt: string;
  sessionId: string;
  resume: boolean;
  onDispatch?: (dispatchId: string) => void;
}): Promise<ExecuteResult> {
  const { persona, runtime, prompt, sessionId, resume, onDispatch } = opts;
  const rawParts = tokenize(runtime.executor);
  if (rawParts.length === 0) throw new Error('Runtime has an empty executor');
  const parts = resume ? resumeParts(rawParts, runtime.kind) : rawParts;

  const dispatchId = crypto.randomUUID();
  onDispatch?.(dispatchId); // let the UI subscribe to the live conversation right away
  const usesSession = rawParts.some((a) => a.includes('{{sessionId}}'));
  const command = parts[0];
  // Compile the persona's permission policy + structured-streaming flags into this CLI's own
  // flags, appended after the prompt (trailing options parse cleanly and avoid subcommand-
  // position issues).
  const permArgs = permissionArgs(runtime.kind, runtime.executor, persona.permissions ?? DEFAULT_PERMISSIONS);
  const args = [
    ...parts.slice(1).map((a) => substitute(a, prompt, sessionId, persona)),
    ...permArgs,
    ...streamArgs(runtime.kind, runtime.executor),
  ];

  const env: Record<string, string> = {
    STARSHIP_DISPATCH_ID: dispatchId,
    STARSHIP_PERSONA_ID: persona.id,
  };
  if (persona.systemPrompt) env.STARSHIP_PERSONA_SYSTEM_PROMPT = persona.systemPrompt;
  if (persona.model) env.STARSHIP_PERSONA_MODEL = persona.model;
  if (persona.instructions) env.STARSHIP_PERSONA_INSTRUCTIONS = persona.instructions;

  addEvent({
    type: 'command_dispatched',
    dispatchId,
    personaId: persona.id,
    runtimeId: runtime.id,
    payload: { prompt },
  });

  // Stream the run live: each stdout line is parsed (structured for claude/codex, raw
  // otherwise) into the ephemeral live-run store; stderr always accumulates as raw text.
  startLiveRun(dispatchId, runtime.kind);
  const channel = new Channel<StreamMsg>();
  channel.onmessage = (m) => {
    if (m.kind === 'stdout') {
      if (runtime.kind === 'claude-code') for (const u of parseClaudeStreamLine(m.data.line)) applyLiveUpdate(dispatchId, u);
      else if (runtime.kind === 'codex') for (const u of parseCodexStreamLine(m.data.line)) applyLiveUpdate(dispatchId, u);
      else appendRaw(dispatchId, m.data.line);
    } else if (m.kind === 'stderr') {
      appendRaw(dispatchId, m.data.line);
    }
    // 'exit' is handled via the awaited RunResult below.
  };

  const sessionFields = usesSession ? { sessionId } : {};
  try {
    const result = await runAgent({ command, args, env, onEvent: channel });
    const ok = result.exit_code === 0;
    const live = getLiveRun(dispatchId);
    // Final human-readable summary: Claude's `result` text, else the last assistant turn,
    // else the raw output tail.
    const finalText = live?.finalText ?? lastAssistantText(live) ?? live?.raw.trim() ?? '';
    finishLiveRun(dispatchId, { ok, durationMs: result.duration_ms, finalText });
    addEvent({
      type: ok ? 'command_output' : 'command_failed',
      dispatchId,
      personaId: persona.id,
      runtimeId: runtime.id,
      payload: ok
        ? { exitCode: result.exit_code, durationMs: result.duration_ms, output: finalText, ...sessionFields }
        : { exitCode: result.exit_code, durationMs: result.duration_ms, error: live?.raw.trim() || finalText, ...sessionFields },
    });
    return { ok, exitCode: result.exit_code, durationMs: result.duration_ms, dispatchId, committed: committedTurns(dispatchId), usesSession };
  } catch (e) {
    finishLiveRun(dispatchId, { ok: false });
    addEvent({
      type: 'command_failed',
      dispatchId,
      personaId: persona.id,
      runtimeId: runtime.id,
      payload: { error: (e as Error).message, ...sessionFields },
    });
    return { ok: false, exitCode: null, durationMs: 0, dispatchId, committed: committedTurns(dispatchId), usesSession };
  }
}

/** Snapshot a finished run's committed turns as timestamped conversation messages. */
function committedTurns(dispatchId: string): ConversationMessage[] {
  const at = new Date().toISOString();
  const live = getLiveRun(dispatchId);
  const committed = live?.committed ?? [];
  // Raw-output runtimes (hermes/openclaw/custom) emit no structured turns, so
  // `committed` stays empty. Wrap their raw stdout as a single assistant turn so
  // the conversation isn't left with just the user's prompt and no reply.
  if (committed.length === 0 && live?.raw.trim()) {
    return [{ role: 'assistant', text: live.raw.trim(), at }];
  }
  return committed.map((t) => ({ role: t.role, text: t.text, tool: t.tool, at: t.ts ?? at }));
}

/**
 * Execute a persona once with `prompt` as a standalone run (no thread). Mints a fresh
 * session id so the CLI's on-disk transcript is locatable later.
 */
export async function runPersona(personaId: string, prompt: string, onDispatch?: (dispatchId: string) => void): Promise<RunOutcome> {
  const store = getStore();
  const persona = store.personas.find((p) => p.id === personaId);
  if (!persona) throw new Error('Persona not found');
  const runtime = persona.runtimeId ? store.runtimes.find((r) => r.id === persona.runtimeId) : undefined;
  if (!runtime) throw new Error('Assign this persona to a runtime first');
  return executeRun({ persona, runtime, prompt, sessionId: crypto.randomUUID(), resume: false, onDispatch });
}

/**
 * Run one turn of a persisted conversation. Reuses the conversation's CLI session across
 * turns (resuming it on follow-ups) so the agent keeps context. Persists the agent's turns
 * back to the thread; the caller should have already appended the user's message.
 */
export async function runConversationTurn(
  conversationId: string,
  prompt: string,
  onDispatch?: (dispatchId: string) => void
): Promise<RunOutcome> {
  const store = getStore();
  const convo = store.conversations.find((c) => c.id === conversationId);
  if (!convo) throw new Error('Conversation not found');
  const persona = store.personas.find((p) => p.id === convo.personaId);
  if (!persona) throw new Error('Persona not found');
  const runtime = persona.runtimeId ? store.runtimes.find((r) => r.id === persona.runtimeId) : undefined;
  if (!runtime) throw new Error('Assign this persona to a runtime first');

  const resume = Boolean(convo.sessionId);
  const sessionId = convo.sessionId ?? crypto.randomUUID();
  const res = await executeRun({ persona, runtime, prompt, sessionId, resume, onDispatch });

  // Remember the session after the first turn (only if the runtime actually threads it).
  if (!convo.sessionId && res.usesSession) setConversationSession(conversationId, sessionId);
  appendConversationMessages(conversationId, res.committed);
  return res;
}
