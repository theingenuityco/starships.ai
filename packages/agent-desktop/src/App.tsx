import { useEffect, useRef, useState } from 'react';
import {
  assignPersonaRuntime,
  createPersona,
  createRuntime,
  deletePersona,
  deriveMcpUrl,
  listPersonas,
  listRuntimes,
  listStarships,
  login,
  mintToken,
  personaActivity,
  revokeToken,
  type AccessRole,
  type AgentPersona,
  type AgentRuntimeEvent,
  type AgentRuntimeKind,
  type Session,
  type Starship,
} from './serverApi';
import { detectAgents, hostname, isTauri, loadAgentsRaw, saveAgentsRaw, startRunner, stopRunner, type DetectedAgent, type RunnerInfo } from './tauri';
import { subscribeEvents, type RecentDispatch, type RunnerState } from './api';

type Screen = 'login' | 'starship' | 'runtimes';

/** A runtime connected from this machine, persisted to the Rust 0600 store. */
interface ConnectedRuntime {
  runtimeId: string;
  kind: string;
  name: string;
  token: string;
  tokenId: string;
  executor: string;
  mcpUrl: string;
}

const SERVER_KEY = 'starship-desktop-serverurl';

const KIND_LABEL: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  custom: 'Custom',
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

// Persistence is delegated to the Rust shell (0600 file) so tokens never touch
// the webview's localStorage. No-ops gracefully outside Tauri (e.g. vite dev).
async function loadConnected(): Promise<ConnectedRuntime[]> {
  if (!isTauri()) return [];
  try {
    return JSON.parse(await loadAgentsRaw());
  } catch {
    return [];
  }
}
function saveConnected(list: ConnectedRuntime[]) {
  if (!isTauri()) return;
  saveAgentsRaw(JSON.stringify(list)).catch(() => {});
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [starship, setStarship] = useState<Starship | null>(null);
  const [mcpUrl, setMcpUrl] = useState('');
  const [connected, setConnected] = useState<ConnectedRuntime[]>([]);
  const [runners, setRunners] = useState<Record<string, RunnerInfo>>({}); // runtimeId -> runner
  const [banner, setBanner] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const started = useRef(false);

  // On launch, load persisted runtimes and auto-restart their runners (no login needed).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const saved = await loadConnected();
        setConnected(saved);
        if (saved.length > 0) setScreen('runtimes');
        for (const r of saved) {
          if (!isTauri()) break;
          try {
            const info = await startRunner({ agentId: r.runtimeId, token: r.token, mcpUrl: r.mcpUrl, executor: r.executor });
            setRunners((prev) => ({ ...prev, [r.runtimeId]: info }));
          } catch (e) {
            setBanner(`Could not restart ${r.name}: ${(e as Error).message}`);
          }
        }
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  if (booting) {
    return <Shell title="Starship Agent"><p className="muted">Starting…</p></Shell>;
  }

  if (screen === 'login') {
    return <Login onDone={(s, ship) => { setSession(s); if (ship) { setStarship(ship); setMcpUrl(deriveMcpUrl(s.serverUrl)); setScreen('runtimes'); } else { setScreen('starship'); } }} />;
  }
  if (screen === 'starship' && session) {
    return <StarshipPicker session={session} onPick={(ship) => { setStarship(ship); setMcpUrl(deriveMcpUrl(session.serverUrl)); setScreen('runtimes'); }} />;
  }

  return (
    <Runtimes
      session={session}
      starship={starship}
      mcpUrl={mcpUrl}
      setMcpUrl={setMcpUrl}
      connected={connected}
      runners={runners}
      banner={banner}
      onLogin={() => setScreen('login')}
      onConnect={async (d, executor) => {
        if (!session || !starship) {
          setScreen('login');
          return;
        }
        setBanner(null);
        try {
          const host = await hostname();
          const name = `${kindLabel(d.kind)} · ${host}`;
          const existing = await listRuntimes(session, starship.id);
          let runtime = existing.find((r) => r.name === name);
          if (!runtime) {
            runtime = await createRuntime(session, { starshipId: starship.id, name, kind: d.kind as AgentRuntimeKind });
          }
          const { token, tokenId } = await mintToken(session, starship.id, runtime.id, `${name} (desktop)`);
          const info = await startRunner({ agentId: runtime.id, token, mcpUrl, executor });
          const rec: ConnectedRuntime = { runtimeId: runtime.id, kind: d.kind, name, token, tokenId, executor, mcpUrl };
          const next = [...connected.filter((c) => c.runtimeId !== runtime.id), rec];
          setConnected(next);
          saveConnected(next);
          setRunners((prev) => ({ ...prev, [runtime!.id]: info }));
        } catch (e) {
          setBanner(`Connect failed: ${(e as Error).message}`);
        }
      }}
      onStop={async (runtimeId) => {
        const info = runners[runtimeId];
        try {
          if (info && isTauri()) await stopRunner(info.runner_id);
        } catch {
          /* ignore */
        }
        // Best-effort revoke so stopped runtimes don't leave live tokens behind.
        const rec = connected.find((c) => c.runtimeId === runtimeId);
        if (session && rec?.tokenId) revokeToken(session, rec.tokenId).catch(() => {});
        const next = connected.filter((c) => c.runtimeId !== runtimeId);
        setConnected(next);
        saveConnected(next);
        setRunners((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== runtimeId)));
      }}
    />
  );
}

function Login({ onDone }: { onDone: (s: Session, starship: Starship | null) => void }) {
  const [serverUrl, setServerUrl] = useState(localStorage.getItem(SERVER_KEY) || 'http://localhost:4000');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { user, token, starship } = await login(serverUrl, email, password);
      localStorage.setItem(SERVER_KEY, serverUrl);
      onDone({ serverUrl, token, user }, starship);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Sign in to your Starship">
      <Field label="Server URL">
        <input className="inp" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://localhost:4000" />
      </Field>
      <Field label="Email">
        <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
      <Field label="Password">
        <input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>
      {error ? <Err>{error}</Err> : null}
      <button className="btn" onClick={submit} disabled={busy || !email || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </Shell>
  );
}

function StarshipPicker({ session, onPick }: { session: Session; onPick: (s: Starship) => void }) {
  const [ships, setShips] = useState<Starship[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listStarships(session).then(setShips).catch((e) => setError((e as Error).message));
  }, [session]);

  return (
    <Shell title="Choose a Starship">
      {error ? <Err>{error}</Err> : null}
      {!ships ? (
        <p className="muted">Loading…</p>
      ) : ships.length === 0 ? (
        <p className="muted">No starships on this account.</p>
      ) : (
        <ul className="list">
          {ships.map((s) => (
            <li key={s.id}>
              <button className="row-btn" onClick={() => onPick(s)}>
                <span>{s.name}</span>
                <span className="muted">{s.slug}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function Runtimes(props: {
  session: Session | null;
  starship: Starship | null;
  mcpUrl: string;
  setMcpUrl: (v: string) => void;
  connected: ConnectedRuntime[];
  runners: Record<string, RunnerInfo>;
  banner: string | null;
  onLogin: () => void;
  onConnect: (d: DetectedAgent, executor: string) => void;
  onStop: (runtimeId: string) => void;
}) {
  const { session, starship, mcpUrl, setMcpUrl, connected, runners, banner, onLogin, onConnect, onStop } = props;
  const [detected, setDetected] = useState<DetectedAgent[] | null>(null);
  const [execEdits, setExecEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isTauri()) {
      setDetected([]);
      return;
    }
    detectAgents().then(setDetected).catch(() => setDetected([]));
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-5 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Agent Runtimes</h1>
          <div className="muted text-xs">{starship ? `${starship.name}` : 'Not signed in'}</div>
        </div>
        <div className="flex items-center gap-2">
          {session ? <span className="muted text-xs">{session.user.email}</span> : null}
          <button className="btn-ghost" onClick={onLogin}>
            {session ? 'Switch starship' : 'Log in'}
          </button>
        </div>
      </header>

      {banner ? <Err>{banner}</Err> : null}

      {starship ? (
        <Field label="MCP endpoint">
          <input className="inp" value={mcpUrl} onChange={(e) => setMcpUrl(e.target.value)} />
        </Field>
      ) : null}

      <section>
        <h2 className="section">Connected runtimes ({connected.length})</h2>
        {connected.length === 0 ? (
          <p className="muted text-sm">No runtimes connected yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {connected.map((c) => (
              <RuntimeCard
                key={c.runtimeId}
                runtime={c}
                runner={runners[c.runtimeId]}
                session={session}
                starship={starship}
                onStop={() => onStop(c.runtimeId)}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section">Detected on this machine</h2>
        {!isTauri() ? (
          <p className="muted text-sm">Runtime detection runs in the desktop app.</p>
        ) : detected === null ? (
          <p className="muted text-sm">Scanning…</p>
        ) : detected.length === 0 ? (
          <p className="muted text-sm">No known agent CLIs found on your PATH.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detected.map((d) => {
              const exec = execEdits[d.command] ?? d.default_executor;
              return (
                <li key={d.command} className="rounded-md border border-zinc-800 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm">
                        {kindLabel(d.kind)} <span className="muted">· {d.command}</span>
                      </div>
                      <div className="muted truncate text-[11px]">{d.version || d.path}</div>
                    </div>
                    <button className="btn" disabled={!session || !starship} onClick={() => onConnect(d, exec)}>
                      Connect
                    </button>
                  </div>
                  <input className="inp mt-2 font-mono text-xs" value={exec} onChange={(e) => setExecEdits((p) => ({ ...p, [d.command]: e.target.value }))} />
                </li>
              );
            })}
          </ul>
        )}
        {!session ? <p className="muted mt-2 text-xs">Log in to connect a detected runtime.</p> : null}
      </section>

      <Style />
    </div>
  );
}

function RuntimeCard({
  runtime,
  runner,
  session,
  starship,
  onStop,
}: {
  runtime: ConnectedRuntime;
  runner?: RunnerInfo;
  session: Session | null;
  starship: Starship | null;
  onStop: () => void;
}) {
  const [state, setState] = useState<RunnerState | null>(null);
  useEffect(() => {
    if (!runner) return;
    const cfg = { baseUrl: `http://127.0.0.1:${runner.control_port}`, token: runner.control_token };
    // SSE: the control server primes with the current snapshot, then streams updates.
    return subscribeEvents(cfg, { onState: setState, onError: () => {} });
  }, [runner]);

  const status = state?.paused ? 'paused' : state?.status ?? (runner ? 'starting' : 'stopped');
  const color =
    status === 'online' || status === 'idle' ? 'bg-emerald-500' : status === 'busy' ? 'bg-blue-500' : status === 'stopped' ? 'bg-red-500' : 'bg-zinc-500';

  return (
    <li className="rounded-md border border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
          <div>
            <div className="text-sm">
              {runtime.name} <span className="muted text-[11px]">· {kindLabel(runtime.kind)}</span>
            </div>
            <div className="muted text-[11px] capitalize">
              {status}
              {state ? ` · ${state.processed} processed` : ''}
              {state?.lastPollAt ? ` · polled ${timeAgo(state.lastPollAt)}` : ''}
            </div>
          </div>
        </div>
        <button className="btn-ghost text-red-400" onClick={onStop}>
          Stop
        </button>
      </div>

      {state?.lastError ? <div className="mt-2 rounded border border-red-900/60 bg-red-950/30 px-2 py-1 text-[11px] text-red-300">{state.lastError}</div> : null}

      <ActivityList recent={state?.recent ?? []} />

      <PersonaSection session={session} starship={starship} runtimeId={runtime.runtimeId} />
    </li>
  );
}

const PHASE_COLOR: Record<RecentDispatch['phase'], string> = {
  running: 'text-blue-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
};

function ActivityList({ recent }: { recent: RecentDispatch[] }) {
  if (recent.length === 0) return <div className="muted mt-2 text-[11px]">No activity yet.</div>;
  return (
    <div className="mt-2">
      <div className="section">Recent activity</div>
      <ul className="flex flex-col gap-1">
        {recent.slice(0, 8).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate">
              <span className="font-mono">{r.commandType}</span>
              <span className={`ml-1 ${PHASE_COLOR[r.phase]}`}>{r.phase}</span>
              {r.exitCode != null && r.phase === 'failed' ? <span className="muted"> · exit {r.exitCode}</span> : null}
              {r.timedOut ? <span className="text-red-400"> · timed out</span> : null}
            </span>
            <span className="muted shrink-0">
              {r.durationMs != null ? `${r.durationMs}ms · ` : ''}
              {timeAgo(r.at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonaSection({ session, starship, runtimeId }: { session: Session | null; starship: Starship | null; runtimeId: string }) {
  const [personas, setPersonas] = useState<AgentPersona[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!session || !starship) return;
    try {
      const all = await listPersonas(session, starship.id);
      setPersonas(all.filter((p) => p.runtimeId === runtimeId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, [session, starship, runtimeId]);

  if (!session || !starship) {
    return <div className="muted mt-3 text-[11px]">Sign in to manage personas on this runtime.</div>;
  }

  return (
    <div className="mt-3 border-t border-zinc-800 pt-2">
      <div className="flex items-center justify-between">
        <div className="section mb-0">Personas ({personas?.length ?? 0})</div>
        <button className="btn-ghost text-[11px]" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ New persona'}
        </button>
      </div>

      {error ? <div className="mt-1 text-[11px] text-red-400">{error}</div> : null}

      {adding ? (
        <NewPersonaForm
          onCreate={async (input) => {
            await createPersona(session, { ...input, starshipId: starship.id, runtimeId });
            setAdding(false);
            await refresh();
          }}
        />
      ) : null}

      {personas && personas.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {personas.map((p) => (
            <PersonaRow
              key={p.id}
              session={session}
              persona={p}
              onUnassign={async () => {
                await assignPersonaRuntime(session, p.id, null);
                await refresh();
              }}
              onDelete={async () => {
                await deletePersona(session, p.id);
                await refresh();
              }}
            />
          ))}
        </ul>
      ) : personas ? (
        <div className="muted mt-1 text-[11px]">No personas assigned to this runtime yet.</div>
      ) : null}
    </div>
  );
}

function NewPersonaForm({ onCreate }: { onCreate: (input: { name: string; accessRole: AccessRole; model?: string; systemPrompt?: string }) => Promise<void> }) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [accessRole, setAccessRole] = useState<AccessRole>('contributor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), accessRole, model: model.trim() || undefined, systemPrompt: systemPrompt.trim() || undefined });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-zinc-800 p-2">
      <input className="inp text-xs" placeholder="Persona name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="flex gap-2">
        <input className="inp flex-1 text-xs" placeholder="Model (optional, e.g. claude-opus-4-8)" value={model} onChange={(e) => setModel(e.target.value)} />
        <select className="inp text-xs" value={accessRole} onChange={(e) => setAccessRole(e.target.value as AccessRole)}>
          <option value="contributor">contributor</option>
          <option value="viewer">viewer</option>
        </select>
      </div>
      <textarea
        className="inp font-mono text-xs"
        rows={3}
        placeholder="System prompt (optional) — injected into the runtime at execution time"
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
      />
      {error ? <div className="text-[11px] text-red-400">{error}</div> : null}
      <button className="btn self-start text-xs" onClick={submit} disabled={busy || !name.trim()}>
        {busy ? 'Creating…' : 'Create persona'}
      </button>
    </div>
  );
}

function PersonaRow({
  session,
  persona,
  onUnassign,
  onDelete,
}: {
  session: Session;
  persona: AgentPersona;
  onUnassign: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AgentRuntimeEvent[] | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && events === null) {
      try {
        setEvents(await personaActivity(session, persona.id, 30));
      } catch {
        setEvents([]);
      }
    }
  }

  return (
    <li className="rounded-md border border-zinc-800/70 p-2">
      <div className="flex items-center justify-between gap-2">
        <button className="min-w-0 text-left" onClick={toggle}>
          <div className="truncate text-xs">
            {persona.name} <span className="muted">· {persona.accessRole}</span>
            {persona.model ? <span className="muted"> · {persona.model}</span> : null}
          </div>
          {persona.systemPrompt ? <div className="muted truncate text-[11px]">{persona.systemPrompt}</div> : null}
        </button>
        <div className="flex shrink-0 gap-1">
          <button className="btn-ghost text-[11px]" onClick={onUnassign} title="Move off this runtime">
            Unassign
          </button>
          <button className="btn-ghost text-[11px] text-red-400" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
      {open ? (
        events === null ? (
          <div className="muted mt-1 text-[11px]">Loading activity…</div>
        ) : events.length === 0 ? (
          <div className="muted mt-1 text-[11px]">No recorded activity.</div>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-mono">{e.type}</span>
                <span className="muted shrink-0">{timeAgo(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}

// ---- small presentational helpers ----
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
      <Style />
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="muted">{label}</span>
      {children}
    </label>
  );
}
function Err({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{children}</div>;
}
function Style() {
  return (
    <style>{`
      .inp { background:#18181b; border:1px solid #3f3f46; border-radius:6px; padding:8px 10px; color:#e6e8ee; outline:none; }
      .inp:focus { border-color:#3b82f6; }
      .btn { background:#2563eb; color:#fff; border-radius:6px; padding:8px 14px; font-size:13px; }
      .btn:hover { background:#1d4ed8; } .btn:disabled { opacity:.5; }
      .btn-ghost { color:#a1a1aa; border-radius:6px; padding:6px 12px; font-size:13px; } .btn-ghost:hover { color:#e4e4e7; }
      .muted { color:#71717a; }
      .section { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#71717a; margin-bottom:8px; }
      .list { display:flex; flex-direction:column; gap:6px; }
      .row-btn { width:100%; display:flex; justify-content:space-between; gap:8px; border:1px solid #27272a; border-radius:6px; padding:10px 12px; text-align:left; }
      .row-btn:hover { border-color:#3b82f6; }
    `}</style>
  );
}
