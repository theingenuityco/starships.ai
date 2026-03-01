import { BaseRepository } from './BaseRepository';
import type { RoomPinnedAgent } from '@starships/protocol';

type DbRow = {
  room_conversation_id: string;
  agent_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
};

function fromDb(r: DbRow): RoomPinnedAgent {
  return {
    kind: 'agent',
    roomConversationId: String(r.room_conversation_id),
    agentId: String(r.agent_id),
    position: Number(r.position) || 0,
    createdAt: String(r.created_at),
    createdBy: r.created_by ?? null,
  };
}

export class RoomPinnedAgentsRepository extends BaseRepository {
  constructor() {
    super('RoomPinnedAgentsRepository');
  }

  async list(roomConversationId: string): Promise<RoomPinnedAgent[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_conversation_id, agent_id, position, created_at, created_by
           FROM room_pinned_agents
          WHERE room_conversation_id = $1
          ORDER BY position ASC, created_at ASC`,
        [roomConversationId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_pinned_agents', roomConversationId);
  }

  async upsert(args: { roomConversationId: string; agentId: string; position: number; createdBy?: string | null }): Promise<RoomPinnedAgent> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const row = await conn.queryOne<DbRow>(
        `INSERT INTO room_pinned_agents (room_conversation_id, agent_id, position, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (room_conversation_id, agent_id) DO UPDATE SET
           position = EXCLUDED.position
         RETURNING room_conversation_id, agent_id, position, created_at, created_by`,
        [args.roomConversationId, args.agentId, Math.trunc(args.position), args.createdBy ?? null]
      );
      if (!row) throw new Error('Failed to upsert pinned agent');
      return fromDb(row);
    }, 'upsert', 'room_pinned_agents');
  }

  async remove(roomConversationId: string, agentId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const result = await conn.queryWithResult(`DELETE FROM room_pinned_agents WHERE room_conversation_id = $1 AND agent_id = $2`, [
        roomConversationId,
        agentId,
      ]);
      return (result.rowCount ?? 0) > 0;
    }, 'remove', 'room_pinned_agents');
  }
}

