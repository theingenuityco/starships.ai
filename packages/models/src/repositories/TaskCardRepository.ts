import type { TaskCardModel } from '@starships/protocol';
import { TaskCardEntity } from '@/entities/TaskCardEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export class TaskCardRepository extends BaseRepository {
  constructor() {
    super('TaskCardRepository');
  }

  async findById(id: string): Promise<TaskCardModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('task_cards', id);
        return result ? fromDatabase(TaskCardEntity, result) : null;
      },
      'findById',
      'TaskCard',
      id
    );
  }

  async listByBoard(boardId: string, opts?: { includeArchived?: boolean }): Promise<TaskCardModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const includeArchived = Boolean(opts?.includeArchived);
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>(
          includeArchived
            ? `SELECT * FROM task_cards WHERE board_id = $1 ORDER BY column_id ASC, pos ASC, created_at ASC`
            : `SELECT * FROM task_cards WHERE board_id = $1 AND archived = FALSE ORDER BY column_id ASC, pos ASC, created_at ASC`,
          [boardId]
        );
        return fromDatabaseArray(TaskCardEntity, rows);
      },
      'listByBoard',
      'TaskCard'
    );
  }

  private async computeNextPosInColumn(columnId: string): Promise<number> {
    const connection = this.getConnection();
    const row = await connection.queryOne<{ max: number | null }>(`SELECT COALESCE(MAX(pos), 0) AS max FROM task_cards WHERE column_id = $1`, [
      columnId,
    ]);
    return toFiniteNumber(row?.max, 0) + 1;
  }

  async create(data: {
    boardId: string;
    columnId: string;
    title: string;
    description?: string;
    pos?: number;
    priority?: number | null;
    assigneeAgentId?: string | null;
    assigneeUserId?: string | null;
  }): Promise<TaskCardModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const pos = typeof data.pos === 'number' && Number.isFinite(data.pos) ? data.pos : await this.computeNextPosInColumn(data.columnId);
        const cardData: TaskCardModel = {
          id: 'temp',
          boardId: data.boardId,
          columnId: data.columnId,
          title: data.title,
          description: typeof data.description === 'string' ? data.description : '',
          pos,
          priority: data.priority ?? null,
          assigneeAgentId: data.assigneeAgentId ?? null,
          assigneeUserId: data.assigneeUserId ?? null,
          archived: false,
          createdAt: now,
          updatedAt: now,
        };

        await TaskCardEntity.validate(cardData, 'create');
        const entity = toEntityInstance(TaskCardEntity, cardData as unknown as Record<string, unknown>);
        const dbFormat = toDatabase(entity);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...withoutId } = dbFormat;
        const result = await this.createEntity<Record<string, unknown>>('task_cards', withoutId);
        return fromDatabase(TaskCardEntity, result);
      },
      'create',
      'TaskCard'
    );
  }

  async update(id: string, updates: Partial<TaskCardModel>): Promise<TaskCardModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        await TaskCardEntity.validate(updates, 'update');
        const entity = toEntityInstance(TaskCardEntity, updates as unknown as Record<string, unknown>);
        const dbFormat = toDatabase(entity);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, board_id: _boardId, ...filtered } = dbFormat;
        if (Object.keys(filtered).length === 0) return await this.findById(id);
        const result = await this.updateEntity<Record<string, unknown>>('task_cards', id, filtered);
        return result ? fromDatabase(TaskCardEntity, result) : null;
      },
      'update',
      'TaskCard',
      id
    );
  }

  async move(id: string, move: { toColumnId: string; toPos?: number }): Promise<TaskCardModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const pos = typeof move.toPos === 'number' && Number.isFinite(move.toPos) ? move.toPos : await this.computeNextPosInColumn(move.toColumnId);
        return await this.update(id, { columnId: move.toColumnId, pos });
      },
      'move',
      'TaskCard',
      id
    );
  }

  async archive(id: string): Promise<TaskCardModel | null> {
    return this.update(id, { archived: true });
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return this.deleteEntity('task_cards', id);
      },
      'delete',
      'TaskCard',
      id
    );
  }
}

export default TaskCardRepository;

