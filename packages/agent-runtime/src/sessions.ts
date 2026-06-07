// In-memory thread history keyed by sessionId. Lets a follow-up turn resume the same
// conversation (the desktop threads sessionId across turns). This is intentionally
// process-local for v1; the graduation path is on-disk JSONL / Postgres (see notes).
//
// TODO(v1-limits):
//   - No eviction: this map grows unbounded for the process lifetime. Add a last-used cap
//     (e.g. keep the ~100 most recently accessed sessions) once history moves on-disk.
//   - restart_runtime() (on every provider-key save/delete) discards this map silently, so a
//     follow-up turn after a key change starts with no history. Surface that reset in the UI.
import type { ModelMessage } from 'ai';

const sessions = new Map<string, ModelMessage[]>();

/** A *copy* of the thread's messages so callers can mutate freely before saving. */
export function getSession(id: string): ModelMessage[] {
  return [...(sessions.get(id) ?? [])];
}

export function saveSession(id: string, messages: ModelMessage[]): void {
  sessions.set(id, messages);
}

export function clearSession(id: string): void {
  sessions.delete(id);
}
