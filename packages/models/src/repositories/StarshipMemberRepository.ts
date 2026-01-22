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

  async listByStarshipWithUsers(
    starshipId: string
  ): Promise<
    Array<{
      starshipId: string;
      userId: string;
      role: StarshipMemberRole;
      createdAt: string;
      createdBy: string | null;
      email: string | null;
      displayName: string | null;
      avatar: string | null;
    }>
  > {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<{
          starship_id: string;
          user_id: string;
          role: StarshipMemberRole;
          created_at: string;
          created_by: string | null;
          email: string | null;
          display_name: string | null;
          avatar: string | null;
        }>(
          `SELECT m.starship_id,
                  m.user_id,
                  m.role,
                  m.created_at,
                  m.created_by,
                  u.email,
                  u.display_name,
                  u.avatar
             FROM starship_members m
             JOIN users u ON u.id = m.user_id
            WHERE m.starship_id = $1
            ORDER BY m.created_at ASC`,
          [starshipId]
        );

        return rows.map((r) => ({
          starshipId: String(r.starship_id),
          userId: String(r.user_id),
          role: (r.role as StarshipMemberRole) || 'collaborator',
          createdAt: String(r.created_at),
          createdBy: r.created_by ?? null,
          email: r.email ?? null,
          displayName: r.display_name ?? null,
          avatar: r.avatar ?? null,
        }));
      },
      'listByStarshipWithUsers',
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

