import { BaseRepository } from './BaseRepository';
import type { RoomToolAssignment } from '@starships/protocol';

type RoomToolPermission = 'allow' | 'ask' | 'deny';

type DbRow = {
  room_conversation_id: string;
  tool_id: string;
  permission: RoomToolPermission | null;
  created_at: string;
  updated_at: string;
};

function fromDb(r: DbRow): RoomToolAssignment {
  if (r.permission !== 'allow' && r.permission !== 'ask' && r.permission !== 'deny') {
    throw new Error('Room tool assignment is missing a valid permission');
  }
  return {
    roomConversationId: String(r.room_conversation_id),
    toolId: String(r.tool_id),
    permission: r.permission,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export class RoomToolsRepository extends BaseRepository {
  constructor() {
    super('RoomToolsRepository');
  }

  async list(roomConversationId: string): Promise<RoomToolAssignment[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_conversation_id, tool_id, permission, created_at, updated_at
           FROM room_tools
          WHERE room_conversation_id = $1
          ORDER BY created_at ASC`,
        [roomConversationId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_tools', roomConversationId);
  }

  async upsert(args: { roomConversationId: string; toolId: string; permission: RoomToolPermission }): Promise<RoomToolAssignment> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const roomConversationId = String(args.roomConversationId || '').trim();
      const toolId = String(args.toolId || '').trim();
      const requestedPermission = args.permission;
      if (requestedPermission !== 'allow' && requestedPermission !== 'ask' && requestedPermission !== 'deny') {
        throw new Error('Room tool permission must be explicit');
      }
      const row = await conn.queryOne<DbRow>(
        `
        INSERT INTO room_tools (room_conversation_id, tool_id, permission, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (room_conversation_id, tool_id)
        DO UPDATE SET permission = EXCLUDED.permission, updated_at = NOW()
        RETURNING room_conversation_id, tool_id, permission, created_at, updated_at
        `,
        [roomConversationId, toolId, requestedPermission]
      );
      if (!row) throw new Error('Failed to upsert room tool assignment');
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

