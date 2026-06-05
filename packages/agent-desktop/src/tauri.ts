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

export interface RunnerInfo {
  runner_id: string;
  agent_id: string;
  control_port: number;
  control_token: string;
}

export const detectAgents = () => invoke<DetectedAgent[]>('detect_agents');

export const startRunner = (args: { agentId: string; token: string; mcpUrl: string; executor: string }) =>
  invoke<RunnerInfo>('start_runner', args);

export const stopRunner = (runnerId: string) => invoke<void>('stop_runner', { runnerId });

export const listRunners = () => invoke<RunnerInfo[]>('list_runners');

// Connected-agent persistence lives in a Rust-managed 0600 file (not the
// webview's localStorage) so agent tokens aren't reachable by in-page script.
export const loadAgentsRaw = () => invoke<string>('load_agents');
export const saveAgentsRaw = (json: string) => invoke<void>('save_agents', { json });

/** Raw JSONL of a CLI run's transcript by session id, or null if none on disk. */
export const readAgentTranscript = (sessionId: string) => invoke<string | null>('read_agent_transcript', { sessionId });

/** Hostname for naming agents stably per machine; falls back gracefully. */
export async function hostname(): Promise<string> {
  try {
    return (await osHostname()) || 'this-machine';
  } catch {
    return 'this-machine';
  }
}

/** Whether we're running inside the Tauri shell (vs plain `vite dev` in a browser). */
export const isTauri = (): boolean => typeof (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined';
