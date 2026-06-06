import { BaseRepository } from './BaseRepository';
import type { AgentRuntimeEventModel } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';
import { nanoid } from 'nanoid';

type DbRow = {
  id: string;
  starship_id: string;
  persona_id: string | null;
  runtime_id: string | null;
  dispatch_id: string | null;
  card_id: string | null;
  type: string;
  payload: unknown;
  created_at: string;
};

function fromDb(r: DbRow): AgentRuntimeEventModel {
  return {
    id: String(r.id),
    starshipId: String(r.starship_id),
    personaId: r.persona_id ?? null,
    runtimeId: r.runtime_id ?? null,
    dispatchId: r.dispatch_id ?? null,
    cardId: r.card_id ?? null,
    type: String(r.type),
    payload: (typeof r.payload === 'object' && r.payload !== null ? r.payload : {}) as Record<string, unknown>,
    createdAt: String(r.created_at),
  };
}

/** Append-only activity log (audit trail; not chat). Attributed to a persona (actor) and runtime (engine). */
export class AgentRuntimeEventRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentRuntimeEventRepository', connection);
  }

  async append(input: {
    starshipId: string;
    personaId?: string | null;
    runtimeId?: string | null;
    type: string;
    payload?: Record<string, unknown>;
    dispatchId?: string | null;
    cardId?: string | null;
  }): Promise<AgentRuntimeEventModel> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `INSERT INTO agent_runtime_events (id, starship_id, persona_id, runtime_id, dispatch_id, card_id, type, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
          [
            nanoid(),
            input.starshipId,
            input.personaId ?? null,
            input.runtimeId ?? null,
            input.dispatchId ?? null,
            input.cardId ?? null,
            input.type,
            JSON.stringify(input.payload ?? {}),
          ]
        );
        if (!row) throw new Error('Failed to append agent runtime event');
        return fromDb(row);
      },
      'append',
      'AgentRuntimeEvent'
    );
  }

  async listByStarship(starshipId: string, limit = 100): Promise<AgentRuntimeEventModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const rows = await this.getConnection().query<DbRow>(
          `SELECT * FROM agent_runtime_events WHERE starship_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [starshipId, limit]
        );
        return rows.map(fromDb);
      },
      'listByStarship',
      'AgentRuntimeEvent'
    );
  }

  /** Activity timeline for a single persona (the actor view). */
  async listByPersona(personaId: string, limit = 100): Promise<AgentRuntimeEventModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const rows = await this.getConnection().query<DbRow>(
          `SELECT * FROM agent_runtime_events WHERE persona_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [personaId, limit]
        );
        return rows.map(fromDb);
      },
      'listByPersona',
      'AgentRuntimeEvent'
    );
  }
}
