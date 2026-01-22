import { StarshipMemberEntity, type StarshipMemberRole } from '@/entities/StarshipMemberEntity';
import { fromDatabaseArray } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';

export class StarshipMemberRepository extends BaseRepository {
  constructor() {
    super('StarshipMemberRepository');
  }

  async isMember(userId: string, starshipId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<{ ok: number }>(
          `SELECT 1 as ok
             FROM starship_members
            WHERE starship_id = $1
              AND user_id = $2
            LIMIT 1`,
          [starshipId, userId]
        );
        return Boolean(row?.ok);
      },
      'isMember',
      'starship_members'
    );
  }

  async listByStarship(starshipId: string): Promise<StarshipMemberEntity[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>(
          `SELECT starship_id, user_id, role, created_at, created_by
             FROM starship_members
            WHERE starship_id = $1
            ORDER BY created_at ASC`,
          [starshipId]
        );
        return fromDatabaseArray(StarshipMemberEntity, rows);
      },
      'listByStarship',
      'starship_members',
      starshipId
    );
  }

  /**
   * Idempotently create a membership row.
   * Returns true if inserted, false if it already existed.
   */
  async createOrIgnoreMember(args: {
    starshipId: string;
    userId: string;
    role?: StarshipMemberRole;
    createdBy?: string | null;
  }): Promise<{ created: boolean }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(
          `INSERT INTO starship_members (starship_id, user_id, role, created_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (starship_id, user_id) DO NOTHING`,
          [args.starshipId, args.userId, args.role ?? 'collaborator', args.createdBy ?? null]
        );
        const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        return { created: rowCount > 0 };
      },
      'createOrIgnoreMember',
      'starship_members'
    );
  }

  async removeMember(starshipId: string, userId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(
          `DELETE FROM starship_members
            WHERE starship_id = $1
              AND user_id = $2`,
          [starshipId, userId]
        );
        const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        return rowCount > 0;
      },
      'removeMember',
      'starship_members'
    );
  }
}

