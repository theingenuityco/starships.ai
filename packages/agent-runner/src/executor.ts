import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AgentRuntimeDispatchModel } from '@starships/protocol';
import type { ExecutorConfig } from './config';

export interface ExecutionResult {
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  /**
   * The session id we minted for this run, present only when the executor
   * template actually consumed `{{sessionId}}` (i.e. the CLI was told to use
   * it). Lets the caller correlate the run to the CLI's on-disk transcript.
   */
  sessionId?: string;
}

const MAX_CAPTURE = 8 * 1024; // bytes of stdout/stderr to retain

function truncate(s: string): string {
  return s.length > MAX_CAPTURE ? `${s.slice(0, MAX_CAPTURE)}…[truncated]` : s;
}

/**
 * Resolve a single arg's `{{…}}` tokens against the dispatch.
 *
 * Persona tokens ({{systemPrompt}}, {{model}}, {{instructions}}) come from the
 * persona snapshot the server attached to the dispatch, so each runtime executes
 * the assigned persona's behaviour. Templates that omit these tokens still get
 * the values via env (see runDispatch).
 */
function substitute(arg: string, dispatch: AgentRuntimeDispatchModel, promptField: string, sessionId: string): string {
  const prompt = String((dispatch.payload as Record<string, unknown>)?.[promptField] ?? '');
  const persona = dispatch.persona ?? null;
  // Single-pass: each token site is replaced once, so a substituted value that
  // contains `{{…}}` text is never re-scanned (mirrors agent-desktop engine.ts).
  const values: Record<string, string> = {
    '{{prompt}}': prompt,
    '{{commandType}}': dispatch.commandType,
    '{{dispatchId}}': dispatch.id,
    '{{sessionId}}': sessionId,
    '{{systemPrompt}}': String(persona?.systemPrompt ?? ''),
    '{{model}}': String(persona?.model ?? ''),
    '{{instructions}}': String(persona?.instructions ?? ''),
  };
  return arg.replace(/\{\{(?:prompt|commandType|dispatchId|sessionId|systemPrompt|model|instructions)\}\}/g, (token) => values[token] ?? token);
}

/**
 * Run a dispatch as a child process.
 *
 * Safety: the command + args are passed to spawn as an ARGV ARRAY (no shell),
 * so the remotely-supplied prompt is a discrete argument and cannot inject
 * shell metacharacters. The full payload is also exposed via env for executors
 * that prefer to read it structured.
 */
export function runDispatch(executor: ExecutorConfig, dispatch: AgentRuntimeDispatchModel, signal?: AbortSignal): Promise<ExecutionResult> {
  // Mint a session id up front and feed it to the CLI (e.g. `claude --session-id`)
  // so the run lands in a transcript file we can find later. Only reported back
  // when the template actually used it — CLIs that don't understand it are left
  // untouched and simply produce no correlatable session.
  const sessionId = randomUUID();
  const usesSession = executor.args.some((a) => a.includes('{{sessionId}}'));
  const args = executor.args.map((a) => substitute(a, dispatch, executor.promptField, sessionId));

  const env = { ...process.env };
  if (executor.passPayloadEnv) {
    env.STARSHIP_DISPATCH_ID = dispatch.id;
    env.STARSHIP_COMMAND_TYPE = dispatch.commandType;
    env.STARSHIP_DISPATCH_PAYLOAD = JSON.stringify(dispatch.payload ?? {});
    // Persona behaviour snapshot, for executors that read it from env rather
    // than via {{…}} arg tokens.
    const persona = dispatch.persona ?? null;
    if (persona) {
      env.STARSHIP_PERSONA_ID = persona.personaId;
      if (persona.systemPrompt) env.STARSHIP_PERSONA_SYSTEM_PROMPT = persona.systemPrompt;
      if (persona.model) env.STARSHIP_PERSONA_MODEL = persona.model;
      if (persona.instructions) env.STARSHIP_PERSONA_INSTRUCTIONS = persona.instructions;
    }
  }

  return new Promise<ExecutionResult>((resolve) => {
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(executor.command, args, { env, shell: false });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, executor.timeoutMs);

    // Kill the child if the runner is shutting down.
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        sessionId: usesSession ? sessionId : undefined,
      });
    };

    child.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < MAX_CAPTURE) stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < MAX_CAPTURE) stderr += d.toString();
    });
    child.on('error', (err) => {
      stderr += `\n[spawn error] ${err.message}`;
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}
