import { BaseRepository } from './BaseRepository';
import type { RoomPinnedDoc } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';

type DbRow = {
  room_conversation_id: string;
  doc_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
};

function fromDb(r: DbRow): RoomPinnedDoc {
  return {
    kind: 'doc',
    roomConversationId: String(r.room_conversation_id),
    docId: String(r.doc_id),
    position: Number(r.position) || 0,
    createdAt: String(r.created_at),
    createdBy: r.created_by ?? null,
  };
}

export class RoomDocsRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('RoomDocsRepository', connection);
  }

  async list(roomConversationId: string): Promise<RoomPinnedDoc[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_conversation_id, doc_id, position, created_at, created_by
           FROM room_docs
          WHERE room_conversation_id = $1
          ORDER BY position ASC, created_at ASC`,
        [roomConversationId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_docs', roomConversationId);
  }

  async upsert(args: { roomConversationId: string; docId: string; position?: number | null; createdBy?: string | null }): Promise<RoomPinnedDoc> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const roomConversationId = String(args.roomConversationId || '').trim();
      const docId = String(args.docId || '').trim();
      const createdBy = args.createdBy ?? null;
      const requestedPosition = typeof args.position === 'number' ? Math.max(0, Math.trunc(args.position)) : null;

      await conn.query('BEGIN');
      try {
        await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room_docs:${roomConversationId}`]);

        const existing = await conn.queryOne<{ position: number }>(
          `SELECT position FROM room_docs WHERE room_conversation_id = $1 AND doc_id = $2`,
          [roomConversationId, docId]
        );

        if (existing && requestedPosition == null) {
          const row = await conn.queryOne<DbRow>(
            `SELECT room_conversation_id, doc_id, position, created_at, created_by
               FROM room_docs
              WHERE room_conversation_id = $1 AND doc_id = $2`,
            [roomConversationId, docId]
          );
          if (!row) throw new Error('Failed to upsert room doc');
          await conn.query('COMMIT');
          return fromDb(row);
        }

        if (!existing) {
          const desired =
            requestedPosition != null
              ? requestedPosition
              : Number(
                  (
                    await conn.queryOne<{ next_pos: number }>(
                      `SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM room_docs WHERE room_conversation_id = $1`,
                      [roomConversationId]
                    )
                  )?.next_pos ?? 0
                );

          await conn.query(
            `UPDATE room_docs SET position = position + 1 WHERE room_conversation_id = $1 AND position >= $2`,
            [roomConversationId, desired]
          );

          const inserted = await conn.queryOne<DbRow>(
            `INSERT INTO room_docs (room_conversation_id, doc_id, position, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING room_conversation_id, doc_id, position, created_at, created_by`,
            [roomConversationId, docId, desired, createdBy]
          );
          if (!inserted) throw new Error('Failed to upsert room doc');
          await conn.query('COMMIT');
          return fromDb(inserted);
        }

        const current = Number(existing.position) || 0;
        const desired = requestedPosition ?? current;

        if (desired !== current) {
          const tmpRow = await conn.queryOne<{ tmp: number }>(
            `SELECT -(COALESCE(MAX(ABS(position)), 0) + 1) AS tmp FROM room_docs WHERE room_conversation_id = $1`,
            [roomConversationId]
          );
          const tmp = Number(tmpRow?.tmp ?? -1);
          await conn.query(`UPDATE room_docs SET position = $3 WHERE room_conversation_id = $1 AND doc_id = $2`, [
            roomConversationId,
            docId,
            tmp,
          ]);

          if (desired < current) {
            await conn.query(
              `UPDATE room_docs SET position = position + 1 WHERE room_conversation_id = $1 AND position >= $2 AND position < $3`,
              [roomConversationId, desired, current]
            );
          } else {
            await conn.query(
              `UPDATE room_docs SET position = position - 1 WHERE room_conversation_id = $1 AND position <= $2 AND position > $3`,
              [roomConversationId, desired, current]
            );
          }

          await conn.query(`UPDATE room_docs SET position = $3 WHERE room_conversation_id = $1 AND doc_id = $2`, [
            roomConversationId,
            docId,
            desired,
          ]);
        }

        const row = await conn.queryOne<DbRow>(
          `SELECT room_conversation_id, doc_id, position, created_at, created_by
             FROM room_docs
            WHERE room_conversation_id = $1 AND doc_id = $2`,
          [roomConversationId, docId]
        );
        if (!row) throw new Error('Failed to upsert room doc');
        await conn.query('COMMIT');
        return fromDb(row);
      } catch (e) {
        await conn.query('ROLLBACK');
        throw e;
      }
    }, 'upsert', 'room_docs');
  }

  async remove(roomConversationId: string, docId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const result = await conn.queryWithResult(
        `DELETE FROM room_docs WHERE room_conversation_id = $1 AND doc_id = $2`,
        [roomConversationId, docId]
      );
      return (result.rowCount ?? 0) > 0;
    }, 'remove', 'room_docs');
  }

  async reorder(roomConversationId: string, docIds: string[]): Promise<RoomPinnedDoc[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      if (docIds.length === 0) return [];

      await conn.query('BEGIN');
      try {
        await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room_docs:${roomConversationId}`]);

        // Two-pass update: first set negative temps, then set final positions
        const tmpCases = docIds.map((id, idx) => `WHEN $${idx + 2} THEN ${-(idx + 1)}`).join(' ');
        const finalCases = docIds.map((id, idx) => `WHEN $${idx + 2} THEN ${idx}`).join(' ');
        const placeholders = docIds.map((_, idx) => `$${idx + 2}`).join(', ');

        await conn.query(
          `UPDATE room_docs SET position = CASE doc_id ${tmpCases} ELSE position END WHERE room_conversation_id = $1 AND doc_id IN (${placeholders})`,
          [roomConversationId, ...docIds]
        );
        await conn.query(
          `UPDATE room_docs SET position = CASE doc_id ${finalCases} ELSE position END WHERE room_conversation_id = $1 AND doc_id IN (${placeholders})`,
          [roomConversationId, ...docIds]
        );

        await conn.query('COMMIT');
      } catch (e) {
        await conn.query('ROLLBACK');
        throw e;
      }

      return this.list(roomConversationId);
    }, 'reorder', 'room_docs');
  }
}

export default RoomDocsRepository;
