import { useEffect, useRef, useState } from 'react';
import {
  addHeartbeat,
  addPersona,
  addRuntime,
  deleteHeartbeat,
  deletePersona,
  eventsForPersona,
  getStore,
  initStore,
  removeRuntime,
  updateHeartbeat,
  updatePersona,
  useStore,
  type AgentEvent,
  type Heartbeat,
  type Persona,
  type Runtime,
  type RuntimeKind,
} from './store';
import { runPersona } from './engine';
import { detectAgents, hostname, isTauri, readAgentTranscript, type DetectedAgent } from './tauri';
import { parseClaudeTranscript, type TranscriptTurn, type TurnRole } from './transcript';
import { Onboarding } from './Onboarding';
import { COMMON_TOOLS, DEFAULT_PERMISSIONS, SUPPORTS_ALLOWLIST, type PermissionPolicy } from './permissions';
import { useLiveRun, type LiveRun } from './liveRuns';

const KIND_LABEL: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  custom: 'Custom',
};
export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

/** Poll cadence for the in-app heartbeat scheduler (runs only while the app is open). */
const SCHEDULER_TICK_MS = 20_000;

export default function App() {
  const [booting, setBooting] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    initStore().finally(() => setBooting(false));
  }, []);

  // In-app heartbeat scheduler: fire any due, enabled heartbeats. Because this
  // lives in the app process, schedules only advance while the app is running.
  useEffect(() => {
    if (booting) return;
    const tick = () => {
      const store = getStore();
      const nowMs = Date.now();
      for (const h of store.heartbeats) {
        if (!h.enabled) continue;
        if (new Date(h.nextFireAt).getTime() > nowMs) continue;
        // Advance the schedule first so a long run can't double-fire on the next tick.
        updateHeartbeat(h.id, { lastFiredAt: new Date().toISOString(), nextFireAt: new Date(nowMs + h.intervalSeconds * 1000).toISOString() });
        void runPersona(h.personaId, h.prompt).catch(() => {});
      }
    };
    const id = setInterval(tick, SCHEDULER_TICK_MS);
    return () => clearInterval(id);
  }, [booting]);

  const store = useStore();

  if (booting) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-semibold">Starship Agent</h1>
        <p className="muted">Starting…</p>
        <Style />
      </div>
    );
  }

  if (!store.onboardedAt) return <Onboarding />;

  return <Dashboard />;
}

type Tab = 'runtime' | 'personas' | 'heartbeats' | 'activity';

const TABS: { id: Tab; label: string }[] = [
  { id: 'runtime', label: 'Runtimes' },
  { id: 'personas', label: 'Personas' },
  { id: 'heartbeats', label: 'Heartbeats' },
  { id: 'activity', label: 'Activity' },
];

function Dashboard() {
  const [tab, setTab] = useState<Tab>('runtime');

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-lg font-semibold">Starship Agent</h1>
        <div className="muted text-xs">Local agent orchestrator</div>
      </header>

      <nav className="flex gap-1 border-b border-zinc-800">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab tab-active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'runtime' ? <RuntimeTab /> : tab === 'personas' ? <PersonasTab /> : tab === 'heartbeats' ? <HeartbeatsTab /> : <ActivityTab />}

      <Style />
    </div>
  );
}

// ---- Runtimes tab ----

function RuntimeTab() {
  const store = useStore();
  const [detected, setDetected] = useState<DetectedAgent[] | null>(null);
  const [execEdits, setExecEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isTauri()) {
      setDetected([]);
      return;
    }
    detectAgents()
      .then(setDetected)
      .catch(() => setDetected([]));
  }, []);

  async function add(d: DetectedAgent, executor: string) {
    const host = await hostname();
    addRuntime({ name: `${kindLabel(d.kind)} · ${host}`, kind: d.kind as RuntimeKind, executor });
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="section">Runtimes ({store.runtimes.length})</h2>
        {store.runtimes.length === 0 ? (
          <p className="muted text-sm">No runtimes yet. Add a detected CLI below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {store.runtimes.map((r) => (
              <RuntimeCard key={r.id} runtime={r} onRemove={() => removeRuntime(r.id)} />
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
                    <button className="btn" onClick={() => add(d, exec)}>
                      Add
                    </button>
                  </div>
                  <input
                    className="inp mt-2 font-mono text-xs"
                    value={exec}
                    onChange={(e) => setExecEdits((p) => ({ ...p, [d.command]: e.target.value }))}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function RuntimeCard({ runtime, onRemove }: { runtime: Runtime; onRemove: () => void }) {
  return (
    <li className="rounded-md border border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm">
            {runtime.name} <span className="muted text-[11px]">· {kindLabel(runtime.kind)}</span>
          </div>
          <div className="muted truncate font-mono text-[11px]">{runtime.executor}</div>
        </div>
        <button className="btn-ghost shrink-0 text-red-400" onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  );
}

// ---- Personas tab ----

function PersonasTab() {
  const store = useStore();
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="section mb-0">Personas ({store.personas.length})</h2>
        <button className="btn-ghost text-xs" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ New persona'}
        </button>
      </div>

      <p className="muted text-[11px]">An actor (name, model, system prompt) that runs on a runtime. Assign it to a runtime, then run it.</p>

      {adding ? (
        <NewPersonaForm
          onCreate={(input) => {
            addPersona(input);
            setAdding(false);
          }}
        />
      ) : null}

      {store.personas.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {store.personas.map((p) => (
            <PersonaCard key={p.id} persona={p} runtimes={store.runtimes} />
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">No personas yet. Create one to give your runtimes an actor to run.</p>
      )}
    </div>
  );
}

function NewPersonaForm({
  onCreate,
}: {
  onCreate: (input: { name: string; model?: string; systemPrompt?: string; permissions?: PermissionPolicy }) => void;
}) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [permissions, setPermissions] = useState<PermissionPolicy>(DEFAULT_PERMISSIONS);

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-zinc-800 p-2">
      <input className="inp text-xs" placeholder="Persona name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <input className="inp text-xs" placeholder="Model (optional, e.g. claude-opus-4-8)" value={model} onChange={(e) => setModel(e.target.value)} />
      <textarea
        className="inp font-mono text-xs"
        rows={3}
        placeholder="System prompt (optional) — injected into the runtime at execution time"
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
      />
      <div className="flex flex-col gap-1">
        <span className="section mb-0">Tool permissions</span>
        <PermissionEditor value={permissions} onChange={setPermissions} />
      </div>
      <button
        className="btn self-start text-xs"
        onClick={() => onCreate({ name: name.trim(), model: model.trim() || undefined, systemPrompt: systemPrompt.trim() || undefined, permissions })}
        disabled={!name.trim()}
      >
        Create persona
      </button>
    </div>
  );
}

/**
 * Edits a persona's tool-permission policy. Runtime-aware: a tool-name allowlist is only
 * offered when the assigned runtime kind supports one (otherwise "Restrict" falls back to
 * the CLI's default approvals, which we make explicit). `kind` is undefined before a runtime
 * is assigned (e.g. at creation).
 */
function PermissionEditor({
  kind,
  value,
  onChange,
}: {
  kind?: RuntimeKind;
  value: PermissionPolicy;
  onChange: (p: PermissionPolicy) => void;
}) {
  const supportsAllowlist = kind != null && SUPPORTS_ALLOWLIST.includes(kind);
  const commons = value.allow.filter((t) => COMMON_TOOLS.includes(t));
  const parseExtra = (text: string) =>
    text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !COMMON_TOOLS.includes(s));
  const [extraText, setExtraText] = useState(() => value.allow.filter((t) => !COMMON_TOOLS.includes(t)).join(', '));

  const toggle = (tool: string) => {
    const nextCommons = commons.includes(tool) ? commons.filter((t) => t !== tool) : [...commons, tool];
    onChange({ ...value, allow: [...nextCommons, ...parseExtra(extraText)] });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        <button className={value.mode === 'all' ? 'tab tab-active' : 'tab'} onClick={() => onChange({ ...value, mode: 'all' })}>
          Allow all tools
        </button>
        <button className={value.mode === 'allowlist' ? 'tab tab-active' : 'tab'} onClick={() => onChange({ ...value, mode: 'allowlist' })}>
          Restrict
        </button>
      </div>

      {value.mode === 'allowlist' ? (
        supportsAllowlist ? (
          <>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {COMMON_TOOLS.map((t) => (
                <label key={t} className="flex items-center gap-1 text-[11px]">
                  <input type="checkbox" checked={value.allow.includes(t)} onChange={() => toggle(t)} />
                  {t}
                </label>
              ))}
            </div>
            <input
              className="inp font-mono text-xs"
              placeholder="Extra patterns, comma-separated (e.g. Bash(git *))"
              value={extraText}
              onChange={(e) => {
                setExtraText(e.target.value);
                onChange({ ...value, allow: [...commons, ...parseExtra(e.target.value)] });
              }}
            />
          </>
        ) : (
          <p className="muted text-[11px]">
            {kind ? kindLabel(kind) : 'This runtime'} runs with its default approvals; in unattended runs most tools stay
            blocked. Use “Allow all” to let it act.
          </p>
        )
      ) : null}
    </div>
  );
}

function PersonaCard({ persona, runtimes }: { persona: Persona; runtimes: Runtime[] }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState(false);
  const [activeDispatch, setActiveDispatch] = useState<string | null>(null);
  const live = useLiveRun(activeDispatch);
  const events = open ? eventsForPersona(persona.id).slice(-30).reverse() : [];

  const policy = persona.permissions ?? DEFAULT_PERMISSIONS;
  const runtimeKind = runtimes.find((r) => r.id === persona.runtimeId)?.kind;
  const permSummary =
    policy.mode === 'all' ? 'Allow all tools' : policy.allow.length ? `Restrict · ${policy.allow.join(', ')}` : 'Restrict · nothing';

  async function run() {
    if (!prompt.trim()) return;
    setRunning(true);
    setOutcome(null);
    try {
      const r = await runPersona(persona.id, prompt.trim(), setActiveDispatch);
      setOutcome(r.ok ? `Done in ${r.durationMs}ms` : `Failed${r.exitCode != null ? ` (exit ${r.exitCode})` : ''}`);
    } catch (e) {
      setOutcome((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <li className="rounded-md border border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <button className="min-w-0 text-left" onClick={() => setOpen((v) => !v)}>
          <div className="truncate text-sm">
            {persona.name}
            {persona.model ? <span className="muted text-[11px]"> · {persona.model}</span> : null}
          </div>
          {persona.systemPrompt ? <div className="muted truncate text-[11px]">{persona.systemPrompt}</div> : null}
        </button>
        <button className="btn-ghost shrink-0 text-[11px] text-red-400" onClick={() => deletePersona(persona.id)}>
          Delete
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="muted shrink-0">Runtime</span>
        <select
          className="inp flex-1 text-xs"
          value={persona.runtimeId ?? ''}
          onChange={(e) => updatePersona(persona.id, { runtimeId: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {runtimes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-2 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="muted truncate">Permissions · {permSummary}</span>
          <button className="btn-ghost shrink-0 text-[11px]" onClick={() => setEditPerms((v) => !v)}>
            {editPerms ? 'Done' : 'Edit'}
          </button>
        </div>
        {editPerms ? (
          <PermissionEditor
            kind={runtimeKind}
            value={policy}
            onChange={(permissions) => updatePersona(persona.id, { permissions })}
          />
        ) : null}
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <textarea
          className="inp text-xs"
          rows={2}
          placeholder={persona.runtimeId ? 'Prompt — what should this persona do?' : 'Assign a runtime to run this persona'}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={!persona.runtimeId}
        />
        <div className="flex items-center gap-2">
          <button className="btn text-xs" onClick={run} disabled={running || !persona.runtimeId || !prompt.trim()}>
            {running ? 'Running…' : 'Run now'}
          </button>
          {outcome ? <span className="muted text-[11px]">{outcome}</span> : null}
        </div>
        {live ? <LiveConversation run={live} /> : null}
      </div>

      {open ? (
        events.length === 0 ? (
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

function HeartbeatsTab() {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const personaName = (id: string) => store.personas.find((p) => p.id === id)?.name ?? 'Unknown persona';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="section mb-0">Heartbeats ({store.heartbeats.length})</h2>
        <button className="btn-ghost text-xs" disabled={store.personas.length === 0} onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ New heartbeat'}
        </button>
      </div>

      <p className="muted text-[11px]">A recurring prompt run against a persona on a schedule. Schedules advance only while this app is open.</p>

      {store.personas.length === 0 ? <p className="muted text-sm">Create a persona first — heartbeats target a persona.</p> : null}

      {adding ? (
        <NewHeartbeatForm
          personas={store.personas}
          onCreate={(input) => {
            addHeartbeat(input);
            setAdding(false);
          }}
        />
      ) : null}

      {store.heartbeats.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {store.heartbeats.map((h) => (
            <HeartbeatCard
              key={h.id}
              heartbeat={h}
              personaName={personaName(h.personaId)}
              onToggle={(enabled) => updateHeartbeat(h.id, { enabled })}
              onDelete={() => deleteHeartbeat(h.id)}
            />
          ))}
        </ul>
      ) : store.personas.length > 0 ? (
        <p className="muted text-sm">No heartbeats yet. Add one to run a persona on a schedule.</p>
      ) : null}
    </div>
  );
}

function NewHeartbeatForm({
  personas,
  onCreate,
}: {
  personas: Persona[];
  onCreate: (input: { personaId: string; name?: string; prompt: string; intervalSeconds: number }) => void;
}) {
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? '');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(300);

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
      <textarea
        className="inp text-xs"
        rows={3}
        placeholder="Prompt — what the persona should do each time this fires"
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
      <button
        className="btn self-start text-xs"
        onClick={() => onCreate({ personaId, name: name.trim() || undefined, prompt: prompt.trim(), intervalSeconds })}
        disabled={!personaId || !prompt.trim()}
      >
        Create heartbeat
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
  heartbeat: Heartbeat;
  personaName: string;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const h = heartbeat;
  return (
    <li className="rounded-md border border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm">
            {h.name || 'Heartbeat'} <span className="muted text-[11px]">· {personaName}</span>
          </div>
          <div className="muted text-[11px]">
            {humanInterval(h.intervalSeconds)}
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

/** A session = one run's worth of events (its transcript). Loose events with no
 *  dispatch each stand alone as a single-entry session. */
interface RunSession {
  key: string;
  dispatchId: string | null;
  personaId: string | null;
  runtimeId: string | null;
  /** The CLI session id reported by a run, if any — used to load the transcript. */
  sessionId: string | null;
  events: AgentEvent[];
  lastAt: string;
}

function groupSessions(events: AgentEvent[]): RunSession[] {
  const byDispatch = new Map<string, AgentEvent[]>();
  for (const e of events) {
    const key = e.dispatchId ?? `event:${e.id}`;
    const list = byDispatch.get(key);
    if (list) list.push(e);
    else byDispatch.set(key, [e]);
  }
  const sessions: RunSession[] = [];
  for (const [key, evs] of byDispatch) {
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
  sessions.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return sessions;
}

function ActivityTab() {
  const store = useStore();
  const personaNames = Object.fromEntries(store.personas.map((p) => [p.id, p.name]));
  const runtimeNames = Object.fromEntries(store.runtimes.map((r) => [r.id, r.name]));
  const sessions = groupSessions(store.events);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="section mb-0">Sessions ({sessions.length})</h2>
      <p className="muted text-[11px]">Every run, newest first. A session groups the events from one run into a transcript; expand to read it.</p>

      {sessions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <SessionCard
              key={s.key}
              session={s}
              personaName={s.personaId ? personaNames[s.personaId] ?? 'Unknown persona' : null}
              runtimeName={s.runtimeId ? runtimeNames[s.runtimeId] ?? 'Unknown runtime' : null}
            />
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">No activity recorded yet.</p>
      )}
    </div>
  );
}

/** A one-line + body summary of an event payload — surfaces exit code, timing,
 *  and the captured stderr/stdout so a failed run explains itself. */
function eventDetail(payload: Record<string, unknown>): string | null {
  const meta: string[] = [];
  if (typeof payload.exitCode === 'number') meta.push(`exit ${payload.exitCode}`);
  if (typeof payload.durationMs === 'number') meta.push(`${payload.durationMs}ms`);

  const body =
    typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : typeof payload.output === 'string' && payload.output.trim()
        ? payload.output.trim()
        : typeof payload.prompt === 'string' && payload.prompt.trim()
          ? payload.prompt.trim()
          : '';

  const head = meta.join(' · ');
  if (!head && !body) return null;
  return [head, body].filter(Boolean).join('\n');
}

type TranscriptState = 'unloaded' | 'loading' | 'loaded' | 'missing' | 'error';

function SessionCard({ session, personaName, runtimeName }: { session: RunSession; personaName: string | null; runtimeName: string | null }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [tState, setTState] = useState<TranscriptState>('unloaded');
  const live = useLiveRun(session.dispatchId);
  const title = session.dispatchId ? `Run ${session.dispatchId.slice(0, 8)}` : session.events[0].type;
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
          {live ? (
            <LiveConversation run={live} />
          ) : hasTranscript ? (
            tState === 'loading' ? (
              <div className="muted text-[11px]">Reading transcript…</div>
            ) : tState === 'missing' ? (
              <div className="muted text-[11px]">No local transcript found for this session.</div>
            ) : tState === 'error' ? (
              <div className="text-[11px] text-red-400">Could not read the transcript file.</div>
            ) : turns.length > 0 ? (
              <Conversation committed={turns} />
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
                      <pre
                        className={`overflow-x-auto whitespace-pre-wrap break-words rounded bg-zinc-900/70 px-2 py-1 text-[10px] leading-relaxed ${failed ? 'text-red-300' : 'text-zinc-400'}`}
                      >
                        {detail}
                      </pre>
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

function TurnRow({ turn, streaming }: { turn: TranscriptTurn; streaming?: boolean }) {
  const meta = TURN_META[turn.role];
  const mono = turn.role === 'tool' || turn.role === 'result';
  return (
    <li className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-wide">
        <span className={meta.cls}>{meta.label}</span>
        {turn.tool && turn.role === 'tool' ? <span className="muted"> · {turn.tool}</span> : null}
      </div>
      <div className={`whitespace-pre-wrap break-words text-[11px] leading-relaxed ${mono ? 'font-mono text-zinc-400' : 'text-zinc-200'}`}>
        {turn.text}
        {streaming ? <span className="caret" /> : null}
      </div>
    </li>
  );
}

/**
 * Renders one conversation — live (token-by-token, with a typing caret) or historical.
 * Auto-scrolls to the newest content while a run is in flight. For raw runtimes the growing
 * stdout/stderr text is shown verbatim.
 */
function Conversation({
  committed,
  streamingText,
  raw,
  running,
}: {
  committed: TranscriptTurn[];
  streamingText?: string;
  raw?: string;
  running?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (running && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  });
  const empty = committed.length === 0 && !streamingText && !raw;

  return (
    <div ref={ref} className="max-h-96 overflow-auto rounded-md border border-zinc-800 bg-zinc-900/40 p-2">
      {committed.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {committed.map((t, i) => (
            <TurnRow key={i} turn={t} />
          ))}
        </ol>
      ) : null}
      {streamingText ? (
        <ol className="mt-2 flex flex-col gap-2">
          <TurnRow turn={{ role: 'assistant', text: streamingText }} streaming={running} />
        </ol>
      ) : null}
      {raw ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-zinc-400">{raw}</pre> : null}
      {empty ? <div className="muted text-[11px]">{running ? 'Starting…' : 'No output.'}</div> : null}
    </div>
  );
}

/** Bridges a `LiveRun` (or its absence) into <Conversation>. */
function LiveConversation({ run }: { run: LiveRun }) {
  return <Conversation committed={run.committed} streamingText={run.streamingText} raw={run.raw} running={run.status === 'running'} />;
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

export function Style() {
  return (
    <style>{`
      .inp { background:#18181b; border:1px solid #3f3f46; border-radius:6px; padding:8px 10px; color:#e6e8ee; outline:none; }
      .inp:focus { border-color:#3b82f6; }
      .btn { background:#2563eb; color:#fff; border-radius:6px; padding:8px 14px; font-size:13px; }
      .btn:hover { background:#1d4ed8; } .btn:disabled { opacity:.5; }
      .btn-ghost { color:#a1a1aa; border-radius:6px; padding:6px 12px; font-size:13px; } .btn-ghost:hover { color:#e4e4e7; }
      .muted { color:#71717a; }
      .section { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#71717a; margin-bottom:8px; }
      .tab { padding:8px 12px; font-size:13px; color:#a1a1aa; border-bottom:2px solid transparent; margin-bottom:-1px; }
      .tab:hover { color:#e4e4e7; }
      .tab-active { color:#e6e8ee; border-bottom-color:#3b82f6; }
      .caret { display:inline-block; width:6px; height:12px; margin-left:2px; vertical-align:text-bottom; background:#3b82f6; animation:blink 1s step-start infinite; }
      @keyframes blink { 50% { opacity:0; } }
    `}</style>
  );
}
