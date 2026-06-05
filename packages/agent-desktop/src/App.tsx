import { useEffect, useRef, useState } from 'react';
import {
  assignPersonaRuntime,
  createHeartbeat,
  createPersona,
  createRuntime,
  deleteHeartbeat,
  deletePersona,
  deriveMcpUrl,
  listHeartbeats,
  listPersonas,
  listRuntimes,
  listStarshipEvents,
  listStarships,
  login,
  mintToken,
  personaActivity,
  revokeToken,
  updateHeartbeat,
  type AccessRole,
  type AgentHeartbeat,
  type AgentPersona,
  type AgentRuntime,
  type AgentRuntimeEvent,
  type AgentRuntimeKind,
  type Session,
  type Starship,
} from './serverApi';
import {
  detectAgents,
  hostname,
  isTauri,
  loadAgentsRaw,
  readAgentTranscript,
  saveAgentsRaw,
  startRunner,
  stopRunner,
  type DetectedAgent,
  type RunnerInfo,
} from './tauri';
import { subscribeEvents, type RecentDispatch, type RunnerState } from './api';
import { parseClaudeTranscript, type TranscriptTurn, type TurnRole } from './transcript';

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
    <Dashboard
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

type Tab = 'runtime' | 'personas' | 'heartbeats' | 'activity';

const TABS: { id: Tab; label: string }[] = [
  { id: 'runtime', label: 'Runtime' },
  { id: 'personas', label: 'Personas' },
  { id: 'heartbeats', label: 'Heartbeats' },
  { id: 'activity', label: 'Activity' },
];

function Dashboard(props: {
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
  const [tab, setTab] = useState<Tab>('runtime');

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Starship Agent</h1>
          <div className="muted text-xs">{starship ? `${starship.name}` : 'Not signed in'}</div>
        </div>
        <div className="flex items-center gap-2">
          {session ? <span className="muted text-xs">{session.user.email}</span> : null}
          <button className="btn-ghost" onClick={onLogin}>
            {session ? 'Switch starship' : 'Log in'}
          </button>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-zinc-800">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab tab-active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {banner ? <Err>{banner}</Err> : null}

      {tab === 'runtime' ? (
        <RuntimeTab
          session={session}
          starship={starship}
          mcpUrl={mcpUrl}
          setMcpUrl={setMcpUrl}
          connected={connected}
          runners={runners}
          onConnect={onConnect}
          onStop={onStop}
        />
      ) : tab === 'personas' ? (
        <PersonasTab session={session} starship={starship} />
      ) : tab === 'heartbeats' ? (
        <HeartbeatsTab session={session} starship={starship} />
      ) : (
        <ActivityTab session={session} starship={starship} />
      )}

      <Style />
    </div>
  );
}

function RuntimeTab(props: {
  session: Session | null;
  starship: Starship | null;
  mcpUrl: string;
  setMcpUrl: (v: string) => void;
  connected: ConnectedRuntime[];
  runners: Record<string, RunnerInfo>;
  onConnect: (d: DetectedAgent, executor: string) => void;
  onStop: (runtimeId: string) => void;
}) {
  const { session, starship, mcpUrl, setMcpUrl, connected, runners, onConnect, onStop } = props;
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
    <div className="flex flex-col gap-5">
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
              <RuntimeCard key={c.runtimeId} runtime={c} runner={runners[c.runtimeId]} onStop={() => onStop(c.runtimeId)} />
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
    </div>
  );
}

function RuntimeCard({ runtime, runner, onStop }: { runtime: ConnectedRuntime; runner?: RunnerInfo; onStop: () => void }) {
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

function PersonasTab({ session, starship }: { session: Session | null; starship: Starship | null }) {
  const [personas, setPersonas] = useState<AgentPersona[] | null>(null);
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!session || !starship) return;
    try {
      const [ps, rs] = await Promise.all([listPersonas(session, starship.id), listRuntimes(session, starship.id)]);
      setPersonas(ps);
      setRuntimes(rs);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, [session, starship]);

  if (!session || !starship) {
    return <p className="muted text-sm">Sign in to manage personas.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="section mb-0">Personas ({personas?.length ?? 0})</h2>
        <button className="btn-ghost text-xs" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ New persona'}
        </button>
      </div>

      <p className="muted text-[11px]">An actor (name, model, system prompt) that runs on a runtime. Reassign it to any connected runtime below.</p>

      {error ? <div className="text-[11px] text-red-400">{error}</div> : null}

      {adding ? (
        <NewPersonaForm
          onCreate={async (input) => {
            await createPersona(session, { ...input, starshipId: starship.id });
            setAdding(false);
            await refresh();
          }}
        />
      ) : null}

      {personas && personas.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {personas.map((p) => (
            <PersonaCard
              key={p.id}
              session={session}
              persona={p}
              runtimes={runtimes}
              onAssign={async (runtimeId) => {
                await assignPersonaRuntime(session, p.id, runtimeId);
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
        <p className="muted text-sm">No personas yet. Create one to give your runtimes an actor to run.</p>
      ) : (
        <p className="muted text-sm">Loading…</p>
      )}
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

function PersonaCard({
  session,
  persona,
  runtimes,
  onAssign,
  onDelete,
}: {
  session: Session;
  persona: AgentPersona;
  runtimes: AgentRuntime[];
  onAssign: (runtimeId: string | null) => Promise<void>;
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
    <li className="rounded-md border border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <button className="min-w-0 text-left" onClick={toggle}>
          <div className="truncate text-sm">
            {persona.name} <span className="muted text-[11px]">· {persona.accessRole}</span>
            {persona.model ? <span className="muted text-[11px]"> · {persona.model}</span> : null}
          </div>
          {persona.systemPrompt ? <div className="muted truncate text-[11px]">{persona.systemPrompt}</div> : null}
        </button>
        <button className="btn-ghost shrink-0 text-[11px] text-red-400" onClick={onDelete}>
          Delete
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="muted shrink-0">Runtime</span>
        <select className="inp flex-1 text-xs" value={persona.runtimeId ?? ''} onChange={(e) => onAssign(e.target.value || null)}>
          <option value="">Unassigned</option>
          {runtimes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      {open ? (
        events === null ? (
          <div className="muted mt-2 text-[11px]">Loading activity…</div>
        ) : events.length === 0 ? (
          <div className="muted mt-2 text-[11px]">No recorded activity.</div>
        ) : (
          <ul className="mt-2 flex flex-col gap-0.5">
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

// ---- Heartbeats tab ----

const INTERVAL_PRESETS: { label: string; seconds: number }[] = [
  { label: 'Every minute', seconds: 60 },
  { label: 'Every 5 minutes', seconds: 300 },
  { label: 'Every 15 minutes', seconds: 900 },
  { label: 'Hourly', seconds: 3600 },
  { label: 'Every 6 hours', seconds: 21600 },
  { label: 'Daily', seconds: 86400 },
];

function humanInterval(seconds: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.seconds === seconds);
  if (preset) return preset.label.toLowerCase();
  if (seconds % 86400 === 0) return `every ${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `every ${seconds / 3600}h`;
  if (seconds % 60 === 0) return `every ${seconds / 60}m`;
  return `every ${seconds}s`;
}

function HeartbeatsTab({ session, starship }: { session: Session | null; starship: Starship | null }) {
  const [personas, setPersonas] = useState<AgentPersona[]>([]);
  const [heartbeats, setHeartbeats] = useState<AgentHeartbeat[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!session || !starship) return;
    try {
      const ps = await listPersonas(session, starship.id);
      setPersonas(ps);
      const lists = await Promise.all(ps.map((p) => listHeartbeats(session, starship.id, p.id).catch(() => [] as AgentHeartbeat[])));
      setHeartbeats(lists.flat());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, [session, starship]);

  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? 'Unknown persona';

  if (!session || !starship) {
    return <p className="muted text-sm">Sign in to manage heartbeats.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="section mb-0">Heartbeats ({heartbeats?.length ?? 0})</h2>
        <button className="btn-ghost text-xs" disabled={personas.length === 0} onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ New heartbeat'}
        </button>
      </div>

      <p className="muted text-[11px]">
        A recurring command the server dispatches to a persona on a schedule. The runtime that persona is assigned to picks it up on its next poll.
      </p>

      {error ? <div className="text-[11px] text-red-400">{error}</div> : null}

      {personas.length === 0 ? (
        <p className="muted text-sm">Create a persona first — heartbeats target a persona.</p>
      ) : null}

      {adding ? (
        <NewHeartbeatForm
          personas={personas}
          onCreate={async (personaId, input) => {
            await createHeartbeat(session, starship.id, personaId, input);
            setAdding(false);
            await refresh();
          }}
        />
      ) : null}

      {heartbeats && heartbeats.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {heartbeats.map((h) => (
            <HeartbeatCard
              key={h.id}
              heartbeat={h}
              personaName={personaName(h.personaId)}
              onToggle={async (enabled) => {
                await updateHeartbeat(session, h.id, { enabled });
                await refresh();
              }}
              onDelete={async () => {
                await deleteHeartbeat(session, h.id);
                await refresh();
              }}
            />
          ))}
        </ul>
      ) : heartbeats ? (
        personas.length > 0 ? (
          <p className="muted text-sm">No heartbeats yet. Add one to run a persona on a schedule.</p>
        ) : null
      ) : (
        <p className="muted text-sm">Loading…</p>
      )}
    </div>
  );
}

function NewHeartbeatForm({
  personas,
  onCreate,
}: {
  personas: AgentPersona[];
  onCreate: (
    personaId: string,
    input: { name?: string; commandType: string; payload?: Record<string, unknown>; intervalSeconds: number; enabled?: boolean }
  ) => Promise<void>;
}) {
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? '');
  const [name, setName] = useState('');
  const [commandType, setCommandType] = useState('');
  const [prompt, setPrompt] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(300);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onCreate(personaId, {
        name: name.trim() || undefined,
        commandType: commandType.trim(),
        payload: prompt.trim() ? { prompt: prompt.trim() } : undefined,
        intervalSeconds,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-800 p-3">
      <label className="flex flex-col gap-1 text-[11px]">
        <span className="muted">Persona</span>
        <select className="inp text-xs" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <input className="inp text-xs" placeholder="Name (optional, e.g. Daily standup)" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className="inp font-mono text-xs"
        placeholder="Command type (e.g. run_prompt, sync_inbox)"
        value={commandType}
        onChange={(e) => setCommandType(e.target.value)}
      />
      <textarea
        className="inp text-xs"
        rows={3}
        placeholder="Prompt — what the agent should do each time this fires"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <label className="flex flex-col gap-1 text-[11px]">
        <span className="muted">Interval</span>
        <select className="inp text-xs" value={intervalSeconds} onChange={(e) => setIntervalSeconds(Number(e.target.value))}>
          {INTERVAL_PRESETS.map((p) => (
            <option key={p.seconds} value={p.seconds}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {error ? <div className="text-[11px] text-red-400">{error}</div> : null}
      <button className="btn self-start text-xs" onClick={submit} disabled={busy || !personaId || !commandType.trim()}>
        {busy ? 'Creating…' : 'Create heartbeat'}
      </button>
    </div>
  );
}

function HeartbeatCard({
  heartbeat,
  personaName,
  onToggle,
  onDelete,
}: {
  heartbeat: AgentHeartbeat;
  personaName: string;
  onToggle: (enabled: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const h = heartbeat;
  return (
    <li className="rounded-md border border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm">
            {h.name || h.commandType} <span className="muted text-[11px]">· {personaName}</span>
          </div>
          <div className="muted text-[11px]">
            <span className="font-mono">{h.commandType}</span> · {humanInterval(h.intervalSeconds)}
            {h.enabled ? <span> · next {timeUntil(h.nextFireAt)}</span> : <span> · paused</span>}
            {h.lastFiredAt ? <span> · last fired {timeAgo(h.lastFiredAt)}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="btn-ghost text-[11px]" onClick={() => onToggle(!h.enabled)}>
            {h.enabled ? 'Pause' : 'Resume'}
          </button>
          <button className="btn-ghost text-[11px] text-red-400" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

// ---- Activity tab ----

/** A session = one dispatch's worth of events (its transcript). Loose events with no
 *  dispatch each stand alone as a single-entry session. */
interface Session_ {
  key: string;
  dispatchId: string | null;
  personaId: string | null;
  runtimeId: string | null;
  /** The CLI session id reported by the runner, if any — used to load the transcript. */
  sessionId: string | null;
  events: AgentRuntimeEvent[];
  lastAt: string;
}

function groupSessions(events: AgentRuntimeEvent[]): Session_[] {
  const byDispatch = new Map<string, AgentRuntimeEvent[]>();
  for (const e of events) {
    const key = e.dispatchId ?? `event:${e.id}`;
    const list = byDispatch.get(key);
    if (list) list.push(e);
    else byDispatch.set(key, [e]);
  }
  const sessions: Session_[] = [];
  for (const [key, evs] of byDispatch) {
    // Chronological within a session (the transcript reads top-to-bottom).
    evs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const first = evs[0];
    const sessionId = evs.map((e) => e.payload?.sessionId).find((v): v is string => typeof v === 'string' && v.length > 0) ?? null;
    sessions.push({
      key,
      dispatchId: first.dispatchId ?? null,
      personaId: evs.find((e) => e.personaId)?.personaId ?? null,
      runtimeId: evs.find((e) => e.runtimeId)?.runtimeId ?? null,
      sessionId,
      events: evs,
      lastAt: evs[evs.length - 1].createdAt,
    });
  }
  // Most recently active session first.
  sessions.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return sessions;
}

function ActivityTab({ session, starship }: { session: Session | null; starship: Starship | null }) {
  const [events, setEvents] = useState<AgentRuntimeEvent[] | null>(null);
  const [names, setNames] = useState<{ personas: Record<string, string>; runtimes: Record<string, string> }>({ personas: {}, runtimes: {} });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!session || !starship) return;
    setLoading(true);
    setError(null);
    try {
      const [evs, personas, runtimes] = await Promise.all([
        listStarshipEvents(session, starship.id, 200),
        listPersonas(session, starship.id).catch(() => []),
        listRuntimes(session, starship.id).catch(() => []),
      ]);
      setNames({
        personas: Object.fromEntries(personas.map((p) => [p.id, p.name])),
        runtimes: Object.fromEntries(runtimes.map((r) => [r.id, r.name])),
      });
      setEvents(evs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [session, starship]);

  if (!session || !starship) {
    return <p className="muted text-sm">Sign in to view activity.</p>;
  }

  const sessions = events ? groupSessions(events) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="section mb-0">Sessions ({sessions?.length ?? 0})</h2>
        <button className="btn-ghost text-xs" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <p className="muted text-[11px]">Every run, newest first. A session groups the events from one dispatch into a transcript; expand to read it.</p>

      {error ? <div className="text-[11px] text-red-400">{error}</div> : null}

      {sessions && sessions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <SessionCard
              key={s.key}
              session={s}
              personaName={s.personaId ? names.personas[s.personaId] ?? 'Unknown persona' : null}
              runtimeName={s.runtimeId ? names.runtimes[s.runtimeId] ?? 'Unknown runtime' : null}
            />
          ))}
        </ul>
      ) : sessions ? (
        <p className="muted text-sm">No activity recorded yet.</p>
      ) : (
        <p className="muted text-sm">Loading…</p>
      )}
    </div>
  );
}

/** A one-line + body summary of an event payload — surfaces exit code, timing,
 *  and the captured stderr/stdout so a failed run explains itself. */
function eventDetail(payload: Record<string, unknown>): string | null {
  const meta: string[] = [];
  if (typeof payload.exitCode === 'number') meta.push(`exit ${payload.exitCode}`);
  if (payload.timedOut) meta.push('timed out');
  if (typeof payload.durationMs === 'number') meta.push(`${payload.durationMs}ms`);

  const body =
    typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : typeof payload.output === 'string' && payload.output.trim()
        ? payload.output.trim()
        : '';

  const head = meta.join(' · ');
  if (!head && !body) return null;
  return [head, body].filter(Boolean).join('\n');
}

type TranscriptState = 'unloaded' | 'loading' | 'loaded' | 'missing' | 'error';

function SessionCard({ session, personaName, runtimeName }: { session: Session_; personaName: string | null; runtimeName: string | null }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [tState, setTState] = useState<TranscriptState>('unloaded');
  const title = session.dispatchId ? `Dispatch ${session.dispatchId.slice(0, 8)}` : session.events[0].type;
  const hasTranscript = Boolean(session.sessionId) && isTauri();

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && hasTranscript && tState === 'unloaded' && session.sessionId) {
      setTState('loading');
      try {
        const raw = await readAgentTranscript(session.sessionId);
        if (!raw) {
          setTState('missing');
          return;
        }
        setTurns(parseClaudeTranscript(raw));
        setTState('loaded');
      } catch {
        setTState('error');
      }
    }
  }

  return (
    <li className="rounded-md border border-zinc-800 p-3">
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={toggle}>
        <div className="min-w-0">
          <div className="truncate text-sm">
            {title}
            {personaName ? <span className="muted text-[11px]"> · {personaName}</span> : null}
            {hasTranscript ? <span className="text-[11px] text-emerald-500"> · transcript</span> : null}
          </div>
          <div className="muted text-[11px]">
            {session.events.length} event{session.events.length === 1 ? '' : 's'}
            {runtimeName ? ` · ${runtimeName}` : ''} · {timeAgo(session.lastAt)}
          </div>
        </div>
        <span className="muted shrink-0 text-[11px]">{open ? '▾' : '▸'}</span>
      </button>

      {open ? (
        <div className="mt-2 border-t border-zinc-800 pt-2">
          {hasTranscript ? (
            tState === 'loading' ? (
              <div className="muted text-[11px]">Reading transcript…</div>
            ) : tState === 'missing' ? (
              <div className="muted text-[11px]">No local transcript found for this session (it may have run on another machine).</div>
            ) : tState === 'error' ? (
              <div className="text-[11px] text-red-400">Could not read the transcript file.</div>
            ) : turns.length > 0 ? (
              <ol className="flex flex-col gap-2">
                {turns.map((t, i) => (
                  <TurnRow key={i} turn={t} />
                ))}
              </ol>
            ) : (
              <div className="muted text-[11px]">Transcript is empty.</div>
            )
          ) : null}

          <div className={hasTranscript ? 'mt-3 border-t border-zinc-800 pt-2' : ''}>
            {hasTranscript ? <div className="section">Events</div> : null}
            <ol className="flex flex-col gap-1.5">
              {session.events.map((e) => {
                const detail = eventDetail(e.payload ?? {});
                const failed = e.type === 'command_failed';
                return (
                  <li key={e.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className={`truncate font-mono ${failed ? 'text-red-400' : 'text-zinc-300'}`}>{e.type}</span>
                      <span className="muted shrink-0">{timeAgo(e.createdAt)}</span>
                    </div>
                    {detail ? (
                      <pre className={`overflow-x-auto whitespace-pre-wrap break-words rounded bg-zinc-900/70 px-2 py-1 text-[10px] leading-relaxed ${failed ? 'text-red-300' : 'text-zinc-400'}`}>{detail}</pre>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      ) : null}
    </li>
  );
}

const TURN_META: Record<TurnRole, { label: string; cls: string }> = {
  user: { label: 'User', cls: 'text-zinc-300' },
  assistant: { label: 'Assistant', cls: 'text-blue-300' },
  tool: { label: 'Tool', cls: 'text-amber-300' },
  result: { label: 'Result', cls: 'text-zinc-500' },
};

function TurnRow({ turn }: { turn: TranscriptTurn }) {
  const meta = TURN_META[turn.role];
  const mono = turn.role === 'tool' || turn.role === 'result';
  return (
    <li className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-wide">
        <span className={meta.cls}>{meta.label}</span>
        {turn.tool && turn.role === 'tool' ? <span className="muted"> · {turn.tool}</span> : null}
      </div>
      <div className={`whitespace-pre-wrap break-words text-[11px] leading-relaxed ${mono ? 'font-mono text-zinc-400' : 'text-zinc-200'}`}>{turn.text}</div>
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

function timeUntil(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.round((t - Date.now()) / 1000);
  if (s <= 0) return 'now';
  if (s < 60) return `in ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
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
      .tab { padding:8px 12px; font-size:13px; color:#a1a1aa; border-bottom:2px solid transparent; margin-bottom:-1px; }
      .tab:hover { color:#e4e4e7; }
      .tab-active { color:#e6e8ee; border-bottom-color:#3b82f6; }
    `}</style>
  );
}
