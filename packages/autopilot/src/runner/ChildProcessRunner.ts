/**
 * Child Process Runner
 * Executes the Engine in a separate Node.js process using IPC.
 * Provides isolation, crash containment, and timeout/memory controls.
 */

import type { Blueprint, Execution, ExecutionItem } from '@/types';
import type { EngineConfig } from '@/engine/Engine';
import type { Runner } from './Runner';
import { fork, type StdioOptions } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

export interface ChildProcessRunnerOptions {
  /**
   * Wall-clock timeout (ms) after which the child will be terminated.
   * 0 or undefined means no timeout.
   */
  timeoutMs?: number;
  /**
   * V8 heap limit for the child process in MB (maps to --max-old-space-size).
   */
  memoryLimitMB?: number;
  /**
   * Additional Node flags for the child (e.g., ['--enable-source-maps']).
   */
  nodeExecArgv?: string[];
  /**
   * Extra environment variables to set for the child.
   */
  env?: Record<string, string>;
  /**
   * When true, inherit stdio from the parent for easier debugging.
   * Otherwise, child stdout/stderr will be piped and forwarded with a prefix.
   */
  stdioInherit?: boolean;
  /**
   * Grace period (ms) between initial terminate and SIGKILL escalation (default: 1000).
   */
  killGraceMs?: number;
}

type ChildMessage =
  | { type: 'event'; event: unknown }
  | { type: 'done'; result: ExecutionItem[] }
  | { type: 'error'; error: { message?: string; stack?: string } };

function isChildMessage(msg: unknown): msg is ChildMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.type !== 'string') return false;
  return m.type === 'event' || m.type === 'done' || m.type === 'error';
}

export class ChildProcessRunner implements Runner {
  constructor(private readonly options?: ChildProcessRunnerOptions) {}

  async run(blueprint: Blueprint, execution: Execution, config?: EngineConfig): Promise<ExecutionItem[]> {
    const childEntry = resolve(__dirname, '../scripts/child-entry.js');

    const execArgv: string[] = [];
    const memoryLimitMB = this.options?.memoryLimitMB;
    if (typeof memoryLimitMB === 'number' && Number.isFinite(memoryLimitMB) && memoryLimitMB > 0) {
      execArgv.push(`--max-old-space-size=${Math.floor(memoryLimitMB)}`);
    }
    if (this.options?.nodeExecArgv?.length) {
      execArgv.push(...this.options.nodeExecArgv);
    }

    const stdio: StdioOptions = this.options?.stdioInherit ? 'inherit' : ['ignore', 'pipe', 'pipe', 'ipc'];

    const child: ChildProcess = fork(childEntry, [], {
      stdio,
      execArgv,
      env: { ...process.env, ...(this.options?.env ?? {}) },
      serialization: 'advanced',
    });

    // Child process started with pid: ${child.pid}

    return await new Promise<ExecutionItem[]>((resolvePromise, rejectPromise) => {
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (killTimer) {
          clearTimeout(killTimer);
          killTimer = undefined;
        }
        child.removeAllListeners('message');
        child.removeAllListeners('exit');
        child.removeAllListeners('error');
        if (!this.options?.stdioInherit && child.stdout) child.stdout.removeAllListeners('data');
        if (!this.options?.stdioInherit && child.stderr) child.stderr.removeAllListeners('data');
      };

      // Forward logs when piping - forward ALL logs for debugging
      if (!this.options?.stdioInherit) {
        child.stdout?.on('data', (chunk: Buffer) => {
          const message = chunk.toString().trim();
          // Forward ALL logs to debug the issue
          if (message) {
            console.log(`[autopilot:child ${child.pid}]`, message);
          }
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          process.stderr.write(`[autopilot:child ${child.pid}] ${chunk.toString()}`);
        });
      }

      // Bridge events back to caller
      child.on('message', async (msg: unknown) => {
        try {
          if (!isChildMessage(msg)) return;
          if (msg.type === 'event' && config?.eventCallback) {
            const cb = config.eventCallback as (e: unknown) => Promise<void> | void;
            await Promise.resolve(cb(msg.event)).catch(() => {
              // ignore event callback errors
            });
          } else if (msg.type === 'done') {
            if (settled) return;
            settled = true;
            cleanup();
            resolvePromise(msg.result);
            try {
              child.disconnect();
            } catch {
              // ignore
            }
          } else if (msg.type === 'error') {
            if (settled) return;
            settled = true;
            cleanup();
            const e = new Error(msg.error?.message ?? 'Child runner error');
            rejectPromise(e);
            try {
              child.disconnect();
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      });

      child.once('error', (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectPromise(err);
      });

      child.once('exit', (code, signal) => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectPromise(new Error(`Child exited before completion (code=${code}, signal=${signal ?? 'none'})`));
      });

      const timeoutMs = this.options?.timeoutMs ?? 0;
      if (timeoutMs > 0) {
        killTimer = setTimeout(() => {
          if (settled) return;
          try {
            // Default is SIGTERM when no signal is provided
            child.kill();
          } catch {
            // ignore
          }
          const grace = Math.max(0, this.options?.killGraceMs ?? 1000);
          setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
          }, grace);
        }, timeoutMs);
      }

      // Prepare safe config (functions cannot cross the IPC boundary)
      const safeConfig = config ? { ...config, eventCallback: undefined } : undefined;

      const autopilotCredentials = {
        openrouterApiKey: process.env.OPENROUTER_API_KEY ?? undefined,
      };

      // Signal parent is ready to receive events (prevents race condition)
      child.send({ type: 'parent_ready' });

      // Kick off work
      child.send({
        type: 'start',
        payload: { blueprint, execution, config: safeConfig, autopilotCredentials },
      });
    });
  }
}
