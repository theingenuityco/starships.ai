import { BaseRepository } from './BaseRepository';
import type { AgentEventModel } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';
import { nanoid } from 'nanoid';

type DbRow = {
  id: string;
  starship_id: string;
  agent_id: string;
  dispatch_id: string | null;
  card_id: string | null;
  type: string;
  payload: unknown;
  created_at: string;
};

function fromDb(r: DbRow): AgentEventModel {
  return {
    id: String(r.id),
    starshipId: String(r.starship_id),
    agentId: String(r.agent_id),
    dispatchId: r.dispatch_id ?? null,
    cardId: r.card_id ?? null,
    type: String(r.type),
    payload: (typeof r.payload === 'object' && r.payload !== null ? r.payload : {}) as Record<string, unknown>,
    createdAt: String(r.created_at),
  };
}

/** Append-only activity log (audit trail; not chat). */
export class AgentEventRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentEventRepository', connection);
  }

  async append(input: {
    starshipId: string;
    agentId: string;
    type: string;
    payload?: Record<string, unknown>;
    dispatchId?: string | null;
    cardId?: string | null;
  }): Promise<AgentEventModel> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `INSERT INTO agent_events (id, starship_id, agent_id, dispatch_id, card_id, type, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
          [nanoid(), input.starshipId, input.agentId, input.dispatchId ?? null, input.cardId ?? null, input.type, JSON.stringify(input.payload ?? {})]
        );
        if (!row) throw new Error('Failed to append agent event');
        return fromDb(row);
      },
      'append',
      'AgentEvent'
    );
  }

  async listByStarship(starshipId: string, limit = 100): Promise<AgentEventModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const rows = await this.getConnection().query<DbRow>(
          `SELECT * FROM agent_events WHERE starship_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [starshipId, limit]
        );
        return rows.map(fromDb);
      },
      'listByStarship',
      'AgentEvent'
    );
  }
}
