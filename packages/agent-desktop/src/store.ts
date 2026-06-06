// Local, single-user state for the desktop app. Everything lives in one JSON
// blob persisted to a Rust-managed 0600 file (see src-tauri read_store/write_store).
// No server, no auth: this app is the source of truth.
import { useSyncExternalStore } from 'react';
import { isTauri, readStoreRaw, writeStoreRaw } from './tauri';
import type { PermissionPolicy } from './permissions';
import type { TurnRole } from './transcript';

export type { PermissionPolicy } from './permissions';
export { DEFAULT_PERMISSIONS } from './permissions';

export type RuntimeKind = 'claude-code' | 'codex' | 'hermes' | 'openclaw' | 'custom';

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

/** One persisted turn in a conversation thread. Mirrors a {@link TranscriptTurn}
 *  plus a timestamp, so threads survive restart independent of the on-disk CLI log. */
export interface ConversationMessage {
  role: TurnRole;
  text: string;
  /** Tool name, for `tool`/`result` turns. */
  tool?: string;
  at: string;
}

/** A persisted multi-turn chat with one persona. `sessionId` is the CLI session reused
 *  across turns so follow-ups resume the same context (see engine `runConversationTurn`). */
export interface Conversation {
  id: string;
  personaId: string;
  title: string;
  /** Set after the first turn that mints a CLI session; later turns resume it. */
  sessionId?: string | null;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
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

export interface StoreData {
  runtimes: Runtime[];
  personas: Persona[];
  heartbeats: Heartbeat[];
  conversations: Conversation[];
  events: AgentEvent[];
  /** Set once the first-run onboarding wizard is completed (or skipped). Absent = show it. */
  onboardedAt?: string;
}

const EMPTY: StoreData = { runtimes: [], personas: [], heartbeats: [], conversations: [], events: [] };

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

let data: StoreData = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function coerce(raw: unknown): StoreData {
  const d = (raw ?? {}) as Partial<StoreData>;
  return {
    runtimes: Array.isArray(d.runtimes) ? d.runtimes : [],
    personas: Array.isArray(d.personas) ? d.personas : [],
    heartbeats: Array.isArray(d.heartbeats) ? d.heartbeats : [],
    conversations: Array.isArray(d.conversations) ? d.conversations : [],
    events: Array.isArray(d.events) ? d.events : [],
    onboardedAt: typeof d.onboardedAt === 'string' ? d.onboardedAt : undefined,
  };
}

/** Load persisted state into memory. No-op shape outside Tauri (vite dev). */
export async function initStore(): Promise<void> {
  if (!isTauri()) {
    data = EMPTY;
    return;
  }
  try {
    data = coerce(JSON.parse(await readStoreRaw()));
  } catch {
    data = EMPTY;
  }
  emit();
}

function commit(next: StoreData): void {
  data = next;
  emit();
  if (isTauri()) writeStoreRaw(JSON.stringify(data)).catch(() => {});
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
export function deletePersona(id: string): void {
  commit({
    ...data,
    personas: data.personas.filter((p) => p.id !== id),
    heartbeats: data.heartbeats.filter((h) => h.personaId !== id),
    conversations: data.conversations.filter((c) => c.personaId !== id),
  });
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

// ---- Conversations ----
export function addConversation(input: { personaId: string; title: string }): Conversation {
  const c: Conversation = { id: uid(), createdAt: now(), updatedAt: now(), sessionId: null, messages: [], ...input };
  commit({ ...data, conversations: [...data.conversations, c] });
  return c;
}
/** Append turns to a thread, bump `updatedAt`, and bound the stored history. */
export function appendConversationMessages(id: string, messages: ConversationMessage[]): void {
  if (messages.length === 0) return;
  commit({
    ...data,
    conversations: data.conversations.map((c) =>
      c.id === id ? { ...c, messages: [...c.messages, ...messages].slice(-500), updatedAt: now() } : c
    ),
  });
}
/** Persist the CLI session id after the first turn so later turns can resume it. */
export function setConversationSession(id: string, sessionId: string): void {
  commit({ ...data, conversations: data.conversations.map((c) => (c.id === id ? { ...c, sessionId } : c)) });
}
export function updateConversation(id: string, patch: Partial<Pick<Conversation, 'title'>>): void {
  commit({ ...data, conversations: data.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
}
export function deleteConversation(id: string): void {
  commit({ ...data, conversations: data.conversations.filter((c) => c.id !== id) });
}

// ---- Events ----
export function addEvent(input: Omit<AgentEvent, 'id' | 'createdAt'>): AgentEvent {
  const e: AgentEvent = { id: uid(), createdAt: now(), ...input };
  // Keep the log bounded — most recent first in storage is unnecessary; we cap total.
  const events = [...data.events, e].slice(-500);
  commit({ ...data, events });
  return e;
}
export const eventsForPersona = (personaId: string): AgentEvent[] => data.events.filter((e) => e.personaId === personaId);

// ---- Onboarding ----
/** Mark first-run onboarding as done so the dashboard loads directly from now on. */
export function completeOnboarding(): void {
  commit({ ...data, onboardedAt: now() });
}
/** Clear the onboarding flag so the wizard shows again (re-run setup). */
export function resetOnboarding(): void {
  commit({ ...data, onboardedAt: undefined });
}
