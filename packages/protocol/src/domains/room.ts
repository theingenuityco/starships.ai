/**
 * Room Domain Types
 *
 * Rooms are organizational containers within a starship: they group structured
 * Tables, Goals (task boards), and Docs. A room has its own identity (`id`) and
 * is no longer backed by a conversation.
 */

export interface Room {
  slug: string;
  name: string;
  isPrivate: boolean;
  topic?: string | null;
}

export interface RoomModel extends Room {
  id: string;
  starshipId: string;
  createdAt: string;
  updatedAt: string;
}

export type RoomPinnedResourceKind = 'table' | 'task_board' | 'doc';

export const ROOM_PIN_KINDS: readonly RoomPinnedResourceKind[] = ['table', 'task_board', 'doc'] as const;

export interface RoomPinBase {
  roomId: string;
  position: number;
  createdAt: string;
  createdBy?: string | null;
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

export type RoomPin = RoomPinnedTable | RoomPinnedTaskBoard | RoomPinnedDoc;
