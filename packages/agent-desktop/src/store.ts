// Local, single-user config + activity state for the desktop app. No server, no
// auth: this app is the source of truth.
//
// Persistence is split by access pattern (see src-tauri lib.rs):
//   - Config (runtimes/personas/heartbeats/onboarding) is a small JSON blob in
//     `store.json`, fully rewritten on each change (read_store/write_store).
//   - The activity log is append-only JSONL in `events.jsonl` (append_event).
//   - Conversations live one-file-per-thread; see ./conversations.
import { useSyncExternalStore } from 'react';
import { appendEvent, isTauri, readEventsRaw, readStoreRaw, writeStoreRaw } from './tauri';
import { deleteConversationsForPersona } from './conversations';
import { DEFAULT_PERMISSIONS, type PermissionPolicy } from './permissions';

export type { PermissionPolicy } from './permissions';
export { DEFAULT_PERMISSIONS };

export type RuntimeKind = 'claude-code' | 'codex' | 'hermes' | 'custom' | 'starship';

/** Providers the in-house runtime supports (BYO key). */
export type ProviderId = 'anthropic' | 'openai';

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

/** In-memory app state. `events` is loaded from `events.jsonl`; the rest is the
 *  `store.json` config blob. Conversations are not held here (see ./conversations). */
export interface StoreData {
  runtimes: Runtime[];
  personas: Persona[];
  heartbeats: Heartbeat[];
  events: AgentEvent[];
  /** Provider-key validation metadata (the secrets live in the OS keychain, not here). */
  providers: ProviderMeta[];
  /** Set once the first-run onboarding wizard is completed (or skipped). Absent = show it. */
  onboardedAt?: string;
}

/** The persisted-to-`store.json` subset (everything except the append-only event log). */
type ConfigData = Omit<StoreData, 'events'>;

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
    runtimes: Array.isArray(d.runtimes) ? d.runtimes : [],
    personas: Array.isArray(d.personas) ? d.personas : [],
    heartbeats: Array.isArray(d.heartbeats) ? d.heartbeats : [],
    providers: Array.isArray(d.providers) ? d.providers : [],
    onboardedAt: typeof d.onboardedAt === 'string' ? d.onboardedAt : undefined,
  };
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
  data = { ...config, events };
  emit();
}

/** Persist the config subset (not events — those append independently). */
function persistConfig(): void {
  if (!isTauri()) return;
  const config = {
    schemaVersion: SCHEMA_VERSION,
    runtimes: data.runtimes,
    personas: data.personas,
    heartbeats: data.heartbeats,
    providers: data.providers,
    onboardedAt: data.onboardedAt,
  };
  writeStoreRaw(JSON.stringify(config)).catch((err) => console.error('[store] write failed:', err));
}

function commit(next: StoreData): void {
  data = next;
  emit();
  persistConfig();
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
  commit({ ...data, runtimes: [...data.runtimes, rt] });
  return rt;
}
export function removeRuntime(id: string): void {
  commit({
    ...data,
    runtimes: data.runtimes.filter((r) => r.id !== id),
    // Unassign personas that pointed at this runtime.
    personas: data.personas.map((p) => (p.runtimeId === id ? { ...p, runtimeId: null } : p)),
  });
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
  commit({ ...data, personas: [...data.personas, p] });
  return p;
}
export function updatePersona(id: string, patch: Partial<Omit<Persona, 'id' | 'createdAt'>>): void {
  commit({ ...data, personas: data.personas.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
}
/**
 * Add tool patterns to a persona's allowlist, switching it into 'allowlist' mode if it
 * was on its default. Used by the "Allow + rerun" affordance after a run denied a tool,
 * and by "Allow always" in the live approval dialog. Idempotent (de-dupes).
 */
export function addAllowedTools(id: string, tools: string[]): void {
  const clean = tools.map((t) => t.trim()).filter(Boolean);
  if (!clean.length) return;
  commit({
    ...data,
    personas: data.personas.map((p) => {
      if (p.id !== id) return p;
      const cur = p.permissions ?? DEFAULT_PERMISSIONS;
      const allow = [...new Set([...cur.allow, ...clean])];
      return { ...p, permissions: { mode: 'allowlist', allow } };
    }),
  });
}

export function deletePersona(id: string): void {
  commit({
    ...data,
    personas: data.personas.filter((p) => p.id !== id),
    heartbeats: data.heartbeats.filter((h) => h.personaId !== id),
  });
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

// ---- Onboarding ----
/** Mark first-run onboarding as done so the dashboard loads directly from now on. */
export function completeOnboarding(): void {
  commit({ ...data, onboardedAt: now() });
}
/** Clear the onboarding flag so the wizard shows again (re-run setup). */
export function resetOnboarding(): void {
  commit({ ...data, onboardedAt: undefined });
}
