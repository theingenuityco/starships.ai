import { HeartbeatConfigEntity } from '@/entities/HeartbeatConfigEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import type { HeartbeatConfigModel } from '@starships/protocol';

/**
 * HeartbeatConfigRepository
 *
 * Persists per-room-agent heartbeat configurations with scheduling state.
 * Follows the same claim-based at-most-once pattern as ScheduleRepository.
 */
export class HeartbeatConfigRepository extends BaseRepository {
  constructor() {
    super('HeartbeatConfigRepository');
  }

  async findById(id: string): Promise<HeartbeatConfigModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('heartbeat_configs', id);
        return result ? fromDatabase(HeartbeatConfigEntity, result) : null;
      },
      'findById',
      'HeartbeatConfig',
      id
    );
  }

  async findByRoomAndAgent(roomConversationId: string, agentId: string): Promise<HeartbeatConfigModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          `SELECT * FROM heartbeat_configs WHERE room_conversation_id = $1 AND agent_id = $2`,
          [roomConversationId, agentId]
        );
        return result ? fromDatabase(HeartbeatConfigEntity, result) : null;
      },
      'findByRoomAndAgent',
      'HeartbeatConfig'
    );
  }

  async findByRoom(roomConversationId: string): Promise<HeartbeatConfigModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM heartbeat_configs WHERE room_conversation_id = $1 ORDER BY created_at ASC`,
          [roomConversationId]
        );
        return fromDatabaseArray(HeartbeatConfigEntity, result);
      },
      'findByRoom',
      'HeartbeatConfig'
    );
  }

  async findByStarship(starshipId: string): Promise<HeartbeatConfigModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM heartbeat_configs WHERE starship_id = $1 ORDER BY created_at ASC`,
          [starshipId]
        );
        return fromDatabaseArray(HeartbeatConfigEntity, result);
      },
      'findByStarship',
      'HeartbeatConfig'
    );
  }

  async create(data: {
    agentId: string;
    roomConversationId: string;
    starshipId: string;
    ownerUserId: string;
    isEnabled?: boolean;
    intervalMinutes?: number;
    prompt?: string;
    ackMaxChars?: number;
    activeHoursStart?: string | null;
    activeHoursEnd?: string | null;
    activeHoursTimezone?: string | null;
  }): Promise<HeartbeatConfigModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date();
        const nowIso = now.toISOString();
        const intervalMinutes = data.intervalMinutes ?? 30;
        const nextRunAt = new Date(now.getTime() + intervalMinutes * 60 * 1000).toISOString();

        const configData = {
          agentId: data.agentId,
          roomConversationId: data.roomConversationId,
          starshipId: data.starshipId,
          ownerUserId: data.ownerUserId,
          isEnabled: data.isEnabled ?? true,
          intervalMinutes,
          prompt: data.prompt ?? 'Check if everything is running smoothly. If all is well, reply HEARTBEAT_OK. Otherwise, describe any issues.',
          ackMaxChars: data.ackMaxChars ?? 300,
          activeHoursStart: data.activeHoursStart ?? null,
          activeHoursEnd: data.activeHoursEnd ?? null,
          activeHoursTimezone: data.activeHoursTimezone ?? null,
          lastRunAt: null,
          nextRunAt,
          lastRunStatus: null,
          lastConversationId: null,
          lastAlertText: null,
          lastAlertAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        await HeartbeatConfigEntity.validate(configData, 'create');

        const entity = toEntityInstance(HeartbeatConfigEntity, configData);
        const dbFormat = toDatabase(entity);
        const result = await this.createEntity<Record<string, unknown>>('heartbeat_configs', dbFormat);

        return fromDatabase(HeartbeatConfigEntity, result);
      },
      'create',
      'HeartbeatConfig'
    );
  }

  async update(id: string, updates: Partial<HeartbeatConfigModel>): Promise<HeartbeatConfigModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        await HeartbeatConfigEntity.validate(updates, 'update');

        const entity = toEntityInstance(HeartbeatConfigEntity, updates);
        const dbFormat = toDatabase(entity);

        const readOnlyKeys = new Set(['id', 'created_at', 'starship_id', 'agent_id', 'room_conversation_id']);
        const providedKeys = new Set(
          Object.keys(updates).map((k) => k.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`))
        );

        const filtered: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(dbFormat)) {
          if (!readOnlyKeys.has(key) && providedKeys.has(key)) {
            filtered[key] = value;
          }
        }

        if (Object.keys(filtered).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('heartbeat_configs', id, filtered);
        return result ? fromDatabase(HeartbeatConfigEntity, result) : null;
      },
      'update',
      'HeartbeatConfig',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return this.deleteEntity('heartbeat_configs', id);
      },
      'delete',
      'HeartbeatConfig',
      id
    );
  }

  async findDue(now: Date, limit: number): Promise<HeartbeatConfigModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM heartbeat_configs
           WHERE is_enabled = TRUE
             AND next_run_at <= $1
           ORDER BY next_run_at ASC
           LIMIT $2`,
          [now.toISOString(), limit]
        );

        return fromDatabaseArray(HeartbeatConfigEntity, result);
      },
      'findDue',
      'HeartbeatConfig'
    );
  }

  /**
   * Atomically claim a due heartbeat config for processing.
   * Sets last_run_at and advances next_run_at in a single UPDATE
   * to ensure at-most-once processing across concurrent pollers.
   */
  async claimDueHeartbeat(id: string, now: Date, intervalMinutes: number): Promise<HeartbeatConfigModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const nextRunAt = new Date(now.getTime() + intervalMinutes * 60 * 1000).toISOString();
        const result = await connection.queryOne<Record<string, unknown>>(
          `UPDATE heartbeat_configs
           SET last_run_at = $2,
               next_run_at = $3,
               updated_at = $2
           WHERE id = $1
             AND is_enabled = TRUE
             AND next_run_at <= $2
           RETURNING *`,
          [id, now.toISOString(), nextRunAt]
        );

        return result ? fromDatabase(HeartbeatConfigEntity, result) : null;
      },
      'claimDueHeartbeat',
      'HeartbeatConfig',
      id
    );
  }
}

export default HeartbeatConfigRepository;
