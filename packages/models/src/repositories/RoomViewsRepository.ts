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

export class RoomViewsRepository extends BaseRepository {
  constructor() {
    super('RoomViewsRepository');
  }

  async list(roomConversationId: string): Promise<RoomPinnedView[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_conversation_id, view_id, position, created_at, created_by
           FROM room_views
          WHERE room_conversation_id = $1
          ORDER BY position ASC, created_at ASC`,
        [roomConversationId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_views', roomConversationId);
  }

  async upsert(args: { roomConversationId: string; viewId: string; position?: number | null; createdBy?: string | null }): Promise<RoomPinnedView> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const row = await conn.queryOne<DbRow>(
        `INSERT INTO room_views (room_conversation_id, view_id, position, created_by)
         VALUES (
           $1,
           $2,
           COALESCE(
             $3,
             (SELECT COALESCE(MAX(position) + 1, 0) FROM room_views WHERE room_conversation_id = $1)
           ),
           $4
         )
         ON CONFLICT (room_conversation_id, view_id) DO UPDATE SET
          position = CASE
            WHEN $3 IS NULL THEN room_views.position
            ELSE EXCLUDED.position
          END
         RETURNING room_conversation_id, view_id, position, created_at, created_by`,
        [
          args.roomConversationId,
          args.viewId,
          typeof args.position === 'number' ? Math.trunc(args.position) : null,
          args.createdBy ?? null,
        ]
      );
      if (!row) throw new Error('Failed to upsert room view');
      return fromDb(row);
    }, 'upsert', 'room_views');
  }

  async remove(roomConversationId: string, viewId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const result = await conn.queryWithResult(`DELETE FROM room_views WHERE room_conversation_id = $1 AND view_id = $2`, [
        roomConversationId,
        viewId,
      ]);
      return (result.rowCount ?? 0) > 0;
    }, 'remove', 'room_views');
  }
}

