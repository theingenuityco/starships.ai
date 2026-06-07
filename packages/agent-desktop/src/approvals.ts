// Mid-run tool-permission approvals, shared across every runtime that can ask mid-run.
// This module owns all the *policy*; the transports differ:
//
//   - claude-code / hermes / cursor go through the Rust loopback hook server, which emits
//     a `permission-request` event; we resolve via the `resolve_approval` command.
//   - codex goes through its app-server JSON-RPC; the codex client enqueues here directly
//     and resolves by replying over the process stdin.
//
// Either way the queue, the auto-allow of listed tools, and "allow always" (persist to the
// persona) live here. Requests are correlated to a run by `correlation` (the run's
// dispatchId, which each transport carries through). Each pending item carries its own
// `resolve(decision)` so the dialog doesn't need to know which transport it came from.
import { useSyncExternalStore } from 'react';
import { addAllowedTools, getStore } from './store';
import { onPermissionRequest, resolveApproval, type ApprovalDecision } from './tauri';

/** A gated tool call surfaced to the user. `resolve` routes the decision to its transport. */
export interface PendingApproval {
  key: string;
  runtime: string;
  toolName: string;
  toolInput: unknown;
  personaId?: string;
  personaName?: string;
  resolve: (decision: ApprovalDecision) => void;
}

/** Per-run context, registered by the engine so a request can find its persona + policy. */
interface RunContext {
  personaId: string;
  /** The persona's allow patterns at run start, plus anything "allow always" adds mid-run. */
  allow: string[];
}

const contexts = new Map<string, RunContext>(); // correlation (dispatchId) → context
// Reassigned (not mutated) on every change so useSyncExternalStore sees a new reference and
// re-renders — events arrive outside React, so a stable reference would silently no-op.
let queue: PendingApproval[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let started = false;
let keySeq = 1;

/**
 * Does `toolName` match an allow pattern? Patterns are either a bare tool name
 * (`WebSearch`) or a scoped form (`Bash(git *)`); we match on the tool name, treating the
 * scoped form as covering the whole tool (the CLI enforces the finer scope itself).
 */
function toolAllowed(toolName: string, allow: string[]): boolean {
  return allow.some((p) => p === toolName || p.startsWith(`${toolName}(`));
}

/** Register a run's persona + allowlist (keyed by its dispatchId) so calls can be resolved. */
export function registerApprovalContext(correlation: string, personaId: string, allow: string[]): void {
  contexts.set(correlation, { personaId, allow: [...allow] });
}

/** Drop a run's context once it finishes (best-effort; stale entries are harmless). */
export function clearApprovalContext(correlation: string): void {
  contexts.delete(correlation);
}

/**
 * Central entry for every gated tool call (loopback or codex). Auto-allows tools already
 * on the run's persona allowlist (resolve immediately, no dialog); otherwise enqueues for
 * the Allow once / Allow always / Deny dialog.
 */
export function requestApproval(args: {
  correlation: string;
  runtime: string;
  toolName: string;
  toolInput: unknown;
  resolve: (decision: ApprovalDecision) => void;
}): void {
  const ctx = contexts.get(args.correlation);
  if (ctx && toolAllowed(args.toolName, ctx.allow)) {
    args.resolve('allow');
    return;
  }
  const persona = ctx ? getStore().personas.find((p) => p.id === ctx.personaId) : undefined;
  queue = [
    ...queue,
    {
      key: `ap-${keySeq++}`,
      runtime: args.runtime,
      toolName: args.toolName,
      toolInput: args.toolInput,
      personaId: ctx?.personaId,
      personaName: persona?.name,
      resolve: args.resolve,
    },
  ];
  emit();
}

/** Wire up the loopback Tauri subscription once (called from app boot). Idempotent. */
export function initApprovals(): void {
  if (started) return;
  started = true;
  void onPermissionRequest((req) =>
    requestApproval({
      correlation: req.correlation,
      runtime: req.runtime,
      toolName: req.toolName,
      toolInput: req.toolInput,
      resolve: (decision) => void resolveApproval(req.id, decision),
    })
  );
}

/** Resolve one queued approval with the user's decision and drop it from the queue. */
export function decideApproval(key: string, decision: ApprovalDecision): void {
  const item = queue.find((a) => a.key === key);
  if (!item) return;
  queue = queue.filter((a) => a.key !== key);
  emit();
  item.resolve(decision);
}

/**
 * "Allow always": persist the tool into the persona's allowlist, update the live run
 * context so the rest of this run auto-allows it too, then resolve (session-scoped allow).
 */
export function allowAlways(key: string): void {
  const item = queue.find((a) => a.key === key);
  if (!item) return;
  if (item.personaId) addAllowedTools(item.personaId, [item.toolName]);
  for (const ctx of contexts.values()) {
    if (ctx.personaId === item.personaId && !ctx.allow.includes(item.toolName)) ctx.allow = [...ctx.allow, item.toolName];
  }
  decideApproval(key, 'allow-session');
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const snapshot = (): PendingApproval[] => queue;

/** Subscribe a component to the pending-approval queue. */
export const useApprovals = (): PendingApproval[] => useSyncExternalStore(subscribe, snapshot, snapshot);
