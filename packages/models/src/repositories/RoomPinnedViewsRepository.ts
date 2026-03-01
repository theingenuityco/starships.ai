import { BaseRepository } from './BaseRepository';
import type { RoomPinnedView } from '@starships/protocol';

type DbRow = {
  room_conversation_id: string;
  view_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
};

function fromDb(r: DbRow): RoomPinnedView {
  return {
    kind: 'view',
    roomConversationId: String(r.room_conversation_id),
    viewId: String(r.view_id),
    position: Number(r.position) || 0,
    createdAt: String(r.created_at),
    createdBy: r.created_by ?? null,
  };
}

export class RoomPinnedViewsRepository extends BaseRepository {
  constructor() {
    super('RoomPinnedViewsRepository');
  }

  async list(roomConversationId: string): Promise<RoomPinnedView[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_conversation_id, view_id, position, created_at, created_by
           FROM room_pinned_views
          WHERE room_conversation_id = $1
          ORDER BY position ASC, created_at ASC`,
        [roomConversationId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_pinned_views', roomConversationId);
  }

  async upsert(args: { roomConversationId: string; viewId: string; position: number; createdBy?: string | null }): Promise<RoomPinnedView> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const row = await conn.queryOne<DbRow>(
        `INSERT INTO room_pinned_views (room_conversation_id, view_id, position, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (room_conversation_id, view_id) DO UPDATE SET
           position = EXCLUDED.position
         RETURNING room_conversation_id, view_id, position, created_at, created_by`,
        [args.roomConversationId, args.viewId, Math.trunc(args.position), args.createdBy ?? null]
      );
      if (!row) throw new Error('Failed to upsert pinned view');
      return fromDb(row);
    }, 'upsert', 'room_pinned_views');
  }

  async remove(roomConversationId: string, viewId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const result = await conn.queryWithResult(
        `DELETE FROM room_pinned_views WHERE room_conversation_id = $1 AND view_id = $2`,
        [roomConversationId, viewId]
      );
      return (result.rowCount ?? 0) > 0;
    }, 'remove', 'room_pinned_views');
  }
}

