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
  createdAt: string;
  updatedAt: string;
}

export type RoomPinnedResourceKind = 'view' | 'dataset' | 'task_board';

export const ROOM_PIN_KINDS: readonly RoomPinnedResourceKind[] = ['view', 'dataset', 'task_board'] as const;

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

export type RoomPin = RoomPinnedView | RoomPinnedDataset | RoomPinnedTaskBoard;

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

