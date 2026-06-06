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

// Local state lives in a Rust-managed 0600 file (not the webview's localStorage)
// so anything sensitive in it stays out of reach of in-page script.
export const readStoreRaw = () => invoke<string>('read_store');
export const writeStoreRaw = (json: string) => invoke<void>('write_store', { json });

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
