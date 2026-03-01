import { BaseRepository } from './BaseRepository';
import type { RoomPinnedTool } from '@starships/protocol';

type DbRow = {
  room_conversation_id: string;
  tool_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
};

function fromDb(r: DbRow): RoomPinnedTool {
  return {
    kind: 'tool',
    roomConversationId: String(r.room_conversation_id),
    toolId: String(r.tool_id),
    position: Number(r.position) || 0,
    createdAt: String(r.created_at),
    createdBy: r.created_by ?? null,
  };
}

export class RoomToolsRepository extends BaseRepository {
  constructor() {
    super('RoomToolsRepository');
  }

  async list(roomConversationId: string): Promise<RoomPinnedTool[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_conversation_id, tool_id, position, created_at, created_by
           FROM room_tools
          WHERE room_conversation_id = $1
          ORDER BY position ASC, created_at ASC`,
        [roomConversationId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_tools', roomConversationId);
  }

  async upsert(args: { roomConversationId: string; toolId: string; position: number; createdBy?: string | null }): Promise<RoomPinnedTool> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const row = await conn.queryOne<DbRow>(
        `INSERT INTO room_tools (room_conversation_id, tool_id, position, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (room_conversation_id, tool_id) DO UPDATE SET
           position = EXCLUDED.position
         RETURNING room_conversation_id, tool_id, position, created_at, created_by`,
        [args.roomConversationId, args.toolId, Math.trunc(args.position), args.createdBy ?? null]
      );
      if (!row) throw new Error('Failed to upsert room tool');
      return fromDb(row);
    }, 'upsert', 'room_tools');
  }

  async remove(roomConversationId: string, toolId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const result = await conn.queryWithResult(`DELETE FROM room_tools WHERE room_conversation_id = $1 AND tool_id = $2`, [
        roomConversationId,
        toolId,
      ]);
      return (result.rowCount ?? 0) > 0;
    }, 'remove', 'room_tools');
  }
}

