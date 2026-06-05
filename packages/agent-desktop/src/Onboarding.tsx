// First-run wizard. Walks a brand-new user through the setup chain the dashboard
// otherwise leaves implicit: connect a runtime (a local agent CLI) → create a
// persona (an actor) → run it once to prove it works. Completing or skipping sets
// `onboardedAt` in the store so this never shows again. No server, no login: every
// step reuses the same local mutations the dashboard does.
import { useEffect, useState } from 'react';
import { Style, kindLabel } from './App';
import { addPersona, addRuntime, completeOnboarding, eventsForPersona, useStore, type RuntimeKind } from './store';
import { runPersona } from './engine';
import { detectAgents, hostname, isTauri, type DetectedAgent } from './tauri';

type Step = 'welcome' | 'runtime' | 'persona' | 'test' | 'done';
const STEPS: Step[] = ['welcome', 'runtime', 'persona', 'test', 'done'];
const SAMPLE_PROMPT = 'Say hello and tell me, in one sentence, what you can help with.';
const RUNTIME_KINDS: RuntimeKind[] = ['claude-code', 'codex', 'hermes', 'openclaw', 'custom'];

export function Onboarding() {
  const [step, setStep] = useState<Step>('welcome');
  // The runtime/persona created during onboarding, threaded forward so each step
  // pre-fills from the last (persona assigns to this runtime; test runs this persona).
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);

  const idx = STEPS.indexOf(step);
  const go = (s: Step) => setStep(s);

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Welcome to Starship Agent</h1>
          <div className="muted text-xs">Step {idx + 1} of {STEPS.length}</div>
        </div>
        <button className="btn-ghost text-xs" onClick={completeOnboarding}>
          Skip setup
        </button>
      </header>

      <div className="rounded-md border border-zinc-800 p-4">
        {step === 'welcome' ? (
          <WelcomeStep onNext={() => go('runtime')} />
        ) : step === 'runtime' ? (
          <RuntimeStep onConnected={setRuntimeId} onBack={() => go('welcome')} onNext={() => go('persona')} />
        ) : step === 'persona' ? (
          <PersonaStep
            runtimeId={runtimeId}
            createdId={personaId}
            onCreated={setPersonaId}
            onBack={() => go('runtime')}
            onNext={() => go('test')}
          />
        ) : step === 'test' ? (
          <TestStep personaId={personaId} onBack={() => go('persona')} onNext={() => go('done')} />
        ) : (
          <DoneStep onFinish={completeOnboarding} />
        )}
      </div>

      <Style />
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-medium">A local orchestrator for your agent CLIs</h2>
      <p className="muted text-sm">
        Starship Agent drives the coding agents already installed on this machine — Claude Code, Codex, and others. It runs
        them locally, on a schedule if you want, and keeps a log of every run.
      </p>
      <ul className="muted flex flex-col gap-1 text-sm">
        <li>· No login and no cloud. Everything stays in a local file on this machine.</li>
        <li>· Sign-in happens inside each CLI, not here.</li>
      </ul>
      <p className="text-sm">Let&apos;s connect a runtime, create a persona, and run it once. Takes about a minute.</p>
      <button className="btn self-start" onClick={onNext}>
        Get started
      </button>
    </div>
  );
}

function RuntimeStep({ onConnected, onBack, onNext }: { onConnected: (id: string) => void; onBack: () => void; onNext: () => void }) {
  const store = useStore();
  const [detected, setDetected] = useState<DetectedAgent[] | null>(null);
  const [execEdits, setExecEdits] = useState<Record<string, string>>({});
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      setDetected([]);
      return;
    }
    detectAgents()
      .then(setDetected)
      .catch(() => setDetected([]));
  }, []);

  async function connect(d: DetectedAgent, executor: string) {
    const host = await hostname();
    const rt = addRuntime({ name: `${kindLabel(d.kind)} · ${host}`, kind: d.kind as RuntimeKind, executor });
    onConnected(rt.id);
  }

  const hasRuntime = store.runtimes.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Connect a runtime</h2>
        <p className="muted text-sm">A runtime is an agent CLI on this machine and the command used to drive it.</p>
      </div>

      <section>
        <h3 className="section">Detected on this machine</h3>
        {!isTauri() ? (
          <p className="muted text-sm">Runtime detection runs in the desktop app. Add one manually below to continue.</p>
        ) : detected === null ? (
          <p className="muted text-sm">Scanning your PATH…</p>
        ) : detected.length === 0 ? (
          <p className="muted text-sm">No known agent CLIs found on your PATH. Install one, or add it manually below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detected.map((d) => {
              const exec = execEdits[d.command] ?? d.default_executor;
              const already = store.runtimes.some((r) => r.executor === exec);
              return (
                <li key={d.command} className="rounded-md border border-zinc-800 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm">
                        {kindLabel(d.kind)} <span className="muted">· {d.command}</span>
                      </div>
                      <div className="muted truncate text-[11px]">{d.version || d.path}</div>
                    </div>
                    <button className="btn" onClick={() => connect(d, exec)} disabled={already}>
                      {already ? 'Connected' : 'Connect'}
                    </button>
                  </div>
                  <input
                    className="inp mt-2 w-full font-mono text-xs"
                    value={exec}
                    onChange={(e) => setExecEdits((p) => ({ ...p, [d.command]: e.target.value }))}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {manual ? (
        <ManualRuntimeForm onAdd={(id) => { onConnected(id); setManual(false); }} />
      ) : (
        <button className="btn-ghost self-start text-xs" onClick={() => setManual(true)}>
          + Add manually
        </button>
      )}

      <p className="muted text-[11px]">
        Detection only finds the binary — it can&apos;t tell if you&apos;re signed in. If a run fails later, run the CLI once
        in a terminal (e.g. <span className="font-mono">claude</span>) to authenticate.
      </p>

      {hasRuntime ? (
        <p className="text-xs text-green-400">
          {store.runtimes.length} runtime{store.runtimes.length > 1 ? 's' : ''} connected.
        </p>
      ) : null}

      <Nav onBack={onBack} onNext={onNext} nextDisabled={!hasRuntime} nextLabel="Next" />
    </div>
  );
}

function ManualRuntimeForm({ onAdd }: { onAdd: (id: string) => void }) {
  const [kind, setKind] = useState<RuntimeKind>('claude-code');
  const [executor, setExecutor] = useState('claude --session-id {{sessionId}} -p {{prompt}}');

  async function add() {
    if (!executor.trim()) return;
    const host = await hostname();
    const rt = addRuntime({ name: `${kindLabel(kind)} · ${host}`, kind, executor: executor.trim() });
    onAdd(rt.id);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-800 p-2">
      <select className="inp text-xs" value={kind} onChange={(e) => setKind(e.target.value as RuntimeKind)}>
        {RUNTIME_KINDS.map((k) => (
          <option key={k} value={k}>
            {kindLabel(k)}
          </option>
        ))}
      </select>
      <input
        className="inp font-mono text-xs"
        placeholder="Command template, e.g. claude --session-id {{sessionId}} -p {{prompt}}"
        value={executor}
        onChange={(e) => setExecutor(e.target.value)}
      />
      <button className="btn self-start text-xs" onClick={add} disabled={!executor.trim()}>
        Add runtime
      </button>
    </div>
  );
}

function PersonaStep({
  runtimeId,
  createdId,
  onCreated,
  onBack,
  onNext,
}: {
  runtimeId: string | null;
  createdId: string | null;
  onCreated: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const store = useStore();
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  // Fall back to the first connected runtime if onboarding didn't track one.
  const assignTo = runtimeId ?? store.runtimes[0]?.id ?? null;
  const created = createdId ? store.personas.find((p) => p.id === createdId) : undefined;

  function create() {
    if (!name.trim()) return;
    const p = addPersona({
      name: name.trim(),
      model: model.trim() || undefined,
      systemPrompt: systemPrompt.trim() || undefined,
      runtimeId: assignTo,
    });
    onCreated(p.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Create your first persona</h2>
        <p className="muted text-sm">A persona is an actor — a name, model, and system prompt — that runs on a runtime.</p>
      </div>

      {created ? (
        <div className="rounded-md border border-zinc-800 p-3 text-sm">
          <div className="text-green-400">Created “{created.name}”.</div>
          <div className="muted text-[11px]">
            {created.model ? `${created.model} · ` : ''}assigned to its runtime. You can edit it later in the Personas tab.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-zinc-800 p-2">
          <input className="inp text-xs" placeholder="Persona name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input
            className="inp text-xs"
            placeholder="Model (optional, e.g. claude-opus-4-8)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <textarea
            className="inp font-mono text-xs"
            rows={3}
            placeholder="System prompt (optional) — injected into the runtime at execution time"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
          <button className="btn self-start text-xs" onClick={create} disabled={!name.trim()}>
            Create persona
          </button>
        </div>
      )}

      <Nav onBack={onBack} onNext={onNext} nextDisabled={!created} nextLabel="Next" />
    </div>
  );
}

function TestStep({ personaId, onBack, onNext }: { personaId: string | null; onBack: () => void; onNext: () => void }) {
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; summary: string; snippet: string } | null>(null);

  async function run() {
    if (!personaId || !prompt.trim()) return;
    setRunning(true);
    setOutcome(null);
    try {
      const r = await runPersona(personaId, prompt.trim());
      // Pull the latest recorded output/error so the user sees real text, not just a code.
      const results = eventsForPersona(personaId).filter((e) => e.type === 'command_output' || e.type === 'command_failed');
      const last = results[results.length - 1];
      const text = String((last?.payload.output ?? last?.payload.error ?? '') || '').trim();
      setOutcome({
        ok: r.ok,
        summary: r.ok ? `Done in ${r.durationMs}ms` : `Failed${r.exitCode != null ? ` (exit ${r.exitCode})` : ''}`,
        snippet: text.slice(0, 600),
      });
    } catch (e) {
      setOutcome({ ok: false, summary: (e as Error).message, snippet: '' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Try a run</h2>
        <p className="muted text-sm">Run your persona once to confirm everything is wired up. You can skip this.</p>
      </div>

      <textarea
        className="inp font-mono text-xs"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={running}
      />
      <button className="btn self-start text-xs" onClick={run} disabled={running || !prompt.trim() || !personaId}>
        {running ? 'Running…' : 'Run now'}
      </button>

      {outcome ? (
        <div className="rounded-md border border-zinc-800 p-3 text-xs">
          <div className={outcome.ok ? 'text-green-400' : 'text-red-400'}>{outcome.summary}</div>
          {outcome.snippet ? <pre className="muted mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono">{outcome.snippet}</pre> : null}
          {!outcome.ok ? (
            <div className="muted mt-2">A failed run is often just an unauthenticated CLI. You can still finish setup.</div>
          ) : null}
        </div>
      ) : null}

      <Nav onBack={onBack} onNext={onNext} nextDisabled={false} nextLabel={outcome?.ok ? 'Next' : 'Skip this'} />
    </div>
  );
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-medium text-green-400">You&apos;re set up</h2>
      <p className="muted text-sm">Your runtime and persona are ready. From the dashboard you can:</p>
      <ul className="muted flex flex-col gap-1 text-sm">
        <li>· <span className="text-zinc-300">Personas</span> — run a persona on demand or tweak its prompt.</li>
        <li>· <span className="text-zinc-300">Heartbeats</span> — schedule a persona to run on a recurring interval.</li>
        <li>· <span className="text-zinc-300">Activity</span> — review every run and its transcript.</li>
      </ul>
      <button className="btn self-start" onClick={onFinish}>
        Open dashboard
      </button>
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextDisabled,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  nextLabel: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
      <button className="btn-ghost text-xs" onClick={onBack}>
        Back
      </button>
      <button className="btn text-xs" onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </button>
    </div>
  );
}
