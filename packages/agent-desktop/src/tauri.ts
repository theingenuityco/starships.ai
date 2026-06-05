// Bindings for the Rust commands exposed by the Tauri shell (src-tauri/src/lib.rs).
import { invoke } from '@tauri-apps/api/core';
import { hostname as osHostname } from '@tauri-apps/plugin-os';

export interface DetectedAgent {
  kind: string;
  command: string;
  path: string;
  version?: string | null;
  default_executor: string;
}

export interface RunResult {
  exit_code: number | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
}

export const detectAgents = () => invoke<DetectedAgent[]>('detect_agents');

/** Run an agent CLI once (argv array, no shell) and capture its output. */
export const runAgent = (args: { command: string; args: string[]; env: Record<string, string> }) =>
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
