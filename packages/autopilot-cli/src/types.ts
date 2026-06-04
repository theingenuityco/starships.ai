/**
 * Core types for the code-native terminal agent loop.
 *
 * This package is standalone: it owns its own model client (OpenRouter via the
 * openai SDK) and its own message/tool shapes. It does not depend on the
 * autopilot DAG/Engine. Side effects the agent cannot perform itself (connector
 * actions) are delegated through an injected ConnectorActionRunner.
 *
 * An agent is a plain loop:
 *   call the LLM -> run any tool calls -> append results -> repeat.
 */

/** A JSON Schema object describing a tool's arguments (OpenAI function-calling shape). */
export interface JsonObjectSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** A normalized tool call extracted from an assistant message. */
export interface AssistantToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * A message in the conversation transcript. Provider-neutral and serialized to
 * the OpenAI/OpenRouter wire shape by the model client.
 *
 * `reasoning`/`reasoningDetails` are carried back on assistant messages
 * deliberately: some providers (e.g. Anthropic via OpenRouter) reject a
 * follow-up turn whose prior assistant message lost its reasoning signature.
 */
export interface ChatMessage {
  role: ChatRole;
  /** String, or multimodal content blocks (image_url/file/text) for user messages. */
  content: string | unknown[];
  reasoning?: string;
  reasoningDetails?: unknown[];
  images?: unknown[];
  toolCalls?: AssistantToolCall[];
  /** Set on `tool` messages to link the result back to the originating tool call. */
  toolCallId?: string;
  /** Optional provider attribution name. */
  name?: string;
}

/** The assistant message produced by one LLM step. */
export interface AssistantMessage {
  role: 'assistant';
  content: string;
  reasoning?: string;
  reasoningDetails?: unknown[];
  images?: unknown[];
  toolCalls?: AssistantToolCall[];
}

/** Token/cost accounting for a single LLM step, when the provider reports it. */
export interface StepUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
}

/** Optional multimodal / provider-extension controls forwarded to the LLM. */
export interface LlmExtras {
  /** e.g. ['image','text'] to enable image generation. */
  modalities?: Array<'text' | 'image'>;
  /** OpenRouter image_config, e.g. { aspect_ratio: '16:9' }. */
  imageConfig?: Record<string, unknown>;
  /** OpenRouter plugins, e.g. [{ id: 'web', max_results: 3 }]. */
  plugins?: Array<{ id: string; max_results?: number }>;
  /** Structured-output response_format. */
  responseFormat?: Record<string, unknown>;
}

/** Result of executing a connector action. Mirrors the server's HttpEnvelope. */
export interface ConnectorActionResult {
  status: number;
  body: unknown;
  headers?: Record<string, unknown>;
}

/**
 * Executes connector actions on the agent's behalf. The agent never holds
 * credentials: in the runner this round-trips to the server's internal
 * connector-action endpoint, where auth and secrets live.
 */
export interface ConnectorActionRunner {
  run(req: { connector: string; action: string; args?: Record<string, unknown>; timeoutMs?: number }): Promise<ConnectorActionResult>;
}

/** Result of running a tool. `content` is serialized into the `tool` message for the LLM. */
export interface ToolResult {
  content: unknown;
  isError?: boolean;
}

/** Ambient context every tool receives at call time. */
export interface ToolContext {
  /** Absolute working directory the agent operates in (the sandbox checkout root). */
  cwd: string;
  /**
   * Additional absolute roots the read-family tools (read/ls) may read from,
   * beyond `cwd` — e.g. the read-only `/starship` definition mount. Writes stay
   * confined to `cwd`.
   */
  readRoots?: string[];
  /** Connector-action dispatch surface. */
  connectors: ConnectorActionRunner;
  /** Catalog of connector actions available for discovery/dispatch. */
  catalog: ActionCatalog;
  /** Cooperative cancellation. */
  signal?: AbortSignal;
}

/**
 * A tool the agent can call. The `name` is what the LLM sees as the function name
 * and what comes back in tool calls. Keep names stable and unique.
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: JsonObjectSchema;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

/** Tri-state permission for a tool call, mirroring the platform's allow/ask/deny model. */
export type ToolPermission = 'allow' | 'ask' | 'deny';

/**
 * Decides whether a tool call may run. Returns 'allow' to run immediately, 'deny'
 * to reject with an error tool result, or 'ask' to pause for human approval.
 * For connector dispatch the call is `run_action` with `{ connector, action }` in
 * args, so a policy can gate at connector/action granularity.
 */
export type PermissionPolicy = (call: { name: string; args: Record<string, unknown> }) => ToolPermission | Promise<ToolPermission>;

/** A tool call awaiting human approval, surfaced to the host on pause. */
export interface PendingApproval {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

/** A connector action projected into a discoverable descriptor (name + schema only). */
export interface ActionDescriptor {
  connector: string;
  action: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Searchable view over the connector-action registry, injected by the host. */
export interface ActionCatalog {
  search(query: string, limit?: number): ActionDescriptor[];
  get(connector: string, action: string): ActionDescriptor | null;
  list(connector?: string): ActionDescriptor[];
}

/**
 * Events emitted by the agent loop. These are the package's own clean stream;
 * mapping them onto the product's SSE/Redis transport is a separate concern
 * handled by whoever runs the loop.
 */
export type CliAgentEvent =
  | { type: 'turn_started'; at: string }
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_message'; message: AssistantMessage; usage?: StepUsage }
  | { type: 'tool_started'; toolCallId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; name: string; result: ToolResult }
  | { type: 'approval_required'; toolCallId: string; name: string; args: Record<string, unknown> }
  | { type: 'turn_completed'; at: string; reason: CliAgentStopReason }
  | { type: 'error'; message: string };

/** Why an agent run stopped. `awaiting_approval` is resumable; the rest are terminal. */
export type CliAgentStopReason = 'stop' | 'max_steps' | 'cancelled' | 'awaiting_approval';

export type CliAgentEventSink = (event: CliAgentEvent) => void | Promise<void>;

/** Connection settings for the OpenRouter-compatible model endpoint. */
export interface ModelClientConfig {
  apiKey: string;
  /** Defaults to OpenRouter's API base. */
  baseURL?: string;
  /** Extra headers (e.g. OpenRouter HTTP-Referer / X-Title). */
  defaultHeaders?: Record<string, string>;
}

/** Inputs to a single agent run. */
export interface CliAgentConfig {
  model: string;
  /** OpenRouter-compatible model endpoint settings. */
  modelClient: ModelClientConfig;
  systemPrompt: string;
  /** Prior conversation (excluding the system prompt, which is supplied separately). */
  messages: ChatMessage[];
  /** Working directory for system tools. */
  cwd: string;
  /** Extra absolute read-only roots for the read-family tools (e.g. the `/starship` mount). */
  readRoots?: string[];
  /** Connector-action dispatch surface (round-trips to the server in the runner). */
  connectors: ConnectorActionRunner;
  catalog: ActionCatalog;
  /**
   * Tools available to the agent. When omitted, defaults to the built-in system
   * tools plus the connector discovery/dispatch meta-tools.
   */
  tools?: AgentTool[];
  temperature?: number;
  maxTokens?: number;
  /** Per-LLM-call timeout in milliseconds. */
  timeout?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean };
  /** Multimodal / provider-extension controls (image generation, web plugins, structured output). */
  extras?: LlmExtras;
  /**
   * Per-tool-call permission gate. When a call resolves to 'ask' and is not
   * already resolved in `approvals`, the loop pauses with reason
   * 'awaiting_approval'. When omitted, all calls are allowed.
   */
  permission?: PermissionPolicy;
  /**
   * Approval decisions keyed by toolCallId, supplied on resume. A call that the
   * policy marks 'ask' runs if approved here and is rejected if denied here.
   */
  approvals?: Record<string, 'approved' | 'denied'>;
  /** Hard cap on LLM<->tool round trips before the loop bails out. Default 50. */
  maxSteps?: number;
  signal?: AbortSignal;
  onEvent?: CliAgentEventSink;
}

/** Result of an agent run. */
export interface CliAgentResult {
  /**
   * Full message transcript including the system prompt, assistant turns, and tool
   * results. On `awaiting_approval`, the last message is the assistant turn whose
   * tool calls have not yet run; persist this and pass it back (with `approvals`)
   * to resume without re-calling the LLM.
   */
  messages: ChatMessage[];
  /** Why the loop stopped. */
  reason: CliAgentStopReason;
  /** Number of LLM calls performed. */
  steps: number;
  /** Tool calls awaiting human approval (only set when reason is 'awaiting_approval'). */
  pendingApprovals?: PendingApproval[];
}
