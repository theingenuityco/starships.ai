// Local execution: turn a persona + prompt into one agent CLI run and record it.
// This replaces the old server dispatch loop (pull/ack/complete over MCP) with a
// direct, in-app call to the Rust `run_agent` command.
import { Channel } from '@tauri-apps/api/core';
import { runAgent, type StreamMsg } from './tauri';
import { addEvent, getStore, type Persona, type Runtime } from './store';
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

/** Resolve `{{…}}` tokens in one arg against the run's prompt + persona. */
function substitute(arg: string, prompt: string, sessionId: string, persona: Persona): string {
  return arg
    .split('{{prompt}}')
    .join(prompt)
    .split('{{sessionId}}')
    .join(sessionId)
    .split('{{systemPrompt}}')
    .join(persona.systemPrompt ?? '')
    .split('{{model}}')
    .join(persona.model ?? '')
    .split('{{instructions}}')
    .join(persona.instructions ?? '');
}

export interface RunOutcome {
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  /** Lets callers subscribe to the live conversation via `useLiveRun(dispatchId)`. */
  dispatchId: string;
}

/**
 * Execute a persona once with `prompt`. Mints a session id so the CLI's on-disk
 * transcript is locatable later (`claude --session-id {{sessionId}}`). Records a
 * `command_dispatched` event up front and a `command_output`/`command_failed`
 * event with the result, grouped under one dispatch id.
 */
export async function runPersona(personaId: string, prompt: string, onDispatch?: (dispatchId: string) => void): Promise<RunOutcome> {
  const store = getStore();
  const persona = store.personas.find((p) => p.id === personaId);
  if (!persona) throw new Error('Persona not found');
  const runtime: Runtime | undefined = persona.runtimeId ? store.runtimes.find((r) => r.id === persona.runtimeId) : undefined;
  if (!runtime) throw new Error('Assign this persona to a runtime first');

  const parts = tokenize(runtime.executor);
  if (parts.length === 0) throw new Error('Runtime has an empty executor');

  const dispatchId = crypto.randomUUID();
  onDispatch?.(dispatchId); // let the UI subscribe to the live conversation right away
  const sessionId = crypto.randomUUID();
  const usesSession = parts.some((a) => a.includes('{{sessionId}}'));
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
    return { ok, exitCode: result.exit_code, durationMs: result.duration_ms, dispatchId };
  } catch (e) {
    finishLiveRun(dispatchId, { ok: false });
    addEvent({
      type: 'command_failed',
      dispatchId,
      personaId: persona.id,
      runtimeId: runtime.id,
      payload: { error: (e as Error).message, ...sessionFields },
    });
    return { ok: false, exitCode: null, durationMs: 0, dispatchId };
  }
}
