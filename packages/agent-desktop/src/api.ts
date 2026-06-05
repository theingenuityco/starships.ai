// Client for the agent-runner loopback control API (see
// @starships/agent-runner src/controlServer.ts). Mirrors its RunnerState shape.

export type RunnerStatus = 'online' | 'busy' | 'idle' | 'offline';

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
  status: RunnerStatus;
  paused: boolean;
  lastPollAt: string | null;
  lastError: string | null;
  processed: number;
  recent: RecentDispatch[];
}

export interface LogLine {
  level: 'info' | 'warn' | 'error';
  message: string;
  ts: string;
}

export interface ControlConfig {
  baseUrl: string;
  token: string;
}

async function call<T>(cfg: ControlConfig, path: string, method: 'GET' | 'POST'): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: { 'x-control-token': cfg.token },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const getStatus = (cfg: ControlConfig) => call<RunnerState>(cfg, '/status', 'GET');
export const pause = (cfg: ControlConfig) => call<RunnerState>(cfg, '/pause', 'POST');
export const resume = (cfg: ControlConfig) => call<RunnerState>(cfg, '/resume', 'POST');

/**
 * Open the SSE stream. The token rides as a query param because EventSource
 * can't set headers. Returns a close function.
 */
export function subscribeEvents(
  cfg: ControlConfig,
  handlers: { onState?: (s: RunnerState) => void; onLog?: (l: LogLine) => void; onError?: () => void }
): () => void {
  const url = `${cfg.baseUrl}/events?token=${encodeURIComponent(cfg.token)}`;
  const es = new EventSource(url);
  if (handlers.onState) es.addEventListener('state', (e) => handlers.onState!(JSON.parse((e as MessageEvent).data)));
  if (handlers.onLog) es.addEventListener('log', (e) => handlers.onLog!(JSON.parse((e as MessageEvent).data)));
  if (handlers.onError) es.onerror = () => handlers.onError!();
  return () => es.close();
}
