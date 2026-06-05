// Ephemeral, in-memory store of in-flight (and just-finished) runs, keyed by dispatchId.
// Unlike the persisted store.ts, this is never written to disk — it holds the live
// conversation as stream lines arrive so the UI can render token-by-token. The durable
// record stays in store.ts events + (for Claude) the on-disk transcript.
import { useSyncExternalStore } from 'react';
import type { RuntimeKind } from './store';
import type { StreamUpdate, TranscriptTurn } from './transcript';

export interface LiveRun {
  dispatchId: string;
  kind: RuntimeKind;
  status: 'running' | 'done' | 'failed';
  /** Finished turns: committed assistant messages, tool calls, tool results. */
  committed: TranscriptTurn[];
  /** In-flight assistant text being typed out (Claude deltas); '' between messages. */
  streamingText: string;
  /** Raw stdout/stderr accumulator for runtimes without a structured stream. */
  raw: string;
  finalText?: string;
  durationMs?: number;
  denials?: number;
}

const MAX_RUNS = 40; // bound memory; evict oldest by insertion order
const runs = new Map<string, LiveRun>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startLiveRun(dispatchId: string, kind: RuntimeKind): void {
  if (runs.size >= MAX_RUNS) {
    const oldest = runs.keys().next().value;
    if (oldest) runs.delete(oldest);
  }
  runs.set(dispatchId, { dispatchId, kind, status: 'running', committed: [], streamingText: '', raw: '' });
  emit();
}

export function applyLiveUpdate(dispatchId: string, update: StreamUpdate): void {
  const cur = runs.get(dispatchId);
  if (!cur) return;
  const next: LiveRun = { ...cur };
  switch (update.kind) {
    case 'delta':
      next.streamingText = cur.streamingText + update.text;
      break;
    case 'assistant':
      next.committed = [...cur.committed, ...update.turns];
      next.streamingText = ''; // the full message supersedes the streamed buffer
      break;
    case 'toolResults':
      next.committed = [...cur.committed, ...update.turns];
      break;
    case 'result':
      if (update.finalText !== undefined) next.finalText = update.finalText;
      if (update.durationMs !== undefined) next.durationMs = update.durationMs;
      if (update.denials !== undefined) next.denials = update.denials;
      break;
    case 'system':
      break; // metadata only; nothing rendered yet
  }
  runs.set(dispatchId, next);
  emit();
}

/** Append a raw stdout/stderr line for runtimes streamed as plain text (or stderr anywhere). */
export function appendRaw(dispatchId: string, line: string): void {
  const cur = runs.get(dispatchId);
  if (!cur) return;
  runs.set(dispatchId, { ...cur, raw: cur.raw + line + '\n' });
  emit();
}

export function finishLiveRun(dispatchId: string, opts: { ok: boolean; durationMs?: number; finalText?: string }): void {
  const cur = runs.get(dispatchId);
  if (!cur) return;
  // Flush any leftover streamed text that never got a committing `assistant` event.
  const committed = cur.streamingText.trim()
    ? [...cur.committed, { role: 'assistant' as const, text: cur.streamingText }]
    : cur.committed;
  runs.set(dispatchId, {
    ...cur,
    committed,
    streamingText: '',
    status: opts.ok ? 'done' : 'failed',
    durationMs: opts.durationMs ?? cur.durationMs,
    finalText: opts.finalText ?? cur.finalText,
  });
  emit();
}

export const getLiveRun = (dispatchId: string | null | undefined): LiveRun | undefined =>
  dispatchId ? runs.get(dispatchId) : undefined;

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Subscribe a component to one run's live state. */
export const useLiveRun = (dispatchId: string | null | undefined): LiveRun | undefined =>
  useSyncExternalStore(subscribe, () => getLiveRun(dispatchId));

/** Last assistant text in a run — used to derive a final summary for the durable event. */
export function lastAssistantText(run: LiveRun | undefined): string | undefined {
  if (!run) return undefined;
  for (let i = run.committed.length - 1; i >= 0; i--) {
    if (run.committed[i].role === 'assistant') return run.committed[i].text;
  }
  return undefined;
}
