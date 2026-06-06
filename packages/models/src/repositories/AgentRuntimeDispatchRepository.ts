import { BaseRepository } from './BaseRepository';
import type { AgentRuntimeDispatchModel, DispatchAckStatus, DispatchDeliveryStatus, PersonaExecutionConfig } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';
import { nanoid } from 'nanoid';

type DbRow = {
  id: string;
  starship_id: string;
  persona_id: string;
  runtime_id: string | null;
  card_id: string | null;
  heartbeat_id: string | null;
  command_type: string;
  payload: unknown;
  persona_config: unknown;
  delivery_status: string;
  ack_status: string;
  created_at: string;
  acked_at: string | null;
  completed_at: string | null;
};

function fromDb(r: DbRow): AgentRuntimeDispatchModel {
  return {
    id: String(r.id),
    starshipId: String(r.starship_id),
    personaId: String(r.persona_id),
    runtimeId: r.runtime_id ?? null,
    cardId: r.card_id ?? null,
    heartbeatId: r.heartbeat_id ?? null,
    commandType: String(r.command_type),
    payload: (typeof r.payload === 'object' && r.payload !== null ? r.payload : {}) as Record<string, unknown>,
    persona: (typeof r.persona_config === 'object' && r.persona_config !== null ? r.persona_config : null) as PersonaExecutionConfig | null,
    deliveryStatus: String(r.delivery_status) as DispatchDeliveryStatus,
    ackStatus: String(r.ack_status) as DispatchAckStatus,
    createdAt: String(r.created_at),
    ackedAt: r.acked_at ?? null,
    completedAt: r.completed_at ?? null,
  };
}

export class AgentRuntimeDispatchRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentRuntimeDispatchRepository', connection);
  }

  async create(input: {
    starshipId: string;
    personaId: string;
    runtimeId?: string | null;
    commandType: string;
    payload?: Record<string, unknown>;
    persona?: PersonaExecutionConfig | null;
    cardId?: string | null;
    heartbeatId?: string | null;
  }): Promise<AgentRuntimeDispatchModel> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `INSERT INTO agent_runtime_dispatches (id, starship_id, persona_id, runtime_id, card_id, heartbeat_id, command_type, payload, persona_config)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING *`,
          [
            nanoid(),
            input.starshipId,
            input.personaId,
            input.runtimeId ?? null,
            input.cardId ?? null,
            input.heartbeatId ?? null,
            input.commandType,
            JSON.stringify(input.payload ?? {}),
            input.persona ? JSON.stringify(input.persona) : null,
          ]
        );
        if (!row) throw new Error('Failed to create dispatch');
        return fromDb(row);
      },
      'create',
      'AgentRuntimeDispatch'
    );
  }

  /**
   * Whether a dispatch from this heartbeat is still awaiting execution (pending
   * or acked but not yet done). The scheduler uses this to coalesce: don't pile
   * up beats while the runtime is offline or still working the last one.
   */
  async hasOutstandingForHeartbeat(heartbeatId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<{ exists: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM agent_runtime_dispatches
              WHERE heartbeat_id = $1 AND ack_status IN ('pending', 'acked')
           ) AS exists`,
          [heartbeatId]
        );
        return Boolean(row?.exists);
      },
      'hasOutstandingForHeartbeat',
      'AgentRuntimeDispatch',
      heartbeatId
    );
  }

  async findById(id: string): Promise<AgentRuntimeDispatchModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(`SELECT * FROM agent_runtime_dispatches WHERE id = $1`, [id]);
        return row ? fromDb(row) : null;
      },
      'findById',
      'AgentRuntimeDispatch',
      id
    );
  }

  /**
   * Commands a runtime has not yet acknowledged. The runtime polls for work
   * across every persona currently assigned to it (dispatches carry the runtime
   * resolved from the persona's assignment at creation time).
   */
  async listPendingForRuntime(runtimeId: string, limit = 50): Promise<AgentRuntimeDispatchModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const rows = await this.getConnection().query<DbRow>(
          `SELECT * FROM agent_runtime_dispatches
            WHERE runtime_id = $1 AND ack_status = 'pending'
            ORDER BY created_at ASC LIMIT $2`,
          [runtimeId, limit]
        );
        return rows.map(fromDb);
      },
      'listPendingForRuntime',
      'AgentRuntimeDispatch'
    );
  }

  async markAcked(id: string, runtimeId: string): Promise<AgentRuntimeDispatchModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `UPDATE agent_runtime_dispatches SET ack_status = 'acked', acked_at = NOW()
            WHERE id = $1 AND runtime_id = $2 AND ack_status = 'pending' RETURNING *`,
          [id, runtimeId]
        );
        return row ? fromDb(row) : null;
      },
      'markAcked',
      'AgentRuntimeDispatch',
      id
    );
  }

  async markDone(id: string, runtimeId: string): Promise<AgentRuntimeDispatchModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `UPDATE agent_runtime_dispatches SET ack_status = 'done', completed_at = NOW()
            WHERE id = $1 AND runtime_id = $2 RETURNING *`,
          [id, runtimeId]
        );
        return row ? fromDb(row) : null;
      },
      'markDone',
      'AgentRuntimeDispatch',
      id
    );
  }
}
