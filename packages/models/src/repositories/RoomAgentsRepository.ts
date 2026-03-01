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
      const roomConversationId = String(args.roomConversationId || '').trim();
      const agentId = String(args.agentId || '').trim();
      const createdBy = args.createdBy ?? null;
      const requestedPosition = typeof args.position === 'number' ? Math.max(0, Math.trunc(args.position)) : null;

      await conn.query('BEGIN');
      try {
        // Serialize pin mutations for this room+table to prevent duplicate positions under concurrency.
        await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room_agents:${roomConversationId}`]);

        const existing = await conn.queryOne<{ position: number }>(
          `SELECT position FROM room_agents WHERE room_conversation_id = $1 AND agent_id = $2`,
          [roomConversationId, agentId]
        );

        // Idempotent: if already pinned and no position was requested, keep existing position.
        if (existing && requestedPosition == null) {
          const row = await conn.queryOne<DbRow>(
            `SELECT room_conversation_id, agent_id, position, created_at, created_by
               FROM room_agents
              WHERE room_conversation_id = $1 AND agent_id = $2`,
            [roomConversationId, agentId]
          );
          if (!row) throw new Error('Failed to upsert room agent');
          await conn.query('COMMIT');
          return fromDb(row);
        }

        if (!existing) {
          // Insert (optionally at a specific position).
          const desired =
            requestedPosition != null
              ? requestedPosition
              : Number(
                  (
                    await conn.queryOne<{ next_pos: number }>(
                      `SELECT COALESCE(MAX(position) + 1, 0) AS next_pos
                         FROM room_agents
                        WHERE room_conversation_id = $1`,
                      [roomConversationId]
                    )
                  )?.next_pos ?? 0
                );

          // Make space if inserting into the middle.
          await conn.query(
            `UPDATE room_agents
                SET position = position + 1
              WHERE room_conversation_id = $1
                AND position >= $2`,
            [roomConversationId, desired]
          );

          const inserted = await conn.queryOne<DbRow>(
            `INSERT INTO room_agents (room_conversation_id, agent_id, position, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING room_conversation_id, agent_id, position, created_at, created_by`,
            [roomConversationId, agentId, desired, createdBy]
          );
          if (!inserted) throw new Error('Failed to upsert room agent');
          await conn.query('COMMIT');
          return fromDb(inserted);
        }

        // Update existing position (requestedPosition is non-null here).
        const current = Number(existing.position) || 0;
        const desired = requestedPosition ?? current;

        if (desired !== current) {
          // Move this row out of the way temporarily to avoid UNIQUE(room_conversation_id, position) collisions.
          const tmpRow = await conn.queryOne<{ tmp: number }>(
            `SELECT -(COALESCE(MAX(ABS(position)), 0) + 1) AS tmp
               FROM room_agents
              WHERE room_conversation_id = $1`,
            [roomConversationId]
          );
          const tmp = Number(tmpRow?.tmp ?? -1);
          await conn.query(`UPDATE room_agents SET position = $3 WHERE room_conversation_id = $1 AND agent_id = $2`, [
            roomConversationId,
            agentId,
            tmp,
          ]);

          if (desired < current) {
            await conn.query(
              `UPDATE room_agents
                  SET position = position + 1
                WHERE room_conversation_id = $1
                  AND position >= $2
                  AND position < $3`,
              [roomConversationId, desired, current]
            );
          } else {
            await conn.query(
              `UPDATE room_agents
                  SET position = position - 1
                WHERE room_conversation_id = $1
                  AND position <= $2
                  AND position > $3`,
              [roomConversationId, desired, current]
            );
          }

          await conn.query(`UPDATE room_agents SET position = $3 WHERE room_conversation_id = $1 AND agent_id = $2`, [
            roomConversationId,
            agentId,
            desired,
          ]);
        }

        const row = await conn.queryOne<DbRow>(
          `SELECT room_conversation_id, agent_id, position, created_at, created_by
             FROM room_agents
            WHERE room_conversation_id = $1 AND agent_id = $2`,
          [roomConversationId, agentId]
        );
        if (!row) throw new Error('Failed to upsert room agent');
        await conn.query('COMMIT');
        return fromDb(row);
      } catch (e) {
        await conn.query('ROLLBACK');
        throw e;
      }
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

