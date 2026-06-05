import { spawn } from 'node:child_process';
import type { AgentDispatchModel } from '@starships/protocol';
import type { ExecutorConfig } from './config';

export interface ExecutionResult {
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

const MAX_CAPTURE = 8 * 1024; // bytes of stdout/stderr to retain

function truncate(s: string): string {
  return s.length > MAX_CAPTURE ? `${s.slice(0, MAX_CAPTURE)}…[truncated]` : s;
}

/** Resolve a single arg's `{{…}}` tokens against the dispatch. */
function substitute(arg: string, dispatch: AgentDispatchModel, promptField: string): string {
  const prompt = String((dispatch.payload as Record<string, unknown>)?.[promptField] ?? '');
  return arg
    .split('{{prompt}}')
    .join(prompt)
    .split('{{commandType}}')
    .join(dispatch.commandType)
    .split('{{dispatchId}}')
    .join(dispatch.id);
}

/**
 * Run a dispatch as a child process.
 *
 * Safety: the command + args are passed to spawn as an ARGV ARRAY (no shell),
 * so the remotely-supplied prompt is a discrete argument and cannot inject
 * shell metacharacters. The full payload is also exposed via env for executors
 * that prefer to read it structured.
 */
export function runDispatch(executor: ExecutorConfig, dispatch: AgentDispatchModel): Promise<ExecutionResult> {
  const args = executor.args.map((a) => substitute(a, dispatch, executor.promptField));

  const env = { ...process.env };
  if (executor.passPayloadEnv) {
    env.STARSHIP_DISPATCH_ID = dispatch.id;
    env.STARSHIP_COMMAND_TYPE = dispatch.commandType;
    env.STARSHIP_DISPATCH_PAYLOAD = JSON.stringify(dispatch.payload ?? {});
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

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, timedOut, durationMs: Date.now() - startedAt, stdout: truncate(stdout), stderr: truncate(stderr) });
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
