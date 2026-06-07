// Shared types for the in-house agent runtime.
//
// The runtime is provider-agnostic (Anthropic / OpenAI today) and emits
// Claude-compatible `stream-json` lines so the agent-desktop UI can render it with
// its existing parser (packages/agent-desktop/src/transcript.ts) unchanged.

export type ProviderId = 'anthropic' | 'openai';

/** How tool calls are gated. Mirrors the desktop PermissionPolicy. */
export type PermissionMode = 'all' | 'allowlist';

/** A decision for a gated tool call (mirrors the desktop ApprovalDecision). */
export type ApprovalDecision = 'allow' | 'allow-session' | 'deny';

/** One gated tool call awaiting a decision, surfaced mid-run for interactive approval. */
export interface PermissionRequest {
  /** The tool_use id this request is for; also used to resolve it. */
  toolUseId: string;
  toolName: string;
  toolInput: unknown;
}

/** The body of a `POST /runs` request. One agent turn (or resumed thread turn). */
export interface RunRequest {
  provider: ProviderId;
  model: string;
  /** The user prompt for this turn. */
  prompt: string;
  /** Persona system prompt, if any. */
  systemPrompt?: string;
  /** Thread id: resumes the in-memory message history when it already exists. */
  sessionId: string;
  /** Working directory tools (fs / bash) are scoped to. Defaults to the service cwd. */
  workspace?: string;
  /** Permission policy for tool calls. Defaults to `all`. */
  mode?: PermissionMode;
  /** Tool names pre-approved when `mode === 'allowlist'`. */
  allow?: string[];
  /** Max model<->tool round trips before the run stops. Defaults to 24. */
  maxSteps?: number;
  /**
   * Per-request key override. Normally omitted: the service reads the key from its
   * env (ANTHROPIC_API_KEY / OPENAI_API_KEY), which the desktop populates from the OS
   * keychain at spawn. Useful for cloud / multi-tenant later.
   */
  apiKey?: string;
}

/**
 * Callbacks the HTTP layer hands the runtime so it can stream output and ask for
 * mid-run approvals without knowing about HTTP/SSE itself.
 */
export interface RuntimeHandlers {
  /** Forward one Claude-compatible stream-json line (already an object) to the client. */
  onLine: (line: Record<string, unknown>) => void;
  /**
   * Ask the client to approve a gated tool call. Resolve with the decision. The
   * default implementation (no interactive client) should deny.
   */
  requestApproval: (req: PermissionRequest) => Promise<ApprovalDecision>;
  /** Aborts the run (model stream + in-flight tool). */
  signal: AbortSignal;
}
