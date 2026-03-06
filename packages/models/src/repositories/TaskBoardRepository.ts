import type { TaskBoardModel } from '@starships/protocol';
import { TaskBoardEntity } from '@/entities/TaskBoardEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import type { PostgresConnection } from '@/helpers/database';

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export class TaskBoardRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('TaskBoardRepository', connection);
  }

  async findById(id: string): Promise<TaskBoardModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('task_boards', id);
        return result ? fromDatabase(TaskBoardEntity, result) : null;
      },
      'findById',
      'TaskBoard',
      id
    );
  }

  async findBySlug(slug: string, starshipId: string): Promise<TaskBoardModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rec = await connection.queryOne<Record<string, unknown>>(
          `SELECT * FROM task_boards WHERE starship_id = $1 AND slug = $2 LIMIT 1`,
          [starshipId, slug]
        );
        return rec ? fromDatabase(TaskBoardEntity, rec) : null;
      },
      'findBySlug',
      'TaskBoard',
      slug
    );
  }

  async listByStarship(starshipId: string, opts?: { includeArchived?: boolean }): Promise<TaskBoardModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const includeArchived = Boolean(opts?.includeArchived);
        const connection = this.getConnection();
        const recs = await connection.query<Record<string, unknown>>(
          includeArchived
            ? `SELECT * FROM task_boards WHERE starship_id = $1 ORDER BY pos ASC, created_at ASC`
            : `SELECT * FROM task_boards WHERE starship_id = $1 AND archived = FALSE ORDER BY pos ASC, created_at ASC`,
          [starshipId]
        );
        return fromDatabaseArray(TaskBoardEntity, recs);
      },
      'listByStarship',
      'TaskBoard'
    );
  }

  private async computeNextPosForStarship(starshipId: string): Promise<number> {
    const connection = this.getConnection();
    const row = await connection.queryOne<{ max: number | null }>(
      `SELECT COALESCE(MAX(pos), 0) AS max FROM task_boards WHERE starship_id = $1`,
      [starshipId]
    );
    return toFiniteNumber(row?.max, 0) + 1;
  }

  async create(data: { starshipId: string; name: string; slug?: string; description?: string; pos?: number }): Promise<TaskBoardModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const slug = data.slug
          ? String(data.slug)
          : await generateUniqueSlugIncremental(
              String(data.name || 'board'),
              async (candidate: string) => Boolean(await this.findBySlug(candidate, data.starshipId)),
              { fallbackBase: 'board', maxLength: 100 }
            );

        const pos =
          typeof data.pos === 'number' && Number.isFinite(data.pos) ? data.pos : await this.computeNextPosForStarship(data.starshipId);

        const boardData: TaskBoardModel = {
          id: 'temp',
          starshipId: data.starshipId,
          name: data.name,
          slug,
          description: typeof data.description === 'string' ? data.description : '',
          pos,
          archived: false,
          createdAt: now,
          updatedAt: now,
        };

        await TaskBoardEntity.validate(boardData, 'create');

        const entity = toEntityInstance(TaskBoardEntity, boardData as unknown as Record<string, unknown>);
        const dbFormat = toDatabase(entity);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...withoutId } = dbFormat;
        const result = await this.createEntity<Record<string, unknown>>('task_boards', withoutId);
        return fromDatabase(TaskBoardEntity, result);
      },
      'create',
      'TaskBoard'
    );
  }

  async update(id: string, updates: Partial<TaskBoardModel>): Promise<TaskBoardModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        await TaskBoardEntity.validate(updates, 'update');
        const entity = toEntityInstance(TaskBoardEntity, updates as unknown as Record<string, unknown>);
        const dbFormat = toDatabase(entity);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, starship_id: _starshipId, ...filtered } = dbFormat;
        if (Object.keys(filtered).length === 0) return await this.findById(id);

        const result = await this.updateEntity<Record<string, unknown>>('task_boards', id, filtered);
        return result ? fromDatabase(TaskBoardEntity, result) : null;
      },
      'update',
      'TaskBoard',
      id
    );
  }

  async archive(id: string): Promise<TaskBoardModel | null> {
    return this.update(id, { archived: true });
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return this.deleteEntity('task_boards', id);
      },
      'delete',
      'TaskBoard',
      id
    );
  }
}

export default TaskBoardRepository;
