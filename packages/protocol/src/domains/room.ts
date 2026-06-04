/**
 * Room Domain Types
 *
 * Rooms are conversation-backed containers (forum-style) within a starship.
 * A room's identifier is its backing `conversationId` (references `conversations.id`).
 */

import type { ConnectorProvider } from './connector';

export interface Room {
  slug: string;
  name: string;
  isPrivate: boolean;
  topic?: string | null;
}

export interface RoomModel extends Room {
  conversationId: string;
  starshipId: string;
  /**
   * Optional room-scoped default/fallback agent.
   * When set, room conversations can route unmentioned user messages to this agent.
   */
  managerAgentId?: string | null;
  /**
   * Best-effort "last seen" timestamp for the manager agent (server-managed).
   * This is updated by runtime execution and should not be treated as a strict SLA signal.
   */
  managerAgentHeartbeatAt?: string | null;
  /**
   * Optional provenance flag recording that this room was provisioned
   * from a specific bundle (e.g. "lead-generation").
   */
  provisionedByBundle?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Connection state of one connector a room's setup requires. */
export interface RoomSetupConnectorStatus {
  provider: ConnectorProvider;
  connected: boolean;
}

/**
 * Setup state for a room that has a server-side setup handler (keyed by the room's
 * `provisionedByBundle` tag, e.g. "engineering"). Returned by GET /rooms/:id/setup-status
 * and POST /rooms/:id/setup-run. Rooms with no setup handler return null instead.
 */
export interface RoomSetupStatus {
  bundleTag: string;
  /** Required connectors and whether each is currently connected. */
  connectors: RoomSetupConnectorStatus[];
  /** All required connectors connected. */
  ready: boolean;
  /** Whether the room's data has been populated (handler-defined meaning). */
  seeded: boolean;
  /** Short human summary, e.g. "12 repositories imported". */
  summary?: string;
  details?: Record<string, unknown>;
}

export type RoomPinnedResourceKind = 'view' | 'table' | 'task_board' | 'doc';

export const ROOM_PIN_KINDS: readonly RoomPinnedResourceKind[] = ['view', 'table', 'task_board', 'doc'] as const;

export interface RoomPinBase {
  roomConversationId: string;
  position: number;
  createdAt: string;
  createdBy?: string | null;
}

export interface RoomPinnedView extends RoomPinBase {
  kind: 'view';
  viewId: string;
}

export interface RoomPinnedTable extends RoomPinBase {
  kind: 'table';
  tableId: string;
}

export interface RoomPinnedTaskBoard extends RoomPinBase {
  kind: 'task_board';
  boardId: string;
}

export interface RoomPinnedDoc extends RoomPinBase {
  kind: 'doc';
  docId: string;
}

export type RoomPin = RoomPinnedView | RoomPinnedTable | RoomPinnedTaskBoard | RoomPinnedDoc;
