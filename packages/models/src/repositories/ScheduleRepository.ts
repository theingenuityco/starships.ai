import { ScheduleEntity } from '@/entities/ScheduleEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import type { ScheduleModel } from '@starships/protocol';

/**
 * ScheduleRepository
 *
 * Persists scheduled agent runs that materialize as conversations.
 */
export class ScheduleRepository extends BaseRepository {
  constructor() {
    super('ScheduleRepository');
  }

  async findById(id: string): Promise<ScheduleModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('schedules', id);
        return result ? fromDatabase(ScheduleEntity, result) : null;
      },
      'findById',
      'Schedule',
      id
    );
  }

  async findByStarship(starshipId: string): Promise<ScheduleModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM schedules WHERE starship_id = $1 ORDER BY next_run_at ASC`,
          [starshipId]
        );
        return fromDatabaseArray(ScheduleEntity, result);
      },
      'findByStarship',
      'Schedule'
    );
  }

  async create(data: {
    starshipId: string;
    agentId: string;
    prompt: string;
    cronExpression: string;
    timezone: string;
    nextRunAt: string;
    isActive: boolean;
  }): Promise<ScheduleModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        const scheduleData = {
          starshipId: data.starshipId,
          agentId: data.agentId,
          prompt: data.prompt,
          cronExpression: data.cronExpression,
          timezone: data.timezone,
          nextRunAt: data.nextRunAt,
          isActive: data.isActive,
          lastRunAt: null,
          lastRunConversationId: null,
          createdAt: now,
          updatedAt: now,
        };

        await ScheduleEntity.validate(scheduleData, 'create');

        const entity = toEntityInstance(ScheduleEntity, scheduleData);
        const dbFormat = toDatabase(entity);
        const result = await this.createEntity<Record<string, unknown>>('schedules', dbFormat);

        return fromDatabase(ScheduleEntity, result);
      },
      'create',
      'Schedule'
    );
  }

  async update(id: string, updates: Partial<ScheduleModel>): Promise<ScheduleModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        await ScheduleEntity.validate(updates, 'update');

        const entity = toEntityInstance(ScheduleEntity, updates);
        const dbFormat = toDatabase(entity);

        // Strip read-only fields
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, starship_id: _starshipId, ...filtered } = dbFormat;

        if (Object.keys(filtered).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('schedules', id, filtered);
        return result ? fromDatabase(ScheduleEntity, result) : null;
      },
      'update',
      'Schedule',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return this.deleteEntity('schedules', id);
      },
      'delete',
      'Schedule',
      id
    );
  }

  /**
   * Find due schedules based on next_run_at and is_active flag.
   */
  async findDue(now: Date, limit: number): Promise<ScheduleModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM schedules
           WHERE is_active = TRUE
             AND next_run_at <= $1
           ORDER BY next_run_at ASC
           LIMIT $2`,
          [now.toISOString(), limit]
        );

        return fromDatabaseArray(ScheduleEntity, result);
      },
      'findDue',
      'Schedule'
    );
  }

  /**
   * Atomically claim a due schedule for processing.
   *
   * Hardening: ensures at-most-once processing across workers by:
   * - requiring is_active = true AND next_run_at <= now
   * - setting is_active = false and last_run_at in a single statement
   */
  async claimDueSchedule(id: string, now: Date): Promise<ScheduleModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          `UPDATE schedules
           SET is_active = FALSE,
               last_run_at = $2,
               updated_at = $2
           WHERE id = $1
             AND is_active = TRUE
             AND next_run_at <= $2
           RETURNING *`,
          [id, now.toISOString()]
        );

        return result ? fromDatabase(ScheduleEntity, result) : null;
      },
      'claimDueSchedule',
      'Schedule',
      id
    );
  }
}

export default ScheduleRepository;


