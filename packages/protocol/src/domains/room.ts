/**
 * Room Domain Types
 *
 * Rooms are conversation-backed containers (forum-style) within a starship.
 * A room's identifier is its backing `conversationId` (references `conversations.id`).
 */

import type { AgentToolPermission } from './agent';

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

export type RoomPinnedResourceKind = 'view' | 'dataset' | 'task_board' | 'doc';

export const ROOM_PIN_KINDS: readonly RoomPinnedResourceKind[] = ['view', 'dataset', 'task_board', 'doc'] as const;

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

export interface RoomPinnedDataset extends RoomPinBase {
  kind: 'dataset';
  datasetId: string;
}

export interface RoomPinnedTaskBoard extends RoomPinBase {
  kind: 'task_board';
  boardId: string;
}

export interface RoomPinnedDoc extends RoomPinBase {
  kind: 'doc';
  docId: string;
}

export type RoomPin = RoomPinnedView | RoomPinnedDataset | RoomPinnedTaskBoard | RoomPinnedDoc;

// ============================================================================
// ROOM ↔ TOOL ASSIGNMENTS (unordered)
// ============================================================================

export interface RoomToolAssignment {
  roomConversationId: string;
  toolId: string;
  permission: AgentToolPermission;
  createdAt: string;
  updatedAt: string;
}
