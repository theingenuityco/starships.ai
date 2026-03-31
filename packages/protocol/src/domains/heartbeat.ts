/**
 * Heartbeat Domain Types
 *
 * Represents periodic agent heartbeat configurations scoped to a room+agent
 * pair. Each room can have independent heartbeat settings per agent, and
 * heartbeat conversations appear as threads inside that room.
 */

/**
 * Heartbeat config model - database entity (1:1 with heartbeat_configs table).
 */
export interface HeartbeatConfigModel {
  id: string;
  agentId: string;
  roomConversationId: string;
  starshipId: string;
  ownerUserId: string;
  isEnabled: boolean;
  intervalMinutes: number;
  prompt: string;
  ackMaxChars: number;
  activeHoursStart?: string | null;
  activeHoursEnd?: string | null;
  activeHoursTimezone?: string | null;
  lastRunAt?: string | null;
  nextRunAt: string;
  lastRunStatus?: string | null;
  lastConversationId?: string | null;
  lastAlertText?: string | null;
  lastAlertAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request payload for creating a heartbeat config.
 */
export interface CreateHeartbeatConfigRequest {
  agentId: string;
  roomConversationId: string;
  starshipId: string;
  isEnabled?: boolean;
  intervalMinutes?: number;
  prompt?: string;
  ackMaxChars?: number;
  activeHoursStart?: string | null;
  activeHoursEnd?: string | null;
  activeHoursTimezone?: string | null;
}

/**
 * Request payload for updating a heartbeat config.
 */
export interface UpdateHeartbeatConfigRequest {
  isEnabled?: boolean;
  intervalMinutes?: number;
  prompt?: string;
  ackMaxChars?: number;
  activeHoursStart?: string | null;
  activeHoursEnd?: string | null;
  activeHoursTimezone?: string | null;
}

/**
 * Heartbeat run model - audit log entry (1:1 with heartbeat_runs table).
 */
export interface HeartbeatRunModel {
  id: string;
  heartbeatConfigId: string;
  agentId: string;
  starshipId: string;
  status: 'ran' | 'skipped' | 'failed';
  result?: string | null;
  durationMs?: number | null;
  conversationId?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

/**
 * The sentinel token agents return when nothing needs attention.
 */
export const HEARTBEAT_OK_TOKEN = 'HEARTBEAT_OK';
