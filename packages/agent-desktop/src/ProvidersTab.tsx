// Provider API-key management for the built-in (Starship) runtime.
//
// Rendered inside the Starship runtime section (see RuntimeTab). Secrets live in the OS
// keychain (Rust); this UI only ever sends a freshly typed key to `setSecret` and reads back
// presence + a masked hint via `secretStatus`. Validation goes through the local runtime
// sidecar (it holds the keys in its env), so the webview never handles a saved secret.
// Validation state is persisted (per provider) in store.json.
import { useEffect, useState } from 'react';
import { clearProviderMeta, getProviderMeta, setProviderStatus, useStore, type ProviderId } from './store';
import { deleteSecret, isTauri, runtimeBaseUrl, secretStatus, setSecret, type SecretStatus } from './tauri';

const PROVIDERS: { id: ProviderId; label: string; placeholder: string }[] = [
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-…' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-…' },
];

/** The list of provider key rows. Embeddable (no page chrome of its own). */
export function ProviderKeys() {
  const store = useStore();
  const [statuses, setStatuses] = useState<Record<string, SecretStatus>>({});

  const refresh = () => {
    if (!isTauri()) return;
    secretStatus()
      .then((rows) => setStatuses(Object.fromEntries(rows.map((r) => [r.provider, r]))))
      .catch(() => {});
  };
  useEffect(refresh, []);

  return (
    <div className="flex flex-col gap-2">
      <RuntimeStatus />
      <p className="muted text-[11px]">
        Bring your own API keys. They’re stored in your OS keychain and never leave this machine. A persona’s model
        decides which provider runs (e.g. <span className="text-(--color-text)">claude-opus-4-8</span> → Anthropic,{' '}
        <span className="text-(--color-text)">gpt-4o</span> → OpenAI).
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <ProviderRow
            key={`${p.id}-${store.providers.length}`}
            provider={p.id}
            label={p.label}
            placeholder={p.placeholder}
            status={statuses[p.id]}
            onChanged={refresh}
          />
        ))}
      </ul>
      {!isTauri() ? <p className="muted text-[11px]">Saving keys works in the desktop app.</p> : null}
    </div>
  );
}

/**
 * Surfaces whether the in-house runtime sidecar is reachable, and the exact error if not.
 * This is the single source of truth for "why can't I save/validate a key": browser (no
 * desktop shell), stale Rust build, or a sidecar that failed to spawn.
 */
function RuntimeStatus() {
  const [state, setState] = useState<{ kind: 'checking' | 'ok' | 'error' | 'browser'; detail: string }>({
    kind: 'checking',
    detail: '',
  });

  const check = () => {
    if (!isTauri()) {
      setState({ kind: 'browser', detail: '' });
      return;
    }
    setState({ kind: 'checking', detail: '' });
    runtimeBaseUrl()
      .then((base) => setState({ kind: 'ok', detail: base }))
      .catch((e) => setState({ kind: 'error', detail: e instanceof Error ? e.message : String(e) }));
  };
  useEffect(check, []);

  if (state.kind === 'browser') {
    return (
      <div className="rounded-md border border-(--color-border) px-3 py-2 text-[11px]">
        <span className="muted">Provider keys are managed in the desktop app (this is the browser preview).</span>
      </div>
    );
  }
  if (state.kind === 'checking') {
    return <div className="muted rounded-md border border-(--color-border) px-3 py-2 text-[11px]">Checking runtime…</div>;
  }
  if (state.kind === 'ok') {
    return (
      <div className="rounded-md border border-(--color-border) px-3 py-2 text-[11px] text-green-400">
        Runtime ready <span className="muted">· {state.detail}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-[11px]">
      <div className="min-w-0">
        <div className="text-red-400">Runtime unavailable</div>
        <div className="muted mt-0.5 break-words whitespace-pre-wrap">{state.detail || '(no detail)'}</div>
      </div>
      <button className="btn-ghost shrink-0" onClick={check}>
        Retry
      </button>
    </div>
  );
}

function ProviderRow({
  provider,
  label,
  placeholder,
  status,
  onChanged,
}: {
  provider: ProviderId;
  label: string;
  placeholder: string;
  status?: SecretStatus;
  onChanged: () => void;
}) {
  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'test' | 'remove'>(null);
  const [note, setNote] = useState<string | null>(null);
  const meta = getProviderMeta(provider);
  const present = status?.present ?? false;

  // Validate a key passed in the request body (no dependency on the sidecar env / restart).
  // Throws with the runtime's error message if the sidecar can't be reached.
  async function validateKeyValue(apiKey: string): Promise<'valid' | 'invalid'> {
    const base = await runtimeBaseUrl();
    const res = await fetch(`${base}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, apiKey }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    return json.ok ? 'valid' : 'invalid';
  }

  // Re-test the key already stored in the keychain (sidecar reads it from its env).
  async function validateStored(): Promise<'valid' | 'invalid'> {
    const base = await runtimeBaseUrl();
    const res = await fetch(`${base}/validate-stored?provider=${provider}`);
    const json = (await res.json()) as { ok: boolean; error?: string };
    return json.ok ? 'valid' : 'invalid';
  }

  async function save(): Promise<void> {
    if (!value.trim() || !isTauri()) return;
    setBusy('save');
    setNote(null);
    const key = value.trim();
    try {
      await setSecret(provider, key); // store in keychain + restart the sidecar
      setValue('');
      setReveal(false);
      onChanged();
    } catch (e) {
      setNote(`Save failed: ${(e as Error).message}`);
      setBusy(null);
      return;
    }
    // Verify using the key value directly, so the result doesn't depend on the restart.
    try {
      setProviderStatus(provider, await validateKeyValue(key), new Date().toISOString());
    } catch (e) {
      setProviderStatus(provider, 'untested', new Date().toISOString());
      setNote(`Saved, but couldn’t verify: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function test(): Promise<void> {
    setBusy('test');
    setNote(null);
    try {
      setProviderStatus(provider, await validateStored(), new Date().toISOString());
    } catch (e) {
      setProviderStatus(provider, 'untested', new Date().toISOString());
      setNote(`Couldn’t verify: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(): Promise<void> {
    if (!isTauri()) return;
    setBusy('remove');
    try {
      await deleteSecret(provider);
      clearProviderMeta(provider);
      onChanged();
    } catch (e) {
      console.error('[providers] remove failed:', e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-md border border-(--color-border) p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm">
            {label}
            {present ? (
              <span className="muted text-[11px]"> · key {status?.hint}</span>
            ) : (
              <span className="muted text-[11px]"> · no key</span>
            )}
          </div>
          <StatusPill present={present} status={meta?.status} lastValidatedAt={meta?.lastValidatedAt} />
        </div>
        {present ? (
          <div className="flex shrink-0 gap-1">
            <button className="btn-ghost" disabled={busy !== null} onClick={test}>
              {busy === 'test' ? 'Testing…' : 'Test'}
            </button>
            <button className="btn-ghost text-red-400" disabled={busy !== null} onClick={remove}>
              {busy === 'remove' ? 'Removing…' : 'Remove'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex gap-1">
        <input
          className="inp font-mono text-xs"
          type={reveal ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          placeholder={present ? 'Replace key…' : placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <button className="btn-ghost shrink-0" onClick={() => setReveal((r) => !r)} title={reveal ? 'Hide' : 'Show'}>
          {reveal ? 'Hide' : 'Show'}
        </button>
        <button className="btn shrink-0" disabled={busy !== null || !value.trim()} onClick={save}>
          {busy === 'save' ? 'Saving…' : present ? 'Replace' : 'Save'}
        </button>
      </div>
      {note ? <p className="muted mt-1 text-[11px]">{note}</p> : null}
    </li>
  );
}

function StatusPill({ present, status, lastValidatedAt }: { present: boolean; status?: string; lastValidatedAt?: string }) {
  if (!present) return <div className="muted text-[11px]">Not configured</div>;
  const label = status === 'valid' ? 'Valid' : status === 'invalid' ? 'Invalid' : 'Untested';
  const color = status === 'valid' ? 'text-green-400' : status === 'invalid' ? 'text-red-400' : 'muted';
  const when = lastValidatedAt ? ` · checked ${new Date(lastValidatedAt).toLocaleString()}` : '';
  return (
    <div className={`text-[11px] ${color}`}>
      {label}
      <span className="muted">{when}</span>
    </div>
  );
}
