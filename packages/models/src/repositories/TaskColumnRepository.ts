import type { TaskColumnModel } from '@starships/protocol';
import { TaskColumnEntity } from '@/entities/TaskColumnEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export class TaskColumnRepository extends BaseRepository {
  constructor() {
    super('TaskColumnRepository');
  }

  async findById(id: string): Promise<TaskColumnModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('task_columns', id);
        return result ? fromDatabase(TaskColumnEntity, result) : null;
      },
      'findById',
      'TaskColumn',
      id
    );
  }

  async listByBoard(boardId: string): Promise<TaskColumnModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>(
          `SELECT * FROM task_columns WHERE board_id = $1 ORDER BY pos ASC, created_at ASC`,
          [boardId]
        );
        return fromDatabaseArray(TaskColumnEntity, rows);
      },
      'listByBoard',
      'TaskColumn'
    );
  }

  async findByTitle(boardId: string, title: string): Promise<TaskColumnModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(
          `SELECT *
             FROM task_columns
            WHERE board_id = $1
              AND lower(btrim(title)) = lower(btrim($2))
            LIMIT 1`,
          [boardId, title]
        );
        return row ? fromDatabase(TaskColumnEntity, row) : null;
      },
      'findByTitle',
      'TaskColumn',
      `${boardId}:${title}`
    );
  }

  async titleExists(boardId: string, title: string, opts?: { excludeId?: string }): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const excludeId = typeof opts?.excludeId === 'string' && opts.excludeId.trim() ? opts.excludeId.trim() : null;
        const row = excludeId
          ? await connection.queryOne<{ ok: number }>(
              `SELECT 1 as ok
                 FROM task_columns
                WHERE board_id = $1
                  AND lower(btrim(title)) = lower(btrim($2))
                  AND id <> $3
                LIMIT 1`,
              [boardId, title, excludeId]
            )
          : await connection.queryOne<{ ok: number }>(
              `SELECT 1 as ok
                 FROM task_columns
                WHERE board_id = $1
                  AND lower(btrim(title)) = lower(btrim($2))
                LIMIT 1`,
              [boardId, title]
            );
        return Boolean(row?.ok);
      },
      'titleExists',
      'TaskColumn',
      `${boardId}:${title}`
    );
  }

  private async computeNextPos(boardId: string): Promise<number> {
    const connection = this.getConnection();
    const row = await connection.queryOne<{ max: number | null }>(`SELECT COALESCE(MAX(pos), 0) AS max FROM task_columns WHERE board_id = $1`, [
      boardId,
    ]);
    return toFiniteNumber(row?.max, 0) + 1;
  }

  async create(data: { boardId: string; title: string; key?: string | null; pos?: number; wipLimit?: number | null }): Promise<TaskColumnModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const pos = typeof data.pos === 'number' && Number.isFinite(data.pos) ? data.pos : await this.computeNextPos(data.boardId);
        const columnData: TaskColumnModel = {
          id: 'temp',
          boardId: data.boardId,
          title: data.title,
          key: data.key ?? null,
          pos,
          wipLimit: data.wipLimit ?? null,
          createdAt: now,
          updatedAt: now,
        };

        await TaskColumnEntity.validate(columnData, 'create');
        const entity = toEntityInstance(TaskColumnEntity, columnData as unknown as Record<string, unknown>);
        const dbFormat = toDatabase(entity);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...withoutId } = dbFormat;
        const result = await this.createEntity<Record<string, unknown>>('task_columns', withoutId);
        return fromDatabase(TaskColumnEntity, result);
      },
      'create',
      'TaskColumn'
    );
  }

  async update(id: string, updates: Partial<TaskColumnModel>): Promise<TaskColumnModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        await TaskColumnEntity.validate(updates, 'update');
        const entity = toEntityInstance(TaskColumnEntity, updates as unknown as Record<string, unknown>);
        const dbFormat = toDatabase(entity);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, board_id: _boardId, ...filtered } = dbFormat;
        if (Object.keys(filtered).length === 0) return await this.findById(id);
        const result = await this.updateEntity<Record<string, unknown>>('task_columns', id, filtered);
        return result ? fromDatabase(TaskColumnEntity, result) : null;
      },
      'update',
      'TaskColumn',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return this.deleteEntity('task_columns', id);
      },
      'delete',
      'TaskColumn',
      id
    );
  }
}

export default TaskColumnRepository;

