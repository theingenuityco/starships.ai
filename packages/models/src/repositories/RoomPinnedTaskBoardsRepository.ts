import { BaseRepository } from './BaseRepository';
import type { RoomPinnedTaskBoard } from '@starships/protocol';

type DbRow = {
  room_conversation_id: string;
  board_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
};

function fromDb(r: DbRow): RoomPinnedTaskBoard {
  return {
    kind: 'task_board',
    roomConversationId: String(r.room_conversation_id),
    boardId: String(r.board_id),
    position: Number(r.position) || 0,
    createdAt: String(r.created_at),
    createdBy: r.created_by ?? null,
  };
}

export class RoomPinnedTaskBoardsRepository extends BaseRepository {
  constructor() {
    super('RoomPinnedTaskBoardsRepository');
  }

  async list(roomConversationId: string): Promise<RoomPinnedTaskBoard[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_conversation_id, board_id, position, created_at, created_by
           FROM room_pinned_task_boards
          WHERE room_conversation_id = $1
          ORDER BY position ASC, created_at ASC`,
        [roomConversationId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_pinned_task_boards', roomConversationId);
  }

  async upsert(args: { roomConversationId: string; boardId: string; position: number; createdBy?: string | null }): Promise<RoomPinnedTaskBoard> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const row = await conn.queryOne<DbRow>(
        `INSERT INTO room_pinned_task_boards (room_conversation_id, board_id, position, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (room_conversation_id, board_id) DO UPDATE SET
           position = EXCLUDED.position
         RETURNING room_conversation_id, board_id, position, created_at, created_by`,
        [args.roomConversationId, args.boardId, Math.trunc(args.position), args.createdBy ?? null]
      );
      if (!row) throw new Error('Failed to upsert pinned task board');
      return fromDb(row);
    }, 'upsert', 'room_pinned_task_boards');
  }

  async remove(roomConversationId: string, boardId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const result = await conn.queryWithResult(
        `DELETE FROM room_pinned_task_boards WHERE room_conversation_id = $1 AND board_id = $2`,
        [roomConversationId, boardId]
      );
      return (result.rowCount ?? 0) > 0;
    }, 'remove', 'room_pinned_task_boards');
  }
}

