import { BaseRepository } from './BaseRepository';
import type { AgentDispatchModel, DispatchAckStatus, DispatchDeliveryStatus } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';
import { nanoid } from 'nanoid';

type DbRow = {
  id: string;
  starship_id: string;
  agent_id: string;
  card_id: string | null;
  command_type: string;
  payload: unknown;
  delivery_status: string;
  ack_status: string;
  created_at: string;
  acked_at: string | null;
  completed_at: string | null;
};

function fromDb(r: DbRow): AgentDispatchModel {
  return {
    id: String(r.id),
    starshipId: String(r.starship_id),
    agentId: String(r.agent_id),
    cardId: r.card_id ?? null,
    commandType: String(r.command_type),
    payload: (typeof r.payload === 'object' && r.payload !== null ? r.payload : {}) as Record<string, unknown>,
    deliveryStatus: String(r.delivery_status) as DispatchDeliveryStatus,
    ackStatus: String(r.ack_status) as DispatchAckStatus,
    createdAt: String(r.created_at),
    ackedAt: r.acked_at ?? null,
    completedAt: r.completed_at ?? null,
  };
}

export class AgentDispatchRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentDispatchRepository', connection);
  }

  async create(input: {
    starshipId: string;
    agentId: string;
    commandType: string;
    payload?: Record<string, unknown>;
    cardId?: string | null;
  }): Promise<AgentDispatchModel> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `INSERT INTO agent_dispatches (id, starship_id, agent_id, card_id, command_type, payload)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
          [nanoid(), input.starshipId, input.agentId, input.cardId ?? null, input.commandType, JSON.stringify(input.payload ?? {})]
        );
        if (!row) throw new Error('Failed to create dispatch');
        return fromDb(row);
      },
      'create',
      'AgentDispatch'
    );
  }

  async findById(id: string): Promise<AgentDispatchModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(`SELECT * FROM agent_dispatches WHERE id = $1`, [id]);
        return row ? fromDb(row) : null;
      },
      'findById',
      'AgentDispatch',
      id
    );
  }

  /** Commands an agent has not yet acknowledged (the poll fallback to the WS push). */
  async listPendingForAgent(agentId: string, limit = 50): Promise<AgentDispatchModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const rows = await this.getConnection().query<DbRow>(
          `SELECT * FROM agent_dispatches
            WHERE agent_id = $1 AND ack_status = 'pending'
            ORDER BY created_at ASC LIMIT $2`,
          [agentId, limit]
        );
        return rows.map(fromDb);
      },
      'listPendingForAgent',
      'AgentDispatch'
    );
  }

  async markAcked(id: string, agentId: string): Promise<AgentDispatchModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `UPDATE agent_dispatches SET ack_status = 'acked', acked_at = NOW()
            WHERE id = $1 AND agent_id = $2 AND ack_status = 'pending' RETURNING *`,
          [id, agentId]
        );
        return row ? fromDb(row) : null;
      },
      'markAcked',
      'AgentDispatch',
      id
    );
  }

  async markDone(id: string, agentId: string): Promise<AgentDispatchModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `UPDATE agent_dispatches SET ack_status = 'done', completed_at = NOW()
            WHERE id = $1 AND agent_id = $2 RETURNING *`,
          [id, agentId]
        );
        return row ? fromDb(row) : null;
      },
      'markDone',
      'AgentDispatch',
      id
    );
  }
}
