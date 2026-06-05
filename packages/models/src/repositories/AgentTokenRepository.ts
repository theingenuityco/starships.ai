import { BaseRepository } from './BaseRepository';
import type { AgentTokenModel } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';
import { nanoid } from 'nanoid';

type DbRow = {
  id: string;
  agent_id: string;
  starship_id: string;
  token_hash: string;
  name: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
};

function fromDb(r: DbRow): AgentTokenModel {
  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    starshipId: String(r.starship_id),
    tokenHash: String(r.token_hash),
    name: r.name ?? null,
    lastUsedAt: r.last_used_at ?? null,
    expiresAt: r.expires_at ?? null,
    revokedAt: r.revoked_at ?? null,
    createdByUserId: r.created_by_user_id ?? null,
    createdAt: String(r.created_at),
  };
}

export class AgentTokenRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentTokenRepository', connection);
  }

  /** Store a minted token (only the sha256 hash; the secret is shown once by the caller). */
  async create(input: {
    agentId: string;
    starshipId: string;
    tokenHash: string;
    name?: string | null;
    expiresAt?: string | null;
    createdByUserId?: string | null;
  }): Promise<AgentTokenModel> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const row = await conn.queryOne<DbRow>(
          `INSERT INTO agent_tokens (id, agent_id, starship_id, token_hash, name, expires_at, created_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [nanoid(), input.agentId, input.starshipId, input.tokenHash, input.name ?? null, input.expiresAt ?? null, input.createdByUserId ?? null]
        );
        if (!row) throw new Error('Failed to create agent token');
        return fromDb(row);
      },
      'create',
      'AgentToken'
    );
  }

  /** Resolve an active (non-revoked, non-expired) token by its hash. */
  async findActiveByHash(tokenHash: string): Promise<AgentTokenModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const row = await conn.queryOne<DbRow>(
          `SELECT * FROM agent_tokens
            WHERE token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
          [tokenHash]
        );
        return row ? fromDb(row) : null;
      },
      'findActiveByHash',
      'AgentToken'
    );
  }

  async findById(id: string): Promise<AgentTokenModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(`SELECT * FROM agent_tokens WHERE id = $1`, [id]);
        return row ? fromDb(row) : null;
      },
      'findById',
      'AgentToken',
      id
    );
  }

  async listByStarship(starshipId: string): Promise<AgentTokenModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const rows = await conn.query<DbRow>(`SELECT * FROM agent_tokens WHERE starship_id = $1 ORDER BY created_at DESC`, [starshipId]);
        return rows.map(fromDb);
      },
      'listByStarship',
      'AgentToken'
    );
  }

  async touchLastUsed(id: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        await this.getConnection().query(`UPDATE agent_tokens SET last_used_at = NOW() WHERE id = $1`, [id]);
      },
      'touchLastUsed',
      'AgentToken',
      id
    );
  }

  async revoke(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await this.getConnection().query(`UPDATE agent_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`, [id]);
        return (result as unknown as { rowCount?: number })?.rowCount !== 0;
      },
      'revoke',
      'AgentToken',
      id
    );
  }
}
