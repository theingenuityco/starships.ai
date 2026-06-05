/**
 * Agent connectivity + dispatch types.
 *
 * Supporting types for external agents connecting to a starship: device/presence
 * records, connection tokens, the command-dispatch envelope, and the append-only
 * activity log.
 */

export type AgentConnectionStatus = 'online' | 'busy' | 'idle' | 'offline';

export interface AgentDeviceModel {
  id: string;
  agentId: string;
  deviceLabel?: string | null;
  platform?: string | null;
  lastSeenAt?: string | null;
  connectionStatus: AgentConnectionStatus;
  createdAt: string;
}

/**
 * A connection token for an external agent. The raw secret (`sk-ship-…`) is
 * shown once at mint time; only its sha256 hash is stored.
 */
export interface AgentTokenModel {
  id: string;
  agentId: string;
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

export type DispatchDeliveryStatus = 'dispatched' | 'delivered' | 'failed';
export type DispatchAckStatus = 'pending' | 'acked' | 'done' | 'cancelled';

/**
 * A command dispatched to an agent. May reference a task card when the work is
 * human-visible, or carry a free-form payload for ad-hoc commands.
 */
export interface AgentDispatchModel {
  id: string;
  starshipId: string;
  agentId: string;
  cardId?: string | null;
  /** Set when this dispatch was created by a recurring heartbeat (see AgentHeartbeatModel). */
  heartbeatId?: string | null;
  commandType: string;
  payload: Record<string, unknown>;
  deliveryStatus: DispatchDeliveryStatus;
  ackStatus: DispatchAckStatus;
  createdAt: string;
  ackedAt?: string | null;
  completedAt?: string | null;
}

/**
 * A recurring heartbeat that periodically dispatches a command to an agent. The
 * server's in-process scheduler fires each enabled heartbeat every
 * `intervalSeconds`, creating an `AgentDispatchModel` the agent picks up on its
 * next `pull_commands`.
 */
export interface AgentHeartbeatModel {
  id: string;
  starshipId: string;
  agentId: string;
  name?: string | null;
  /** Command type stamped on each dispatch this heartbeat creates. */
  commandType: string;
  /** Payload stamped on each dispatch this heartbeat creates. */
  payload: Record<string, unknown>;
  /** How often to fire, in seconds. */
  intervalSeconds: number;
  enabled: boolean;
  lastFiredAt?: string | null;
  nextFireAt: string;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Append-only activity record (the audit trail; not chat). */
export interface AgentEventModel {
  id: string;
  starshipId: string;
  agentId: string;
  dispatchId?: string | null;
  cardId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
