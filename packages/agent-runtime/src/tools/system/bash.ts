import { spawn } from 'node:child_process';
import { z } from 'zod';
import { clip, DEFAULT_EXEC_TIMEOUT_MS } from '../shared';
import type { ToolContext } from '../types';
import type { SystemTool } from './tool';

function runBash(command: string, ctx: ToolContext): Promise<string> {
  return new Promise((resolve) => {
    // Strip provider keys from the child env so a prompt-injected command can't exfiltrate them.
    const safeEnv = { ...process.env };
    delete safeEnv.ANTHROPIC_API_KEY;
    delete safeEnv.OPENAI_API_KEY;
    // detached:true puts the child in its own process group so we can signal the whole tree
    // (negative pid) — otherwise backgrounded forks (`sleep 1000 &`) outlive the timeout/abort.
    const child = spawn('bash', ['-c', command], { cwd: ctx.workspace, env: safeEnv, detached: true });
    let out = '';
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {
        child.kill('SIGTERM'); // group already gone / pid reaped
      }
    };
    const onAbort = () => kill();
    if (ctx.signal.aborted) onAbort();
    else ctx.signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(kill, DEFAULT_EXEC_TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onAbort);
      resolve(`Failed to start command: ${e.message}`);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onAbort);
      const tail = out.trim() || '(no output)';
      resolve(clip(code === 0 ? tail : `${tail}\n(exit ${code ?? 'null'})`));
    });
  });
}

export const bashTool: SystemTool = {
  name: 'bash',
  description: 'Run a shell command in the workspace and return its combined stdout/stderr.',
  schema: z.object({ command: z.string().describe('The shell command to run.') }),
  sensitive: true,
  capabilities: ['exec'],
  run: (input, ctx) => runBash((input as { command: string }).command, ctx),
};
