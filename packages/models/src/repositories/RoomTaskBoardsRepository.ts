import { BaseRepository } from './BaseRepository';
import type { RoomPinnedTaskBoard } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';

type DbRow = {
  room_id: string;
  board_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
};

function fromDb(r: DbRow): RoomPinnedTaskBoard {
  return {
    kind: 'task_board',
    roomId: String(r.room_id),
    boardId: String(r.board_id),
    position: Number(r.position) || 0,
    createdAt: String(r.created_at),
    createdBy: r.created_by ?? null,
  };
}

export class RoomTaskBoardsRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('RoomTaskBoardsRepository', connection);
  }

  async list(roomId: string): Promise<RoomPinnedTaskBoard[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_id, board_id, position, created_at, created_by
           FROM room_task_boards
          WHERE room_id = $1
          ORDER BY position ASC, created_at ASC`,
        [roomId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_task_boards', roomId);
  }

  async upsert(args: { roomId: string; boardId: string; position?: number | null; createdBy?: string | null }): Promise<RoomPinnedTaskBoard> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const roomId = String(args.roomId || '').trim();
      const boardId = String(args.boardId || '').trim();
      const createdBy = args.createdBy ?? null;
      const requestedPosition = typeof args.position === 'number' ? Math.max(0, Math.trunc(args.position)) : null;

      await conn.query('BEGIN');
      try {
        await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room_task_boards:${roomId}`]);

        const existing = await conn.queryOne<{ position: number }>(
          `SELECT position FROM room_task_boards WHERE room_id = $1 AND board_id = $2`,
          [roomId, boardId]
        );

        if (existing && requestedPosition == null) {
          const row = await conn.queryOne<DbRow>(
            `SELECT room_id, board_id, position, created_at, created_by
               FROM room_task_boards
              WHERE room_id = $1 AND board_id = $2`,
            [roomId, boardId]
          );
          if (!row) throw new Error('Failed to upsert room task board');
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
                         FROM room_task_boards
                        WHERE room_id = $1`,
                      [roomId]
                    )
                  )?.next_pos ?? 0
                );

          await conn.query(
            `UPDATE room_task_boards
                SET position = position + 1
              WHERE room_id = $1
                AND position >= $2`,
            [roomId, desired]
          );

          const inserted = await conn.queryOne<DbRow>(
            `INSERT INTO room_task_boards (room_id, board_id, position, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING room_id, board_id, position, created_at, created_by`,
            [roomId, boardId, desired, createdBy]
          );
          if (!inserted) throw new Error('Failed to upsert room task board');
          await conn.query('COMMIT');
          return fromDb(inserted);
        }

        const current = Number(existing.position) || 0;
        const desired = requestedPosition ?? current;

        if (desired !== current) {
          const tmpRow = await conn.queryOne<{ tmp: number }>(
            `SELECT -(COALESCE(MAX(ABS(position)), 0) + 1) AS tmp
               FROM room_task_boards
              WHERE room_id = $1`,
            [roomId]
          );
          const tmp = Number(tmpRow?.tmp ?? -1);
          await conn.query(
            `UPDATE room_task_boards SET position = $3 WHERE room_id = $1 AND board_id = $2`,
            [roomId, boardId, tmp]
          );

          if (desired < current) {
            await conn.query(
              `UPDATE room_task_boards
                  SET position = position + 1
                WHERE room_id = $1
                  AND position >= $2
                  AND position < $3`,
              [roomId, desired, current]
            );
          } else {
            await conn.query(
              `UPDATE room_task_boards
                  SET position = position - 1
                WHERE room_id = $1
                  AND position <= $2
                  AND position > $3`,
              [roomId, desired, current]
            );
          }

          await conn.query(
            `UPDATE room_task_boards SET position = $3 WHERE room_id = $1 AND board_id = $2`,
            [roomId, boardId, desired]
          );
        }

        const row = await conn.queryOne<DbRow>(
          `SELECT room_id, board_id, position, created_at, created_by
             FROM room_task_boards
            WHERE room_id = $1 AND board_id = $2`,
          [roomId, boardId]
        );
        if (!row) throw new Error('Failed to upsert room task board');
        await conn.query('COMMIT');
        return fromDb(row);
      } catch (e) {
        await conn.query('ROLLBACK');
        throw e;
      }
    }, 'upsert', 'room_task_boards');
  }

  async remove(roomId: string, boardId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const result = await conn.queryWithResult(
        `DELETE FROM room_task_boards WHERE room_id = $1 AND board_id = $2`,
        [roomId, boardId]
      );
      return (result.rowCount ?? 0) > 0;
    }, 'remove', 'room_task_boards');
  }
}

