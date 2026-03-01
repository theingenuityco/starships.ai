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

export class RoomAgentsRepository extends BaseRepository {
  constructor() {
    super('RoomAgentsRepository');
  }

  async list(roomConversationId: string): Promise<RoomPinnedAgent[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_conversation_id, agent_id, position, created_at, created_by
           FROM room_agents
          WHERE room_conversation_id = $1
          ORDER BY position ASC, created_at ASC`,
        [roomConversationId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_agents', roomConversationId);
  }

  async upsert(args: { roomConversationId: string; agentId: string; position?: number | null; createdBy?: string | null }): Promise<RoomPinnedAgent> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const row = await conn.queryOne<DbRow>(
        `INSERT INTO room_agents (room_conversation_id, agent_id, position, created_by)
         VALUES (
           $1,
           $2,
           COALESCE(
             $3,
             (SELECT COALESCE(MAX(position) + 1, 0) FROM room_agents WHERE room_conversation_id = $1)
           ),
           $4
         )
         ON CONFLICT (room_conversation_id, agent_id) DO UPDATE SET
          position = CASE
            WHEN $3 IS NULL THEN room_agents.position
            ELSE EXCLUDED.position
          END
         RETURNING room_conversation_id, agent_id, position, created_at, created_by`,
        [
          args.roomConversationId,
          args.agentId,
          typeof args.position === 'number' ? Math.trunc(args.position) : null,
          args.createdBy ?? null,
        ]
      );
      if (!row) throw new Error('Failed to upsert room agent');
      return fromDb(row);
    }, 'upsert', 'room_agents');
  }

  async remove(roomConversationId: string, agentId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const result = await conn.queryWithResult(`DELETE FROM room_agents WHERE room_conversation_id = $1 AND agent_id = $2`, [
        roomConversationId,
        agentId,
      ]);
      return (result.rowCount ?? 0) > 0;
    }, 'remove', 'room_agents');
  }
}

