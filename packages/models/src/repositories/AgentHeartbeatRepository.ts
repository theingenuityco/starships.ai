import { BaseRepository } from './BaseRepository';
import type { AgentHeartbeatModel } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';
import { nanoid } from 'nanoid';

type DbRow = {
  id: string;
  starship_id: string;
  agent_id: string;
  name: string | null;
  command_type: string;
  payload: unknown;
  interval_seconds: number | string;
  enabled: boolean;
  last_fired_at: string | null;
  next_fire_at: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function fromDb(r: DbRow): AgentHeartbeatModel {
  return {
    id: String(r.id),
    starshipId: String(r.starship_id),
    agentId: String(r.agent_id),
    name: r.name ?? null,
    commandType: String(r.command_type),
    payload: (typeof r.payload === 'object' && r.payload !== null ? r.payload : {}) as Record<string, unknown>,
    intervalSeconds: Number(r.interval_seconds),
    enabled: Boolean(r.enabled),
    lastFiredAt: r.last_fired_at ?? null,
    nextFireAt: String(r.next_fire_at),
    createdByUserId: r.created_by_user_id ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export class AgentHeartbeatRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentHeartbeatRepository', connection);
  }

  async create(input: {
    starshipId: string;
    agentId: string;
    name?: string | null;
    commandType: string;
    payload?: Record<string, unknown>;
    intervalSeconds: number;
    enabled?: boolean;
    createdByUserId?: string | null;
  }): Promise<AgentHeartbeatModel> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          // $7 (interval_seconds column) and $10 (interval math) are passed
          // separately: reusing one param across an integer column and an
          // interval multiplication makes Postgres deduce conflicting types.
          `INSERT INTO agent_heartbeats
             (id, starship_id, agent_id, name, command_type, payload, interval_seconds, enabled, next_fire_at, created_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8, NOW() + ($10 * interval '1 second'), $9)
           RETURNING *`,
          [
            nanoid(),
            input.starshipId,
            input.agentId,
            input.name ?? null,
            input.commandType,
            JSON.stringify(input.payload ?? {}),
            input.intervalSeconds,
            input.enabled ?? true,
            input.createdByUserId ?? null,
            input.intervalSeconds,
          ]
        );
        if (!row) throw new Error('Failed to create heartbeat');
        return fromDb(row);
      },
      'create',
      'AgentHeartbeat'
    );
  }

  async findById(id: string): Promise<AgentHeartbeatModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(`SELECT * FROM agent_heartbeats WHERE id = $1`, [id]);
        return row ? fromDb(row) : null;
      },
      'findById',
      'AgentHeartbeat',
      id
    );
  }

  async listByAgent(agentId: string): Promise<AgentHeartbeatModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const rows = await this.getConnection().query<DbRow>(
          `SELECT * FROM agent_heartbeats WHERE agent_id = $1 ORDER BY created_at DESC`,
          [agentId]
        );
        return rows.map(fromDb);
      },
      'listByAgent',
      'AgentHeartbeat'
    );
  }

  /**
   * Apply a partial update. When `intervalSeconds` or `enabled` changes we also
   * recompute `next_fire_at` from now so the new cadence takes effect immediately.
   */
  async update(
    id: string,
    patch: {
      name?: string | null;
      commandType?: string;
      payload?: Record<string, unknown>;
      intervalSeconds?: number;
      enabled?: boolean;
    }
  ): Promise<AgentHeartbeatModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const sets: string[] = [];
        const values: unknown[] = [];
        let i = 1;
        if (patch.name !== undefined) {
          sets.push(`name = $${i++}`);
          values.push(patch.name);
        }
        if (patch.commandType !== undefined) {
          sets.push(`command_type = $${i++}`);
          values.push(patch.commandType);
        }
        if (patch.payload !== undefined) {
          sets.push(`payload = $${i++}::jsonb`);
          values.push(JSON.stringify(patch.payload));
        }
        if (patch.intervalSeconds !== undefined) {
          sets.push(`interval_seconds = $${i++}`);
          values.push(patch.intervalSeconds);
          sets.push(`next_fire_at = NOW() + ($${i++} * interval '1 second')`);
          values.push(patch.intervalSeconds);
        }
        if (patch.enabled !== undefined) {
          sets.push(`enabled = $${i++}`);
          values.push(patch.enabled);
          // Re-enabling should schedule the next beat from now, not the stale time.
          if (patch.enabled && patch.intervalSeconds === undefined) {
            sets.push(`next_fire_at = NOW() + (interval_seconds * interval '1 second')`);
          }
        }
        sets.push(`updated_at = NOW()`);

        const row = await this.getConnection().queryOne<DbRow>(
          `UPDATE agent_heartbeats SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
          [...values, id]
        );
        return row ? fromDb(row) : null;
      },
      'update',
      'AgentHeartbeat',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await this.getConnection().query(`DELETE FROM agent_heartbeats WHERE id = $1`, [id]);
        return (result as unknown as { rowCount?: number })?.rowCount !== 0;
      },
      'delete',
      'AgentHeartbeat',
      id
    );
  }

  /**
   * Atomically claim the heartbeats that are due to fire and advance each one's
   * `next_fire_at` a full interval out from now, all in a single transaction.
   * `FOR UPDATE SKIP LOCKED` plus the in-transaction advance means a concurrent
   * tick (or a second server instance) never re-claims the same beat, and the
   * lock is released as soon as the claim commits.
   *
   * Side effects (creating dispatches) happen after this returns: the returned
   * rows are already scheduled forward, so a failure there only drops one beat.
   */
  async claimDue(limit = 100): Promise<AgentHeartbeatModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        return this.getConnection().transaction(async (client) => {
          const { rows } = await client.query<DbRow>(
            `SELECT * FROM agent_heartbeats
              WHERE enabled AND next_fire_at <= NOW()
              ORDER BY next_fire_at ASC
              LIMIT $1
              FOR UPDATE SKIP LOCKED`,
            [limit]
          );
          if (rows.length === 0) return [];
          await client.query(
            `UPDATE agent_heartbeats
                SET last_fired_at = NOW(),
                    next_fire_at = NOW() + (interval_seconds * interval '1 second')
              WHERE id = ANY($1)`,
            [rows.map((r) => r.id)]
          );
          return rows.map(fromDb);
        });
      },
      'claimDue',
      'AgentHeartbeat'
    );
  }
}
