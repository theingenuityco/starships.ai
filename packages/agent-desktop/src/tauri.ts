// Bindings for the Rust commands exposed by the Tauri shell (src-tauri/src/lib.rs).
import { Channel, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { hostname as osHostname } from '@tauri-apps/plugin-os';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';

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
export const runAgent = (args: {
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Working directory to launch the CLI in; omit/empty for the app process cwd. */
  cwd?: string;
  onEvent: Channel<StreamMsg>;
}) => invoke<RunResult>('run_agent', args);

/**
 * Run a duplex (bidirectional) process — stdin stays piped and is keyed by `runId` so
 * `sendAgentInput` can write to it mid-run. Used for codex app-server JSON-RPC.
 */
export const runAgentDuplex = (args: {
  runId: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Working directory to launch the process in; omit/empty for the app process cwd. */
  cwd?: string;
  onEvent: Channel<StreamMsg>;
}) => invoke<RunResult>('run_agent_duplex', args);

/**
 * Open the OS folder picker and return the chosen absolute path, or null if cancelled.
 * No-op (null) outside Tauri. Used by the working-directory selector.
 */
export const pickDirectory = async (defaultPath?: string): Promise<string | null> => {
  if (!isTauri()) return null;
  const picked = await openDialog({ directory: true, multiple: false, defaultPath });
  return typeof picked === 'string' ? picked : null;
};

/** The user's home directory, used as the default working folder. Null outside Tauri / on error. */
export const homeDirectory = async (): Promise<string | null> => {
  if (!isTauri()) return null;
  try {
    return await homeDir();
  } catch {
    return null;
  }
};

/** Write one line (a JSON-RPC frame) to a duplex run's stdin. */
export const sendAgentInput = (runId: string, data: string) => invoke<void>('send_agent_input', { runId, data });

/** Close a duplex run's stdin (EOF) so a persistent server (codex app-server) shuts down. */
export const closeAgentInput = (runId: string) => invoke<void>('close_agent_input', { runId });

// Local state lives in Rust-managed 0600 files under the app-data dir (not the
// webview's localStorage) so anything sensitive stays out of reach of in-page
// script. store.json is a small blob (heartbeats/providers/onboarding); personas
// and runtimes are one-file-per-record under config/; conversations and events are
// append-only JSONL (see src-tauri lib.rs).
export const readStoreRaw = () => invoke<string>('read_store');
export const writeStoreRaw = (json: string) => invoke<void>('write_store', { json });

// Personas + runtimes: one JSON file per record under config/. list_* returns each
// record's raw JSON string (the store parses); write/delete are keyed by record id.
export const listPersonasRaw = () => invoke<string[]>('list_personas');
export const writePersonaRaw = (id: string, json: string) => invoke<void>('write_persona', { id, json });
export const deletePersonaRaw = (id: string) => invoke<void>('delete_persona', { id });
export const listRuntimesRaw = () => invoke<string[]>('list_runtimes');
export const writeRuntimeRaw = (id: string, json: string) => invoke<void>('write_runtime', { id, json });
export const deleteRuntimeRaw = (id: string) => invoke<void>('delete_runtime', { id });

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

// ---- Tool-permission approvals (claude-code mid-run) ----

/** A decision for a gated tool call. `allow-session` = allow for the rest of this run. */
export type ApprovalDecision = 'allow' | 'allow-session' | 'deny';

/** One gated tool call awaiting a decision, emitted by the loopback approval server. */
export interface PermissionRequest {
  /** Opaque id to resolve this specific parked request. */
  id: string;
  /** Correlation key: the run's dispatchId (preferred) or the CLI's own session id. */
  correlation: string;
  /** Which CLI's hook posted: 'claude-code' | 'hermes' | 'cursor'. */
  runtime: string;
  toolName: string;
  toolInput: unknown;
}

/** Loopback approval-server port (0 = server failed to start; mid-run approval disabled). */
export const approvalPort = () => invoke<number>('approval_port');

/** Deliver a decision back to a parked hook request. */
export const resolveApproval = (id: string, decision: ApprovalDecision) => invoke<void>('resolve_approval', { id, decision });

/** Install (enable) or release a file-based hook for 'hermes' | 'cursor'. Ref-counted. */
export const setRuntimeHook = (runtime: 'hermes' | 'cursor', port: number, enable: boolean) =>
  invoke<void>('set_runtime_hook', { runtime, port, enable });

/** Write a per-run claude settings file (hooks load from files, not inline). Returns its path. */
export const writeRunSettings = (dispatchId: string, contents: string) =>
  invoke<string>('write_run_settings', { dispatchId, contents });

/** Delete a per-run claude settings file. */
export const removeRunSettings = (dispatchId: string) => invoke<void>('remove_run_settings', { dispatchId });

/** Subscribe to gated tool calls. Returns an unlisten fn; no-op resolver outside Tauri. */
export async function onPermissionRequest(cb: (req: PermissionRequest) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  try {
    return await listen<PermissionRequest>('permission-request', (e) => cb(e.payload));
  } catch {
    return () => {};
  }
}

// ---- In-house agent-runtime sidecar + provider keys ----

/** Base URL of the local agent-runtime sidecar, starting it lazily on first use. */
export const runtimeBaseUrl = () => invoke<string>('runtime_base_url');

/** Presence + masked last-4 hint for a stored provider key (never the secret itself). */
export interface SecretStatus {
  provider: string;
  present: boolean;
  hint: string;
}

/** Store a provider API key in the OS keychain (restarts the sidecar to pick it up). */
export const setSecret = (provider: string, key: string) => invoke<void>('set_secret', { provider, key });
/** Delete a stored provider API key (idempotent; restarts the sidecar). */
export const deleteSecret = (provider: string) => invoke<void>('delete_secret', { provider });
/** Presence + hint for every supported provider key. */
export const secretStatus = () => invoke<SecretStatus[]>('secret_status');

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
