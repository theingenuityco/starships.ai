/**
 * Agent registry types.
 *
 * In the org-layer model, an "agent" is NOT an in-house execution config
 * (model/prompt/tools). It is a lightweight registry entry: an external agent
 * runtime (Claude Code, Codex, Hermes, OpenClaw, ...) that is a member of a
 * starship and connects in via the MCP server + dispatch channel. The agent's
 * runtime is entirely the user's responsibility.
 */

export type AgentKind = 'claude-code' | 'codex' | 'hermes' | 'openclaw' | 'custom';

/** Workspace access level granted to a registered agent. */
export type AgentAccessRole = 'viewer' | 'contributor';

export interface AgentModel {
  id: string;
  starshipId: string;
  /** Stable, URL-safe identifier derived from the name. */
  slug: string;
  name: string;
  /** Which external runtime this agent represents. */
  kind: AgentKind;
  /** Workspace access level (gates MCP writes). */
  accessRole: AgentAccessRole;
  description?: string;
  /** User who registered the agent. */
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to register a new agent.
 */
export interface CreateAgentRequest {
  name: string;
  kind: AgentKind;
  /** Defaults to 'contributor' when omitted. */
  accessRole?: AgentAccessRole;
  description?: string;
}

/**
 * Request to update a registered agent.
 */
export interface UpdateAgentRequest {
  name?: string;
  kind?: AgentKind;
  accessRole?: AgentAccessRole;
  description?: string;
}
