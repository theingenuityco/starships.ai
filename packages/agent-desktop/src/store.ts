// Local, single-user config + activity state for the desktop app. No server, no
// auth: this app is the source of truth.
//
// Persistence is split by access pattern (see src-tauri lib.rs):
//   - Config (runtimes/personas/heartbeats/onboarding) is a small JSON blob in
//     `store.json`, fully rewritten on each change (read_store/write_store).
//   - The activity log is append-only JSONL in `events.jsonl` (append_event).
//   - Conversations live one-file-per-thread; see ./conversations.
import { useSyncExternalStore } from 'react';
import {
  appendEvent,
  deletePersonaRaw,
  deleteRuntimeRaw,
  isTauri,
  listPersonasRaw,
  listRuntimesRaw,
  readEventsRaw,
  readStoreRaw,
  writePersonaRaw,
  writeRuntimeRaw,
  writeStoreRaw,
} from './tauri';
import { deleteConversationsForPersona } from './conversations';
import { DEFAULT_PERMISSIONS, type PermissionPolicy } from './permissions';

export type { PermissionPolicy } from './permissions';
export { DEFAULT_PERMISSIONS };

export type RuntimeKind = 'claude-code' | 'codex' | 'hermes' | 'custom' | 'starship';

/** Providers the in-house runtime supports (BYO key). */
export type ProviderId = 'anthropic' | 'openai';

/**
 * Current chat models offered in the persona model picker, grouped by provider.
 * The starship runtime infers the provider from the model id (see starshipClient.resolveProvider),
 * so each id must keep its provider-identifying prefix (`claude-*` → Anthropic, `gpt-*` → OpenAI).
 */
export const MODEL_OPTIONS: { provider: ProviderId; label: string; models: { id: string; label: string }[] }[] = [
  {
    provider: 'anthropic',
    label: 'Anthropic',
    models: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
  },
  {
    provider: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-5.5', label: 'GPT-5.5' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
    ],
  },
];

/**
 * Non-secret metadata for a provider key. The secret lives in the OS keychain (Rust);
 * here we only track validation state for the Settings UI. Presence + masked hint come
 * from `secretStatus()`, not this.
 */
export interface ProviderMeta {
  provider: ProviderId;
  status: 'untested' | 'valid' | 'invalid';
  lastValidatedAt?: string;
}

/** A local agent CLI we know how to drive. `executor` is the command template. */
export interface Runtime {
  id: string;
  name: string;
  kind: RuntimeKind;
  /** Command template, e.g. `claude --session-id {{sessionId}} -p {{prompt}}`. */
  executor: string;
  createdAt: string;
}

/** A user-authored actor (behaviour) that runs on a runtime. */
export interface Persona {
  id: string;
  name: string;
  model?: string;
  systemPrompt?: string;
  instructions?: string;
  runtimeId?: string | null;
  /** Tool-permission policy compiled into the runtime's approval flags at run time. */
  permissions?: PermissionPolicy;
  createdAt: string;
}

/** A recurring run: fires `prompt` at the assigned persona every interval. */
export interface Heartbeat {
  id: string;
  personaId: string;
  name?: string;
  prompt: string;
  intervalSeconds: number;
  enabled: boolean;
  lastFiredAt?: string | null;
  nextFireAt: string;
  createdAt: string;
}

/** Append-only activity record, grouped into sessions by `dispatchId`. */
export interface AgentEvent {
  id: string;
  dispatchId?: string | null;
  personaId?: string | null;
  runtimeId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** In-memory app state, assembled from several stores: `personas`/`runtimes` are
 *  one-file-per-record under `config/`, `events` is `events.jsonl`, and the rest is the
 *  small `store.json` blob. Conversations are not held here (see ./conversations). */
export interface StoreData {
  runtimes: Runtime[];
  personas: Persona[];
  heartbeats: Heartbeat[];
  events: AgentEvent[];
  /** Provider-key validation metadata (the secrets live encrypted in config/, not here). */
  providers: ProviderMeta[];
  /** Set once the first-run onboarding wizard is completed (or skipped). Absent = show it. */
  onboardedAt?: string;
  /** Last persona chosen on the New page, so the picker is sticky across sessions/restarts. */
  lastPersonaId?: string;
  /** Last working folder chosen on the New page, sticky across sessions/restarts. */
  lastCwd?: string;
}

/** The subset persisted to the `store.json` blob. Personas + runtimes are stored per-record
 *  under config/ (see persistPersona/persistRuntime); events append to their own log. */
type ConfigData = Pick<StoreData, 'heartbeats' | 'providers' | 'onboardedAt' | 'lastPersonaId' | 'lastCwd'>;

/** Bump when `store.json` / event-line shapes change incompatibly. Persisted for
 *  forward-looking migrations; we don't migrate anything yet. */
const SCHEMA_VERSION = 1;

const EMPTY: StoreData = { runtimes: [], personas: [], heartbeats: [], events: [], providers: [] };

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

let data: StoreData = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function coerceConfig(raw: unknown): ConfigData {
  const d = (raw ?? {}) as Partial<ConfigData>;
  return {
    heartbeats: Array.isArray(d.heartbeats) ? d.heartbeats : [],
    providers: Array.isArray(d.providers) ? d.providers : [],
    onboardedAt: typeof d.onboardedAt === 'string' ? d.onboardedAt : undefined,
    lastPersonaId: typeof d.lastPersonaId === 'string' ? d.lastPersonaId : undefined,
    lastCwd: typeof d.lastCwd === 'string' ? d.lastCwd : undefined,
  };
}

/** Parse one-file-per-record JSON strings into typed records; skip unparseable / id-less ones. */
function parseRecords<T extends { id: string }>(raw: string[]): T[] {
  const out: T[] = [];
  for (const line of raw) {
    try {
      const v = JSON.parse(line) as T;
      if (v && typeof v.id === 'string') out.push(v);
    } catch {
      // skip
    }
  }
  return out;
}

/** Parse the append-only event log; skip unparseable / forward-compat lines. */
function parseEvents(raw: string): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t) as AgentEvent;
      if (e && typeof e.id === 'string' && typeof e.type === 'string') out.push(e);
    } catch {
      // skip
    }
  }
  return out;
}

/** Load persisted config + events into memory. No-op shape outside Tauri (vite dev). */
export async function initStore(): Promise<void> {
  if (!isTauri()) {
    data = EMPTY;
    return;
  }
  let config: ConfigData = coerceConfig({});
  let events: AgentEvent[] = [];
  let personas: Persona[] = [];
  let runtimes: Runtime[] = [];
  try {
    config = coerceConfig(JSON.parse(await readStoreRaw()));
  } catch {
    // keep defaults
  }
  try {
    events = parseEvents(await readEventsRaw());
  } catch {
    // keep defaults
  }
  try {
    personas = parseRecords<Persona>(await listPersonasRaw());
  } catch {
    // keep defaults
  }
  try {
    runtimes = parseRecords<Runtime>(await listRuntimesRaw());
  } catch {
    // keep defaults
  }
  data = { ...config, personas, runtimes, events };
  emit();
}

/** Persist the small `store.json` blob (heartbeats/providers/onboarding). Personas, runtimes,
 *  and events each persist independently (per-record files / append-only log). */
function persistConfig(): void {
  if (!isTauri()) return;
  const config = {
    schemaVersion: SCHEMA_VERSION,
    heartbeats: data.heartbeats,
    providers: data.providers,
    onboardedAt: data.onboardedAt,
    lastPersonaId: data.lastPersonaId,
    lastCwd: data.lastCwd,
  };
  writeStoreRaw(JSON.stringify(config)).catch((err) => console.error('[store] write failed:', err));
}

/** Update in-memory state + notify, without touching disk. Disk writes are the caller's job
 *  (persistConfig for the blob, the persist/remove record helpers for per-record files). */
function setData(next: StoreData): void {
  data = next;
  emit();
}

/** blob mutators (heartbeats/providers/onboarding) keep the read-modify-write-blob shape. */
function commit(next: StoreData): void {
  setData(next);
  persistConfig();
}

// Per-record persistence for the config/ folder (personas + runtimes).
function persistPersona(p: Persona): void {
  if (isTauri()) writePersonaRaw(p.id, JSON.stringify(p)).catch((err) => console.error('[store] persona write failed:', err));
}
function removePersonaFile(id: string): void {
  if (isTauri()) deletePersonaRaw(id).catch((err) => console.error('[store] persona delete failed:', err));
}
function persistRuntime(r: Runtime): void {
  if (isTauri()) writeRuntimeRaw(r.id, JSON.stringify(r)).catch((err) => console.error('[store] runtime write failed:', err));
}
function removeRuntimeFile(id: string): void {
  if (isTauri()) deleteRuntimeRaw(id).catch((err) => console.error('[store] runtime delete failed:', err));
}

// ---- React binding ----
export const getStore = (): StoreData => data;
export const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useStore = (): StoreData => useSyncExternalStore(subscribe, getStore, getStore);

// ---- Runtimes ----
export function addRuntime(input: { name: string; kind: RuntimeKind; executor: string }): Runtime {
  const rt: Runtime = { id: uid(), createdAt: now(), ...input };
  setData({ ...data, runtimes: [...data.runtimes, rt] });
  persistRuntime(rt);
  return rt;
}
export function removeRuntime(id: string): void {
  // Unassign personas that pointed at this runtime; each changed persona is its own file.
  const reassigned = data.personas.filter((p) => p.runtimeId === id).map((p): Persona => ({ ...p, runtimeId: null }));
  setData({
    ...data,
    runtimes: data.runtimes.filter((r) => r.id !== id),
    personas: data.personas.map((p) => (p.runtimeId === id ? { ...p, runtimeId: null } : p)),
  });
  removeRuntimeFile(id);
  reassigned.forEach(persistPersona);
}

// ---- Personas ----
export function addPersona(input: {
  name: string;
  model?: string;
  systemPrompt?: string;
  instructions?: string;
  runtimeId?: string | null;
  permissions?: PermissionPolicy;
}): Persona {
  const p: Persona = { id: uid(), createdAt: now(), ...input };
  setData({ ...data, personas: [...data.personas, p] });
  persistPersona(p);
  return p;
}
export function updatePersona(id: string, patch: Partial<Omit<Persona, 'id' | 'createdAt'>>): void {
  let updated: Persona | undefined;
  setData({
    ...data,
    personas: data.personas.map((p) => {
      if (p.id !== id) return p;
      updated = { ...p, ...patch };
      return updated;
    }),
  });
  if (updated) persistPersona(updated);
}
/**
 * Add tool patterns to a persona's allowlist, switching it into 'allowlist' mode if it
 * was on its default. Used by the "Allow + rerun" affordance after a run denied a tool,
 * and by "Allow always" in the live approval dialog. Idempotent (de-dupes).
 */
export function addAllowedTools(id: string, tools: string[]): void {
  const clean = tools.map((t) => t.trim()).filter(Boolean);
  if (!clean.length) return;
  let updated: Persona | undefined;
  setData({
    ...data,
    personas: data.personas.map((p) => {
      if (p.id !== id) return p;
      const cur = p.permissions ?? DEFAULT_PERMISSIONS;
      const allow = [...new Set([...cur.allow, ...clean])];
      updated = { ...p, permissions: { mode: 'allowlist', allow } };
      return updated;
    }),
  });
  if (updated) persistPersona(updated);
}

export function deletePersona(id: string): void {
  setData({
    ...data,
    personas: data.personas.filter((p) => p.id !== id),
    heartbeats: data.heartbeats.filter((h) => h.personaId !== id),
  });
  removePersonaFile(id);
  persistConfig(); // heartbeats live in the blob and changed above
  // Conversations are stored separately (one file per thread) — cascade the delete.
  deleteConversationsForPersona(id);
}

// ---- Heartbeats ----
export function addHeartbeat(input: { personaId: string; name?: string; prompt: string; intervalSeconds: number }): Heartbeat {
  const h: Heartbeat = {
    id: uid(),
    createdAt: now(),
    enabled: true,
    lastFiredAt: null,
    nextFireAt: new Date(Date.now() + input.intervalSeconds * 1000).toISOString(),
    ...input,
  };
  commit({ ...data, heartbeats: [...data.heartbeats, h] });
  return h;
}
export function updateHeartbeat(id: string, patch: Partial<Omit<Heartbeat, 'id' | 'createdAt'>>): void {
  commit({ ...data, heartbeats: data.heartbeats.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
}
export function deleteHeartbeat(id: string): void {
  commit({ ...data, heartbeats: data.heartbeats.filter((h) => h.id !== id) });
}

// ---- Events ----
/** Record one activity event: append it to memory + `events.jsonl` (no rewrite). */
export function addEvent(input: Omit<AgentEvent, 'id' | 'createdAt'>): AgentEvent {
  const e: AgentEvent = { id: uid(), createdAt: now(), ...input };
  data = { ...data, events: [...data.events, e] };
  emit();
  if (isTauri()) appendEvent(JSON.stringify(e)).catch((err) => console.error('[store] event write failed:', err));
  return e;
}
export const eventsForPersona = (personaId: string): AgentEvent[] => data.events.filter((e) => e.personaId === personaId);

// ---- Providers (BYO key metadata; secrets live in the OS keychain) ----
export const getProviderMeta = (provider: ProviderId): ProviderMeta | undefined =>
  data.providers.find((p) => p.provider === provider);

/** Record a provider key's validation result (upsert by provider). */
export function setProviderStatus(provider: ProviderId, status: ProviderMeta['status'], lastValidatedAt?: string): void {
  const others = data.providers.filter((p) => p.provider !== provider);
  commit({ ...data, providers: [...others, { provider, status, lastValidatedAt }] });
}

/** Forget a provider's metadata (after the key is removed). */
export function clearProviderMeta(provider: ProviderId): void {
  commit({ ...data, providers: data.providers.filter((p) => p.provider !== provider) });
}

// ---- Sticky New-page selection ----
/** Remember the last-used persona / working folder so the New-page pickers persist across
 *  restarts. Only the provided fields change; both live in the `store.json` blob. */
export function rememberSelection(patch: { personaId?: string; cwd?: string }): void {
  const next = { ...data };
  if (patch.personaId !== undefined) next.lastPersonaId = patch.personaId;
  if (patch.cwd !== undefined) next.lastCwd = patch.cwd;
  commit(next);
}

// ---- Onboarding ----
/** Mark first-run onboarding as done so the dashboard loads directly from now on. */
export function completeOnboarding(): void {
  commit({ ...data, onboardedAt: now() });
}
/** Clear the onboarding flag so the wizard shows again (re-run setup). */
export function resetOnboarding(): void {
  commit({ ...data, onboardedAt: undefined });
}
