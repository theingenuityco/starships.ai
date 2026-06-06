/**
 * Agent runtime types.
 *
 * An "agent runtime" is a registered execution engine: an external agent CLI
 * (Claude Code, Codex, Hermes, OpenClaw, ...) running on a user's machine that
 * connects into a starship via the MCP server + dispatch channel. The runtime
 * is a generic engine; it has no identity or behaviour of its own. The
 * user-authored identity and behaviour live on an {@link AgentPersonaModel} that
 * is assigned to a runtime and executed by it.
 */

export type AgentRuntimeKind = 'claude-code' | 'codex' | 'hermes' | 'openclaw' | 'custom';

export type AgentConnectionStatus = 'online' | 'busy' | 'idle' | 'offline';

export interface AgentRuntimeModel {
  id: string;
  starshipId: string;
  /** Stable, URL-safe identifier derived from the runtime label. */
  slug: string;
  /** Engine label, e.g. "Claude Code · my-macbook". */
  name: string;
  /** Which external CLI this runtime wraps. */
  kind: AgentRuntimeKind;
  /** User who registered the runtime. */
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Request to register a new agent runtime (engine). */
export interface CreateAgentRuntimeRequest {
  starshipId: string;
  name: string;
  kind: AgentRuntimeKind;
}

/** Request to update a registered agent runtime. */
export interface UpdateAgentRuntimeRequest {
  name?: string;
  kind?: AgentRuntimeKind;
}

/** Presence/device record for a runtime's host machine. */
export interface AgentRuntimeDeviceModel {
  id: string;
  runtimeId: string;
  deviceLabel?: string | null;
  platform?: string | null;
  lastSeenAt?: string | null;
  connectionStatus: AgentConnectionStatus;
  createdAt: string;
}

/**
 * A connection token bound to a runtime. The raw secret (`sk-ship-…`) is shown
 * once at mint time; only its sha256 hash is stored. The token authenticates the
 * engine; the personas it hosts are resolved per dispatch.
 */
export interface AgentRuntimeTokenModel {
  id: string;
  runtimeId: string;
  starshipId: string;
  /** sha256 hex of the opaque secret. Never the secret itself. */
  tokenHash: string;
  name?: string | null;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
}
