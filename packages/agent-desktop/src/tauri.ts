// Bindings for the Rust commands exposed by the Tauri shell (src-tauri/src/lib.rs).
import { Channel, invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { hostname as osHostname } from '@tauri-apps/plugin-os';

export interface DetectedAgent {
  kind: string;
  command: string;
  path: string;
  version?: string | null;
  default_executor: string;
}

/** Returned once the process exits; the output itself arrives live over the channel. */
export interface RunResult {
  exit_code: number | null;
  duration_ms: number;
}

/** One streamed line / lifecycle event from a run (mirrors Rust `StreamMsg`). */
export type StreamMsg =
  | { kind: 'stdout'; data: { line: string } }
  | { kind: 'stderr'; data: { line: string } }
  | { kind: 'exit'; data: { exitCode: number | null; durationMs: number } };

export const detectAgents = () => invoke<DetectedAgent[]>('detect_agents');

/**
 * Run an agent CLI once (argv array, no shell). `onEvent` streams each stdout/stderr
 * line as it arrives; the promise resolves with the exit code + duration when it ends.
 */
export const runAgent = (args: { command: string; args: string[]; env: Record<string, string>; onEvent: Channel<StreamMsg> }) =>
  invoke<RunResult>('run_agent', args);

// Local state lives in Rust-managed 0600 files under the app-data dir (not the
// webview's localStorage) so anything sensitive stays out of reach of in-page
// script. Config (runtimes/personas/heartbeats) is one JSON blob; conversations
// and events are append-only JSONL (see src-tauri lib.rs).
export const readStoreRaw = () => invoke<string>('read_store');
export const writeStoreRaw = (json: string) => invoke<void>('write_store', { json });

/** A thread's filename id + raw header JSONL line + file mtime, for the sidebar list. */
export interface ConversationHeaderRaw {
  id: string;
  header: string;
  updated_at_ms: number;
}

/** List threads cheaply (first/header line of each file only). */
export const listConversations = () => invoke<ConversationHeaderRaw[]>('list_conversations');
/** Full JSONL for one thread (header + turns), or null if it doesn't exist yet. */
export const readConversation = (id: string) => invoke<string | null>('read_conversation', { id });
/** Create a thread file with its header line (idempotent). */
export const createConversation = (id: string, header: string) => invoke<void>('create_conversation', { id, header });
/** Append already-serialized turn lines to a thread (pure append). */
export const appendConversation = (id: string, lines: string[]) => invoke<void>('append_conversation', { id, lines });
/** Replace a thread's header line (rename / session id set). */
export const updateConversationMeta = (id: string, header: string) => invoke<void>('update_conversation_meta', { id, header });
/** Delete a thread file. */
export const deleteConversationFile = (id: string) => invoke<void>('delete_conversation', { id });

/** Append one serialized event line to the activity log. */
export const appendEvent = (line: string) => invoke<void>('append_event', { line });
/** Full events JSONL (empty string when absent). */
export const readEventsRaw = () => invoke<string>('read_events');

/** Raw JSONL of a CLI run's transcript by session id, or null if none on disk. */
export const readAgentTranscript = (sessionId: string) => invoke<string | null>('read_agent_transcript', { sessionId });

/** Hostname for naming runtimes stably per machine; falls back gracefully. */
export async function hostname(): Promise<string> {
  try {
    return (await osHostname()) || 'this-machine';
  } catch {
    return 'this-machine';
  }
}

/** Whether we're running inside the Tauri shell (vs plain `vite dev` in a browser). */
export const isTauri = (): boolean => typeof (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined';

/** Current macOS fullscreen state (lights hide in fullscreen); false outside Tauri. */
export async function isFullscreen(): Promise<boolean> {
  try {
    return await getCurrentWindow().isFullscreen();
  } catch {
    return false;
  }
}

/**
 * Subscribe to fullscreen changes. Re-checks on every window resize (entering or
 * leaving macOS fullscreen resizes the window). Returns an unlisten function.
 */
export async function watchFullscreen(cb: (fullscreen: boolean) => void): Promise<() => void> {
  try {
    const win = getCurrentWindow();
    return await win.onResized(async () => cb(await win.isFullscreen()));
  } catch {
    return () => {};
  }
}
