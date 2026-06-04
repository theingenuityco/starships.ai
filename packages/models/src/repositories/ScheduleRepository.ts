import { ScheduleEntity } from '@/entities/ScheduleEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import type { ScheduleModel } from '@starships/protocol';
import type { ScheduleDefinition } from '@/services/definition/types';

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
    ownerUserId: string;
    prompt: string;
    cronExpression: string;
    timezone: string;
    nextRunAt: string;
    isActive: boolean;
    isRecurring?: boolean;
    endsAt?: string | null;
    maxOccurrences?: number | null;
  }): Promise<ScheduleModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        const scheduleData = {
          starshipId: data.starshipId,
          agentId: data.agentId,
          ownerUserId: data.ownerUserId,
          prompt: data.prompt,
          cronExpression: data.cronExpression,
          timezone: data.timezone,
          nextRunAt: data.nextRunAt,
          isActive: data.isActive,
          isRecurring: typeof data.isRecurring === 'boolean' ? data.isRecurring : false,
          endsAt: data.endsAt ?? null,
          maxOccurrences: data.maxOccurrences ?? null,
          runCount: 0,
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
   * Upsert the schedules INDEX row from a filesystem-authoritative definition.
   * Authored fields are refreshed; execution state (next_run_at, run_count,
   * last_run_*) and owner_user_id are preserved on conflict. On a brand-new
   * insert (a file with no existing row) next_run_at defaults to now — the
   * scheduler recomputes it for recurring schedules on the next tick.
   */
  async upsertIndexFromDefinition(input: { def: ScheduleDefinition; starshipId: string }): Promise<ScheduleModel> {
    const { def, starshipId } = input;
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const now = new Date().toISOString();
        const existing = await this.findById(def.id);

        const authored: Record<string, unknown> = {
          agent_id: def.agentId,
          prompt: def.prompt,
          cron_expression: def.cronExpression,
          timezone: def.timezone,
          is_active: def.isActive,
          is_recurring: def.isRecurring,
          ends_at: def.endsAt ?? null,
          max_occurrences: def.maxOccurrences ?? null,
        };

        const insertRow: Record<string, unknown> = {
          id: def.id,
          ...authored,
          owner_user_id: existing?.ownerUserId ?? null,
          next_run_at: existing?.nextRunAt ?? now,
          run_count: 0,
          last_run_at: null,
          last_run_conversation_id: null,
          starship_id: starshipId,
          created_at: now,
          updated_at: now,
        };

        const cols = Object.keys(insertRow);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const conflict = [...Object.keys(authored), 'updated_at'].map((c) => `${c} = EXCLUDED.${c}`).join(', ');

        const result = await connection.query<Record<string, unknown>>(
          `INSERT INTO schedules (${cols.join(', ')})
           VALUES (${placeholders.join(', ')})
           ON CONFLICT (id) DO UPDATE SET ${conflict}
           RETURNING *`,
          Object.values(insertRow)
        );
        return fromDatabase(ScheduleEntity, result[0]);
      },
      'upsertIndexFromDefinition',
      'Schedule',
      def.id
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
