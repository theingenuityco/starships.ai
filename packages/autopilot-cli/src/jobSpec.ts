/**
 * CliAgentJobSpec — the host -> sandbox transport contract.
 *
 * The server builds one of these and writes it to a job file; the runner's
 * container entrypoint reads it and runs the agent loop. Everything here is
 * JSON-serializable (no functions): the live PermissionPolicy is reconstructed
 * in-sandbox from the serializable PermissionTable via buildPermissionPolicy.
 */

import type { ChatMessage, LlmExtras, PermissionPolicy, ToolPermission } from '@/types';

/** Git clone spec (structurally compatible with the runner's WorkspaceSpec). */
export interface CliWorkspaceSpec {
  repoUrl: string;
  ref?: string;
  branch?: string;
  depth?: number;
  subdir?: string;
}

/** Short-lived git credentials for cloning (never logged, never in runtimeEnv). */
export interface CliGitCredentials {
  token: string;
  username?: string;
}

/**
 * Serializable allow/ask/deny table. A function policy cannot cross the wire, so
 * the host sends a table and the sandbox builds the policy. `run_action` can be
 * gated per-connector; everything else by tool name, with a default.
 */
export interface PermissionTable {
  default?: ToolPermission;
  tools?: Record<string, ToolPermission>;
  connectors?: Record<string, ToolPermission>;
}

export function buildPermissionPolicy(table: PermissionTable): PermissionPolicy {
  return (call) => {
    if (call.name === 'run_action' && table.connectors) {
      const connector = typeof call.args.connector === 'string' ? call.args.connector : '';
      if (connector && table.connectors[connector]) return table.connectors[connector];
    }
    if (table.tools && table.tools[call.name]) return table.tools[call.name];
    return table.default ?? 'allow';
  };
}

/**
 * The DEFINITION half of a turn: the agent's identity, capabilities, and policy.
 *
 * In a file-driven starship these are resolved from `.autopilot/agents/<slug>.md`
 * and `.autopilot/connectors/*.yaml` by the CLI itself (see Stage 2). Today the
 * server still bakes them from the Postgres index; either way they describe *who*
 * the agent is, not *this* turn's transient inputs. Everything here is something a
 * `.autopilot` file could legitimately author.
 */
export interface CliAgentDefinitionSpec {
  model: string;
  /**
   * The agent persona / system prompt. Today this is the fully-composed prompt
   * (persona + per-turn starship/thread context) built server-side. When the
   * persona moves to the file, the file supplies the persona and the per-turn
   * context arrives via {@link CliAgentRuntimeEnvelope.systemPromptContext}.
   */
  systemPrompt: string;

  /** Agent tuning. */
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean };
  extras?: LlmExtras;
  maxSteps?: number;

  /** Connector allow-list (the providers this agent may discover/use). */
  discoverConnectors?: string[];

  /** Serializable allow/ask/deny table; built into a PermissionPolicy in-sandbox. */
  permissions?: PermissionTable;
}

/**
 * The RUNTIME ENVELOPE: per-turn, secret, or ledger inputs the server must always
 * inject. None of this is file-resolvable — it is conversation history, secrets,
 * the connector-action callback, the workspace, the agent selector, and the
 * server-composed per-turn context block.
 */
export interface CliAgentRuntimeEnvelope {
  requestId: string;
  messages: ChatMessage[];

  /** OpenRouter-compatible model endpoint (mirrors the runner's LlmRuntimeConfig). */
  llm: { apiKey: string; baseUrl?: string; defaultHeaders?: Record<string, string> };

  /** Server-authority connector-action dispatch. */
  connectorActionCallback: { url: string; secret?: string; starshipId: string; authUserId: string };

  /** Non-secret runtime env forwarded to the connector callback. */
  runtimeEnv?: Record<string, unknown>;

  /**
   * Workspace-backed run. On the first (provisioning) job, `spec`+`git` are
   * present so the sandbox clones into `root`; on later jobs only `root` is
   * present and the existing checkout is reused.
   */
  workspace?: { root?: string; spec?: CliWorkspaceSpec; git?: CliGitCredentials };

  /** Approval decisions keyed by toolCallId, supplied on resume. */
  approvals?: Record<string, 'approved' | 'denied'>;

  /**
   * Which agent in `.autopilot/agents/` to embody this turn (the selector, like
   * `claude --agent <slug>`). Informational until the CLI bootstrap (Stage 2)
   * consumes it to load the persona/tuning from the file.
   */
  agentSlug?: string;

  /**
   * Server-composed per-turn context (starship/thread/policy) to append after the
   * file persona once the persona is file-resolved. Unused while `systemPrompt`
   * carries the fully-composed prompt.
   */
  systemPromptContext?: string;
}

/**
 * CliAgentJobSpec is the full host -> sandbox wire contract: the definition spec
 * plus the runtime envelope. Kept a flat intersection (not nested) so the wire
 * shape and all existing field accesses are unchanged; the split lives in the
 * type system to name the file-resolvable boundary.
 */
export interface CliAgentJobSpec extends CliAgentDefinitionSpec, CliAgentRuntimeEnvelope {}
