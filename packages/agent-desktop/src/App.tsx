import { useEffect, useRef, useState } from 'react';
import {
  getStatus,
  pause,
  resume,
  subscribeEvents,
  type ControlConfig,
  type LogLine,
  type RunnerState,
  type RunnerStatus,
} from './api';

const STATUS_COLOR: Record<RunnerStatus, string> = {
  online: 'bg-emerald-500',
  busy: 'bg-blue-500',
  idle: 'bg-zinc-500',
  offline: 'bg-red-500',
};

const PHASE_COLOR: Record<string, string> = {
  running: 'text-blue-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
};

const STORAGE_KEY = 'starship-agent-control';

function loadCfg(): ControlConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ControlConfig;
  } catch {
    /* ignore */
  }
  return { baseUrl: 'http://127.0.0.1:7777', token: '' };
}

export default function App() {
  const [cfg, setCfg] = useState<ControlConfig>(loadCfg);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<RunnerState | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => closeRef.current?.(), []);

  async function connect() {
    setError(null);
    try {
      const s = await getStatus(cfg); // validate reachability + token
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      setState(s);
      setConnected(true);
      closeRef.current?.();
      closeRef.current = subscribeEvents(cfg, {
        onState: setState,
        onLog: (l) => setLogs((prev) => [l, ...prev].slice(0, 200)),
        onError: () => setError('Stream disconnected. The runner may have stopped.'),
      });
    } catch (e) {
      setError(`Could not connect: ${(e as Error).message}`);
      setConnected(false);
    }
  }

  function disconnect() {
    closeRef.current?.();
    closeRef.current = null;
    setConnected(false);
    setState(null);
    setLogs([]);
  }

  if (!connected) {
    return <Setup cfg={cfg} setCfg={setCfg} onConnect={connect} error={error} />;
  }

  const status = state?.status ?? 'offline';
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${STATUS_COLOR[status]}`} />
          <div>
            <div className="text-lg font-semibold capitalize">{state?.paused ? 'Paused' : status}</div>
            <div className="text-xs text-zinc-500">{cfg.baseUrl}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state?.paused ? (
            <button className="btn" onClick={() => resume(cfg).then(setState)}>
              Resume
            </button>
          ) : (
            <button className="btn" onClick={() => pause(cfg).then(setState)}>
              Pause
            </button>
          )}
          <button className="btn-ghost" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </header>

      {error ? <div className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Processed" value={String(state?.processed ?? 0)} />
        <Stat label="Last poll" value={state?.lastPollAt ? new Date(state.lastPollAt).toLocaleTimeString() : '—'} />
        <Stat label="Recent" value={String(state?.recent.length ?? 0)} />
      </div>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Recent dispatches</h2>
        {state && state.recent.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {state.recent.map((d) => (
              <li key={`${d.id}-${d.phase}-${d.at}`} className="flex items-center justify-between rounded-md border border-zinc-800 px-3 py-2 text-sm">
                <span className="truncate">
                  <span className={PHASE_COLOR[d.phase] ?? ''}>●</span> {d.commandType}{' '}
                  <span className="text-zinc-600">{d.id}</span>
                </span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {d.phase}
                  {d.durationMs != null ? ` · ${d.durationMs}ms` : ''}
                  {d.exitCode != null ? ` · exit ${d.exitCode}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No dispatches handled yet.</p>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Log</h2>
        <div className="flex-1 overflow-auto rounded-md border border-zinc-800 bg-black/40 p-2 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-zinc-600">Waiting for activity…</p>
          ) : (
            logs.map((l, i) => (
              <div key={i} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-400' : 'text-zinc-300'}>
                <span className="text-zinc-600">{new Date(l.ts).toLocaleTimeString()} </span>
                {l.message}
              </div>
            ))
          )}
        </div>
      </section>

      <style>{`
        .btn { background:#2563eb; color:white; border-radius:6px; padding:6px 12px; font-size:13px; }
        .btn:hover { background:#1d4ed8; }
        .btn-ghost { color:#a1a1aa; border-radius:6px; padding:6px 12px; font-size:13px; }
        .btn-ghost:hover { color:#e4e4e7; }
      `}</style>
    </div>
  );
}

function Setup({
  cfg,
  setCfg,
  onConnect,
  error,
}: {
  cfg: ControlConfig;
  setCfg: (c: ControlConfig) => void;
  onConnect: () => void;
  error: string | null;
}) {
  const port = (() => {
    try {
      return new URL(cfg.baseUrl).port || '7777';
    } catch {
      return '7777';
    }
  })();

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Starship Agent</h1>
        <p className="mt-1 text-sm text-zinc-500">Connect to a running agent-runner to watch and control it.</p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-400">Control URL</span>
        <input
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-blue-500"
          value={cfg.baseUrl}
          onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
          placeholder="http://127.0.0.1:7777"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-400">Control token</span>
        <input
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono outline-none focus:border-blue-500"
          value={cfg.token}
          onChange={(e) => setCfg({ ...cfg, token: e.target.value })}
          placeholder="from the runner's startup log"
        />
      </label>

      {error ? <div className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div> : null}

      <button
        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        onClick={onConnect}
        disabled={!cfg.baseUrl || !cfg.token}
      >
        Connect
      </button>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-500">
        <div className="mb-1 text-zinc-400">Start a runner first:</div>
        <code className="break-all text-zinc-300">starship-agent run --control-port {port} --control-token {cfg.token || '<token>'}</code>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
