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

export interface CliAgentJobSpec {
  requestId: string;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];

  /** Agent tuning. */
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean };
  extras?: LlmExtras;
  maxSteps?: number;

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

  /** Restrict connector-action discovery to these connector names. */
  discoverConnectors?: string[];

  /** Serializable allow/ask/deny table; built into a PermissionPolicy in-sandbox. */
  permissions?: PermissionTable;

  /** Approval decisions keyed by toolCallId, supplied on resume. */
  approvals?: Record<string, 'approved' | 'denied'>;
}
