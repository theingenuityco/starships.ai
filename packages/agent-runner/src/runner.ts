import { EventEmitter } from 'node:events';
import type { AgentConnectionStatus, AgentDispatchModel } from '@starships/protocol';
import type { RunnerConfig } from './config';
import { StarshipMcpClient } from './mcpClient';
import { runDispatch, type ExecutionResult } from './executor';

export type LogLevel = 'info' | 'warn' | 'error';

export interface RecentDispatch {
  id: string;
  commandType: string;
  phase: 'running' | 'completed' | 'failed';
  exitCode?: number | null;
  timedOut?: boolean;
  durationMs?: number;
  at: string;
}

export interface RunnerState {
  connected: boolean;
  status: AgentConnectionStatus;
  paused: boolean;
  lastPollAt: string | null;
  lastError: string | null;
  processed: number;
  recent: RecentDispatch[];
}

/** Emitted events: `log` ({level,message,ts}), `state` (RunnerState snapshot). */
export class Runner extends EventEmitter {
  private readonly client: StarshipMcpClient;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;
  private inFlight = 0;
  private backoffMs = 0;

  private state: RunnerState = {
    connected: false,
    status: 'offline',
    paused: false,
    lastPollAt: null,
    lastError: null,
    processed: 0,
    recent: [],
  };

  constructor(
    private readonly config: RunnerConfig,
    private readonly options: { once?: boolean } = {}
  ) {
    super();
    this.client = new StarshipMcpClient(config.endpoint, config.token);
  }

  getState(): RunnerState {
    return { ...this.state, recent: [...this.state.recent] };
  }

  private log(level: LogLevel, message: string): void {
    this.emit('log', { level, message, ts: new Date().toISOString() });
  }

  private patch(next: Partial<RunnerState>): void {
    this.state = { ...this.state, ...next };
    this.emit('state', this.getState());
  }

  /** Report a connection status to the workspace, but only on transition. */
  private async setStatus(status: AgentConnectionStatus, detail?: string): Promise<void> {
    if (this.state.status === status) return;
    this.patch({ status });
    try {
      await this.client.reportStatus(status, detail);
    } catch (e) {
      this.log('warn', `report_status(${status}) failed: ${(e as Error).message}`);
    }
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.log('info', `Connecting to ${this.config.endpoint}`);
    await this.client.connect();
    this.patch({ connected: true, lastError: null });
    await this.setStatus('online');
    this.log('info', 'Connected. Polling for commands.');
    if (this.options.once) {
      // Drain once and stop, awaiting completion so callers can exit cleanly.
      await this.tick();
      return;
    }
    this.scheduleTick(0);
  }

  pause(): void {
    if (this.state.paused) return;
    this.patch({ paused: true });
    this.log('info', 'Paused.');
    void this.setStatus('idle', 'paused');
  }

  resume(): void {
    if (!this.state.paused) return;
    this.patch({ paused: false });
    this.log('info', 'Resumed.');
    this.scheduleTick(0);
  }

  private scheduleTick(delayMs: number): void {
    if (this.stopping) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    if (this.stopping || this.state.paused) return;
    try {
      const pending = await this.client.pullCommands();
      this.patch({ lastPollAt: new Date().toISOString(), lastError: null });
      this.backoffMs = 0;

      const batch = pending.slice(0, this.config.maxConcurrent);
      if (batch.length === 0) {
        await this.setStatus('idle');
      } else {
        await this.setStatus('busy', `${batch.length} command(s)`);
        for (const dispatch of batch) {
          if (this.stopping) break;
          await this.processOne(dispatch);
        }
        await this.setStatus('idle');
      }

      if (this.options.once) {
        await this.stop();
        return;
      }
      this.scheduleTick(this.config.pollIntervalMs);
    } catch (e) {
      const message = (e as Error).message;
      this.patch({ lastError: message, connected: false });
      this.log('error', `Poll failed: ${message}`);
      this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1000, 30_000);
      this.log('info', `Reconnecting in ${Math.round(this.backoffMs / 1000)}s…`);
      this.scheduleTick(this.backoffMs);
      try {
        await this.client.reconnect();
        this.patch({ connected: true });
      } catch {
        /* next tick retries */
      }
    }
  }

  private pushRecent(entry: RecentDispatch): void {
    const recent = [entry, ...this.state.recent].slice(0, 20);
    this.patch({ recent });
  }

  private async processOne(dispatch: AgentDispatchModel): Promise<void> {
    this.inFlight += 1;
    try {
      await this.client.ack(dispatch.id);
      this.log('info', `▶ ${dispatch.commandType} (${dispatch.id})`);
      this.pushRecent({ id: dispatch.id, commandType: dispatch.commandType, phase: 'running', at: new Date().toISOString() });

      const result: ExecutionResult = await runDispatch(this.config.executor, dispatch);
      const ok = result.exitCode === 0 && !result.timedOut;

      if (ok) {
        await this.client.postEvent(
          'command_output',
          { exitCode: result.exitCode, durationMs: result.durationMs, output: result.stdout.slice(0, 2000) },
          { dispatchId: dispatch.id }
        );
        this.log('info', `✓ ${dispatch.commandType} done in ${result.durationMs}ms`);
      } else {
        await this.client.postEvent(
          'command_failed',
          {
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            durationMs: result.durationMs,
            error: result.stderr.slice(0, 2000),
          },
          { dispatchId: dispatch.id }
        );
        this.log('error', `✗ ${dispatch.commandType} failed (exit ${result.exitCode}${result.timedOut ? ', timed out' : ''})`);
      }

      // Always complete so the server can coalesce the next beat.
      await this.client.complete(dispatch.id);
      this.patch({ processed: this.state.processed + 1 });
      this.pushRecent({
        id: dispatch.id,
        commandType: dispatch.commandType,
        phase: ok ? 'completed' : 'failed',
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        at: new Date().toISOString(),
      });
    } catch (e) {
      this.log('error', `Error handling dispatch ${dispatch.id}: ${(e as Error).message}`);
    } finally {
      this.inFlight -= 1;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    // Let an in-flight execution finish (best effort, short grace).
    const deadline = Date.now() + 3000;
    while (this.inFlight > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await this.setStatus('offline');
    await this.client.close();
    this.patch({ connected: false });
    this.log('info', 'Stopped.');
  }
}
