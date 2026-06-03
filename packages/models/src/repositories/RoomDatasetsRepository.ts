import { BaseRepository } from './BaseRepository';
import type { RoomPinnedDataset } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';

// Backed by the `room_tables` join table (table_id), surfaced through the
// existing RoomPinnedDataset shape (datasetId) via a SELECT alias so callers
// are unaffected by the datasets -> Tables migration.
type DbRow = {
  room_conversation_id: string;
  dataset_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
};

function fromDb(r: DbRow): RoomPinnedDataset {
  return {
    kind: 'dataset',
    roomConversationId: String(r.room_conversation_id),
    datasetId: String(r.dataset_id),
    position: Number(r.position) || 0,
    createdAt: String(r.created_at),
    createdBy: r.created_by ?? null,
  };
}

export class RoomDatasetsRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('RoomDatasetsRepository', connection);
  }

  async list(roomConversationId: string): Promise<RoomPinnedDataset[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_conversation_id, table_id AS dataset_id, position, created_at, created_by
           FROM room_tables
          WHERE room_conversation_id = $1
          ORDER BY position ASC, created_at ASC`,
        [roomConversationId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_tables', roomConversationId);
  }

  async upsert(args: { roomConversationId: string; datasetId: string; position?: number | null; createdBy?: string | null }): Promise<RoomPinnedDataset> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const roomConversationId = String(args.roomConversationId || '').trim();
      const tableId = String(args.datasetId || '').trim();
      const createdBy = args.createdBy ?? null;
      const requestedPosition = typeof args.position === 'number' ? Math.max(0, Math.trunc(args.position)) : null;

      await conn.query('BEGIN');
      try {
        await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room_tables:${roomConversationId}`]);

        const existing = await conn.queryOne<{ position: number }>(
          `SELECT position FROM room_tables WHERE room_conversation_id = $1 AND table_id = $2`,
          [roomConversationId, tableId]
        );

        if (existing && requestedPosition == null) {
          const row = await conn.queryOne<DbRow>(
            `SELECT room_conversation_id, table_id AS dataset_id, position, created_at, created_by
               FROM room_tables
              WHERE room_conversation_id = $1 AND table_id = $2`,
            [roomConversationId, tableId]
          );
          if (!row) throw new Error('Failed to upsert room table');
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
                      `SELECT COALESCE(MAX(position) + 1, 0) AS next_pos
                         FROM room_tables
                        WHERE room_conversation_id = $1`,
                      [roomConversationId]
                    )
                  )?.next_pos ?? 0
                );

          await conn.query(
            `UPDATE room_tables
                SET position = position + 1
              WHERE room_conversation_id = $1
                AND position >= $2`,
            [roomConversationId, desired]
          );

          const inserted = await conn.queryOne<DbRow>(
            `INSERT INTO room_tables (room_conversation_id, table_id, position, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING room_conversation_id, table_id AS dataset_id, position, created_at, created_by`,
            [roomConversationId, tableId, desired, createdBy]
          );
          if (!inserted) throw new Error('Failed to upsert room table');
          await conn.query('COMMIT');
          return fromDb(inserted);
        }

        const current = Number(existing.position) || 0;
        const desired = requestedPosition ?? current;

        if (desired !== current) {
          const tmpRow = await conn.queryOne<{ tmp: number }>(
            `SELECT -(COALESCE(MAX(ABS(position)), 0) + 1) AS tmp
               FROM room_tables
              WHERE room_conversation_id = $1`,
            [roomConversationId]
          );
          const tmp = Number(tmpRow?.tmp ?? -1);
          await conn.query(`UPDATE room_tables SET position = $3 WHERE room_conversation_id = $1 AND table_id = $2`, [
            roomConversationId,
            tableId,
            tmp,
          ]);

          if (desired < current) {
            await conn.query(
              `UPDATE room_tables
                  SET position = position + 1
                WHERE room_conversation_id = $1
                  AND position >= $2
                  AND position < $3`,
              [roomConversationId, desired, current]
            );
          } else {
            await conn.query(
              `UPDATE room_tables
                  SET position = position - 1
                WHERE room_conversation_id = $1
                  AND position <= $2
                  AND position > $3`,
              [roomConversationId, desired, current]
            );
          }

          await conn.query(`UPDATE room_tables SET position = $3 WHERE room_conversation_id = $1 AND table_id = $2`, [
            roomConversationId,
            tableId,
            desired,
          ]);
        }

        const row = await conn.queryOne<DbRow>(
          `SELECT room_conversation_id, table_id AS dataset_id, position, created_at, created_by
             FROM room_tables
            WHERE room_conversation_id = $1 AND table_id = $2`,
          [roomConversationId, tableId]
        );
        if (!row) throw new Error('Failed to upsert room table');
        await conn.query('COMMIT');
        return fromDb(row);
      } catch (e) {
        await conn.query('ROLLBACK');
        throw e;
      }
    }, 'upsert', 'room_tables');
  }

  async remove(roomConversationId: string, datasetId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const result = await conn.queryWithResult(`DELETE FROM room_tables WHERE room_conversation_id = $1 AND table_id = $2`, [
        roomConversationId,
        datasetId,
      ]);
      return (result.rowCount ?? 0) > 0;
    }, 'remove', 'room_tables');
  }
}
