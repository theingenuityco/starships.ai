// Conversation persistence: one append-only JSONL file per thread under the
// app-data dir (`conversations/<id>.jsonl`, see src-tauri lib.rs). Each file is
// self-contained — line 1 is the header (current title/persona/session), every
// later line is a turn. Turns *append*, so there's no whole-blob rewrite and no
// message cap; rare meta changes (rename, session id) rewrite the header line.
//
// The webview keeps a light in-memory model: a `summaries` list (folded from each
// file's header line, cheap to list) plus a `bodies` cache of fully-loaded threads
// (read lazily when a thread is opened). Mutations apply optimistically in memory
// and fire the disk write in the background, mirroring the config store.
import { useEffect, useSyncExternalStore } from 'react';
import {
  appendConversation,
  createConversation,
  deleteConversationFile,
  isTauri,
  listConversations,
  readConversation,
  updateConversationMeta,
} from './tauri';
import type { TurnRole } from './transcript';

/** One persisted turn in a thread. Mirrors a {@link TranscriptTurn} plus a timestamp. */
export interface ConversationMessage {
  role: TurnRole;
  /** Tool name, for `tool`/`result` turns. */
  tool?: string;
  /** Correlation id pairing a `tool` call with its `result` (see {@link TranscriptTurn}). */
  id?: string;
  text: string;
  at: string;
}

/** Lightweight thread metadata for the sidebar list (no message bodies). */
export interface ConversationSummary {
  id: string;
  personaId: string;
  title: string;
  /** Set after the first turn that mints a CLI session; later turns resume it. */
  sessionId?: string | null;
  createdAt: string;
  /** Derived from the file's mtime (bumped on every append). */
  updatedAt: string;
}

/** A fully-loaded thread: its metadata plus all turns. */
export interface Conversation extends ConversationSummary {
  messages: ConversationMessage[];
}

/** Bump when the on-disk line shapes change in a non-backward-compatible way. */
const SCHEMA_V = 1;

/** Turn roles we accept off disk; anything else is treated as a corrupt line. */
const VALID_ROLES: ReadonlySet<string> = new Set<TurnRole>(['user', 'assistant', 'tool', 'result']);

const uid = () => crypto.randomUUID();
const iso = () => new Date().toISOString();
const summaryOf = (c: Conversation): ConversationSummary => ({
  id: c.id,
  personaId: c.personaId,
  title: c.title,
  sessionId: c.sessionId,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

// ---- JSONL codec ----

interface MetaLine {
  type: 'meta';
  v: number;
  id: string;
  personaId: string;
  title: string;
  sessionId?: string | null;
  createdAt: string;
}

interface MessageLine {
  type: 'message';
  role: TurnRole;
  tool?: string;
  id?: string;
  text: string;
  at: string;
}

/** Serialize a thread's current metadata as the header (first) line. */
function headerLine(meta: ConversationSummary): string {
  const line: MetaLine = {
    type: 'meta',
    v: SCHEMA_V,
    id: meta.id,
    personaId: meta.personaId,
    title: meta.title,
    sessionId: meta.sessionId ?? null,
    createdAt: meta.createdAt,
  };
  return JSON.stringify(line);
}

/** Serialize one turn as a JSONL line. */
function messageLine(m: ConversationMessage): string {
  const line: MessageLine = { type: 'message', role: m.role, text: m.text, at: m.at };
  if (m.tool) line.tool = m.tool;
  if (m.id) line.id = m.id;
  return JSON.stringify(line);
}

/** Parse a header line into summary fields (`updatedAt` is supplied by the caller
 *  from the file mtime). Returns null if the line isn't a valid meta record. */
function parseHeader(line: string, updatedAt: string): ConversationSummary | null {
  try {
    const o = JSON.parse(line) as Partial<MetaLine>;
    if (o.type !== 'meta' || typeof o.id !== 'string' || typeof o.personaId !== 'string') return null;
    return {
      id: o.id,
      personaId: o.personaId,
      title: typeof o.title === 'string' ? o.title : 'Conversation',
      sessionId: o.sessionId ?? null,
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : updatedAt,
      updatedAt,
    };
  } catch {
    return null;
  }
}

/** Fold a thread's full JSONL into a {@link Conversation}. Unknown line types are
 *  skipped (forward-compat), so newer record kinds don't break older readers. */
function parseConversation(jsonl: string, updatedAt: string): Conversation | null {
  const lines = jsonl
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const summary = parseHeader(lines[0], updatedAt);
  if (!summary) return null;
  const messages: ConversationMessage[] = [];
  for (const line of lines.slice(1)) {
    try {
      const o = JSON.parse(line) as Partial<MessageLine>;
      if (o.type !== 'message' || typeof o.text !== 'string' || typeof o.role !== 'string') continue;
      // Reject unknown roles rather than casting them through — downstream render
      // code switches on role and would silently mishandle a bad value.
      if (!VALID_ROLES.has(o.role)) continue;
      const m: ConversationMessage = { role: o.role as TurnRole, text: o.text, at: typeof o.at === 'string' ? o.at : updatedAt };
      if (typeof o.tool === 'string') m.tool = o.tool;
      if (typeof o.id === 'string') m.id = o.id;
      messages.push(m);
    } catch {
      // skip unparseable / forward-compat lines
    }
  }
  return { ...summary, messages };
}

// ---- In-memory model + React binding ----

let summaries: ConversationSummary[] = [];
const bodies = new Map<string, Conversation>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Load the thread list (header lines only) into memory. No-op outside Tauri. */
export async function initConversations(): Promise<void> {
  bodies.clear();
  if (!isTauri()) {
    summaries = [];
    emit();
    return;
  }
  try {
    const raw = await listConversations();
    summaries = raw
      // mtime is 0 when unavailable; fall back to now rather than the Unix epoch.
      .map((r) => parseHeader(r.header, new Date(r.updated_at_ms > 0 ? r.updated_at_ms : Date.now()).toISOString()))
      .filter((s): s is ConversationSummary => s !== null);
  } catch {
    summaries = [];
  }
  emit();
}

const getSummaries = (): ConversationSummary[] => summaries;
/** Subscribe to the thread list (sidebar). */
export const useConversations = (): ConversationSummary[] => useSyncExternalStore(subscribe, getSummaries, getSummaries);

/** Synchronous list/cache reads for non-React callers (e.g. the engine). */
export const getConversationSummary = (id: string): ConversationSummary | undefined => summaries.find((s) => s.id === id);

/** Load one thread's full body (cached after first read). */
export async function loadConversation(id: string): Promise<Conversation | null> {
  const cached = bodies.get(id);
  if (cached) return cached;
  const summary = summaries.find((s) => s.id === id);
  const updatedAt = summary?.updatedAt ?? iso();
  if (!isTauri()) {
    const empty: Conversation = summary
      ? { ...summary, messages: [] }
      : { id, personaId: '', title: 'Conversation', sessionId: null, createdAt: updatedAt, updatedAt, messages: [] };
    bodies.set(id, empty);
    emit();
    return empty;
  }
  try {
    const raw = await readConversation(id);
    const convo = raw ? parseConversation(raw, updatedAt) : null;
    const result = convo ?? (summary ? { ...summary, messages: [] } : null);
    if (result) {
      bodies.set(id, result);
      emit();
    }
    return result;
  } catch {
    return null;
  }
}

/** Subscribe to one thread's full body, lazy-loading it on first use. */
export function useConversation(id: string | null): Conversation | null {
  const body = useSyncExternalStore(
    subscribe,
    () => (id ? bodies.get(id) ?? null : null),
    () => null
  );
  useEffect(() => {
    if (id && !bodies.has(id)) void loadConversation(id);
  }, [id]);
  return body;
}

// ---- Mutations (optimistic in memory, persisted in the background) ----

/** Start a new thread. Returns synchronously so callers can open it immediately;
 *  the file is created in the background. */
export function addConversation(input: { personaId: string; title: string }): Conversation {
  const ts = iso();
  const convo: Conversation = { id: uid(), personaId: input.personaId, title: input.title, sessionId: null, createdAt: ts, updatedAt: ts, messages: [] };
  summaries = [...summaries, summaryOf(convo)];
  bodies.set(convo.id, convo);
  emit();
  if (isTauri()) void createConversation(convo.id, headerLine(convo)).catch((err) => console.error('[conversations] create failed:', err));
  return convo;
}

/** Append turns to a thread and bump its recency. Pure append on disk. */
export function appendConversationMessages(id: string, messages: ConversationMessage[]): void {
  if (messages.length === 0) return;
  const ts = iso();
  const body = bodies.get(id);
  if (body) bodies.set(id, { ...body, messages: [...body.messages, ...messages], updatedAt: ts });
  summaries = summaries.map((s) => (s.id === id ? { ...s, updatedAt: ts } : s));
  emit();
  if (isTauri()) void appendConversation(id, messages.map(messageLine)).catch((err) => console.error('[conversations] append failed:', err));
}

/** Persist the CLI session id after the first turn so later turns can resume it. */
export function setConversationSession(id: string, sessionId: string): void {
  patchMeta(id, { sessionId });
}

/** Rename a thread. */
export function updateConversationTitle(id: string, title: string): void {
  patchMeta(id, { title });
}

/** Apply a metadata patch to caches + rewrite the header line on disk. */
function patchMeta(id: string, patch: Partial<Pick<ConversationSummary, 'title' | 'sessionId'>>): void {
  const body = bodies.get(id);
  const base = body ? summaryOf(body) : summaries.find((s) => s.id === id);
  if (!base) return;
  // Bump updatedAt: rewriting the header touches the file's mtime too, so this
  // keeps the in-memory order in step and floats a renamed thread up in Recents.
  const ts = iso();
  const next = { ...base, ...patch, updatedAt: ts };
  summaries = summaries.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: ts } : s));
  if (body) bodies.set(id, { ...body, ...patch, updatedAt: ts });
  emit();
  if (isTauri()) void updateConversationMeta(id, headerLine(next)).catch((err) => console.error('[conversations] meta write failed:', err));
}

/** Delete a thread. */
export function deleteConversation(id: string): void {
  summaries = summaries.filter((s) => s.id !== id);
  bodies.delete(id);
  emit();
  if (isTauri()) void deleteConversationFile(id).catch((err) => console.error('[conversations] delete failed:', err));
}

/** Cascade: drop every thread belonging to a deleted persona. */
export function deleteConversationsForPersona(personaId: string): void {
  const ids = summaries.filter((s) => s.personaId === personaId).map((s) => s.id);
  if (ids.length === 0) return;
  summaries = summaries.filter((s) => s.personaId !== personaId);
  ids.forEach((id) => bodies.delete(id));
  emit();
  if (isTauri()) ids.forEach((id) => void deleteConversationFile(id).catch((err) => console.error('[conversations] delete failed:', err)));
}
