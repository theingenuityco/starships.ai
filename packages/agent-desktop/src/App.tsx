import { useEffect, useRef, useState } from 'react';
import {
  createAgent,
  deriveMcpUrl,
  listAgents,
  listStarships,
  login,
  mintToken,
  revokeToken,
  type AgentKind,
  type Session,
  type Starship,
} from './serverApi';
import { detectAgents, hostname, isTauri, loadAgentsRaw, saveAgentsRaw, startRunner, stopRunner, type DetectedAgent, type RunnerInfo } from './tauri';
import { subscribeEvents, type RunnerState } from './api';

type Screen = 'login' | 'starship' | 'agents';

interface ConnectedAgent {
  agentId: string;
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
  custom: 'Agent',
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

// Persistence is delegated to the Rust shell (0600 file) so tokens never touch
// the webview's localStorage. No-ops gracefully outside Tauri (e.g. vite dev).
async function loadConnected(): Promise<ConnectedAgent[]> {
  if (!isTauri()) return [];
  try {
    return JSON.parse(await loadAgentsRaw());
  } catch {
    return [];
  }
}
function saveConnected(list: ConnectedAgent[]) {
  if (!isTauri()) return;
  saveAgentsRaw(JSON.stringify(list)).catch(() => {});
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [starship, setStarship] = useState<Starship | null>(null);
  const [mcpUrl, setMcpUrl] = useState('');
  const [connected, setConnected] = useState<ConnectedAgent[]>([]);
  const [runners, setRunners] = useState<Record<string, RunnerInfo>>({}); // agentId -> runner
  const [banner, setBanner] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const started = useRef(false);

  // On launch, load persisted agents and auto-restart their runners (no login needed).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const saved = await loadConnected();
        setConnected(saved);
        if (saved.length > 0) setScreen('agents');
        for (const a of saved) {
          if (!isTauri()) break;
          try {
            const info = await startRunner({ agentId: a.agentId, token: a.token, mcpUrl: a.mcpUrl, executor: a.executor });
            setRunners((prev) => ({ ...prev, [a.agentId]: info }));
          } catch (e) {
            setBanner(`Could not restart ${a.name}: ${(e as Error).message}`);
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
    return <Login onDone={(s, ship) => { setSession(s); if (ship) { setStarship(ship); setMcpUrl(deriveMcpUrl(s.serverUrl)); setScreen('agents'); } else { setScreen('starship'); } }} />;
  }
  if (screen === 'starship' && session) {
    return <StarshipPicker session={session} onPick={(ship) => { setStarship(ship); setMcpUrl(deriveMcpUrl(session.serverUrl)); setScreen('agents'); }} />;
  }

  return (
    <Agents
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
          const name = `${kindLabel(d.kind)} — ${host}`;
          const existing = await listAgents(session, starship.id);
          let agent = existing.find((a) => a.name === name);
          if (!agent) {
            agent = await createAgent(session, { starshipId: starship.id, name, kind: d.kind as AgentKind, accessRole: 'contributor' });
          }
          const { token, tokenId } = await mintToken(session, starship.id, agent.id, `${name} (desktop)`);
          const info = await startRunner({ agentId: agent.id, token, mcpUrl, executor });
          const rec: ConnectedAgent = { agentId: agent.id, kind: d.kind, name, token, tokenId, executor, mcpUrl };
          const next = [...connected.filter((c) => c.agentId !== agent.id), rec];
          setConnected(next);
          saveConnected(next);
          setRunners((prev) => ({ ...prev, [agent!.id]: info }));
        } catch (e) {
          setBanner(`Connect failed: ${(e as Error).message}`);
        }
      }}
      onStop={async (agentId) => {
        const info = runners[agentId];
        try {
          if (info && isTauri()) await stopRunner(info.runner_id);
        } catch {
          /* ignore */
        }
        // Best-effort revoke so stopped agents don't leave live tokens behind.
        const rec = connected.find((c) => c.agentId === agentId);
        if (session && rec?.tokenId) revokeToken(session, rec.tokenId).catch(() => {});
        const next = connected.filter((c) => c.agentId !== agentId);
        setConnected(next);
        saveConnected(next);
        setRunners((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== agentId)));
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

function Agents(props: {
  session: Session | null;
  starship: Starship | null;
  mcpUrl: string;
  setMcpUrl: (v: string) => void;
  connected: ConnectedAgent[];
  runners: Record<string, RunnerInfo>;
  banner: string | null;
  onLogin: () => void;
  onConnect: (d: DetectedAgent, executor: string) => void;
  onStop: (agentId: string) => void;
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
          <h1 className="text-lg font-semibold">Agents</h1>
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
        <h2 className="section">Connected ({connected.length})</h2>
        {connected.length === 0 ? (
          <p className="muted text-sm">No agents connected yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {connected.map((c) => (
              <ConnectedCard key={c.agentId} agent={c} runner={runners[c.agentId]} onStop={() => onStop(c.agentId)} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section">Detected on this machine</h2>
        {!isTauri() ? (
          <p className="muted text-sm">Agent detection runs in the desktop app.</p>
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
        {!session ? <p className="muted mt-2 text-xs">Log in to connect a detected agent.</p> : null}
      </section>

      <Style />
    </div>
  );
}

function ConnectedCard({ agent, runner, onStop }: { agent: ConnectedAgent; runner?: RunnerInfo; onStop: () => void }) {
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
            <div className="text-sm">{agent.name}</div>
            <div className="muted text-[11px] capitalize">
              {status}
              {state ? ` · ${state.processed} processed` : ''}
            </div>
          </div>
        </div>
        <button className="btn-ghost text-red-400" onClick={onStop}>
          Stop
        </button>
      </div>
      {state && state.recent.length > 0 ? (
        <div className="muted mt-2 text-[11px]">
          last: {state.recent[0].commandType} · {state.recent[0].phase}
          {state.recent[0].durationMs != null ? ` · ${state.recent[0].durationMs}ms` : ''}
        </div>
      ) : null}
    </li>
  );
}

// ---- small presentational helpers ----
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
