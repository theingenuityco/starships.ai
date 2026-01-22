/**
 * Starship Invite Token Repository
 *
 * Database-backed invite token management, following the same patterns as
 * EmailVerificationTokenRepository / PasswordResetTokenRepository.
 */

import { StarshipInviteTokenEntity, type StarshipInviteRole } from '@/entities/StarshipInviteTokenEntity';
import { toDatabase } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

export class StarshipInviteTokenRepository extends BaseRepository {
  constructor() {
    super('StarshipInviteTokenRepository');
  }

  async listOutstandingByStarship(starshipId: string): Promise<
    Array<{
      invitedEmail: string;
      invitedByUserId: string | null;
      role: StarshipInviteRole;
      createdAt: string;
      expiresAt: string;
    }>
  > {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<{
          invited_email: string;
          invited_by_user_id: string | null;
          role: StarshipInviteRole;
          created_at: string;
          expires_at: string;
        }>(
          `SELECT invited_email, invited_by_user_id, role, created_at, expires_at
             FROM starship_invite_tokens
            WHERE starship_id = $1
              AND NOT consumed
              AND expires_at > NOW()
            ORDER BY created_at DESC`,
          [starshipId]
        );

        return rows.map((r) => ({
          invitedEmail: String(r.invited_email),
          invitedByUserId: r.invited_by_user_id ?? null,
          role: (r.role as StarshipInviteRole) || 'collaborator',
          createdAt: String(r.created_at),
          expiresAt: String(r.expires_at),
        }));
      },
      'listOutstandingByStarship',
      'starship_invite_tokens',
      starshipId
    );
  }

  async generateToken(
    args: {
      starshipId: string;
      invitedEmail: string;
      invitedByUserId?: string | null;
      role?: StarshipInviteRole;
      expiresAt?: string;
    },
    retryCount: number = 0
  ): Promise<{ token: string; expiresAt: string }> {
    return this.executeWithErrorHandling(
      async () => {
        if (retryCount >= 3) {
          throw new Error('Failed to generate unique starship invite token after 3 attempts');
        }

        const token = crypto.randomBytes(32).toString('hex');
        const id = nanoid();

        const entityData = StarshipInviteTokenEntity.createFromInviteData({
          starshipId: args.starshipId,
          invitedEmail: args.invitedEmail,
          invitedByUserId: args.invitedByUserId ?? null,
          role: args.role ?? 'collaborator',
          token,
          expiresAt: args.expiresAt,
        });

        await StarshipInviteTokenEntity.validate({ id, ...entityData }, 'create');

        const dbData = toDatabase({ id, ...entityData });
        const connection = this.getConnection();

        try {
          await connection.queryOne(
            `INSERT INTO starship_invite_tokens
             (id, token, starship_id, invited_email, invited_by_user_id, role, consumed, created_at, expires_at, consumed_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              dbData.id,
              dbData.token,
              dbData.starship_id,
              dbData.invited_email,
              dbData.invited_by_user_id,
              dbData.role,
              dbData.consumed,
              dbData.created_at,
              dbData.expires_at,
              dbData.consumed_at,
            ]
          );
          return { token, expiresAt: entityData.expiresAt };
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') {
            return this.generateToken(args, retryCount + 1);
          }
          throw error;
        }
      },
      'generateToken',
      'starship_invite_tokens'
    );
  }

  /**
   * Atomically validates and consumes an invite token.
   * Returns invite context on success; null if invalid/expired/consumed.
   */
  async validateAndConsumeToken(token: string): Promise<{
    starshipId: string;
    invitedEmail: string;
    invitedByUserId: string | null;
    role: StarshipInviteRole;
  } | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        return await connection.transaction(async (tx) => {
          const result = await tx.query(
            `UPDATE starship_invite_tokens
                SET consumed = true,
                    consumed_at = NOW()
              WHERE token = $1
                AND NOT consumed
                AND expires_at > NOW()
              RETURNING starship_id, invited_email, invited_by_user_id, role`,
            [token]
          );

          const row = result.rows.length > 0 ? result.rows[0] : null;
          if (!row) return null;

          return {
            starshipId: row.starship_id as string,
            invitedEmail: row.invited_email as string,
            invitedByUserId: (row.invited_by_user_id as string | null) ?? null,
            role: (row.role as StarshipInviteRole) || 'collaborator',
          };
        });
      },
      'validateAndConsumeToken',
      'starship_invite_tokens'
    );
  }

  /**
   * Atomically validates and consumes an invite token *only when the invited email matches*.
   * This prevents forwarded links from being accepted (or consumed) by other accounts.
   */
  async validateAndConsumeTokenForEmail(token: string, email: string): Promise<{
    starshipId: string;
    invitedEmail: string;
    invitedByUserId: string | null;
    role: StarshipInviteRole;
  } | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        return await connection.transaction(async (tx) => {
          const result = await tx.query(
            `UPDATE starship_invite_tokens
                SET consumed = true,
                    consumed_at = NOW()
              WHERE token = $1
                AND lower(invited_email) = lower($2)
                AND NOT consumed
                AND expires_at > NOW()
              RETURNING starship_id, invited_email, invited_by_user_id, role`,
            [token, email]
          );

          const row = result.rows.length > 0 ? result.rows[0] : null;
          if (!row) return null;

          return {
            starshipId: row.starship_id as string,
            invitedEmail: row.invited_email as string,
            invitedByUserId: (row.invited_by_user_id as string | null) ?? null,
            role: (row.role as StarshipInviteRole) || 'collaborator',
          };
        });
      },
      'validateAndConsumeTokenForEmail',
      'starship_invite_tokens'
    );
  }

  async cancelOutstandingInvitesForEmail(starshipId: string, invitedEmail: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(
          `UPDATE starship_invite_tokens
              SET consumed = true,
                  consumed_at = NOW()
            WHERE starship_id = $1
              AND lower(invited_email) = lower($2)
              AND NOT consumed
              AND expires_at > NOW()`,
          [starshipId, invitedEmail]
        );
        return (result as unknown as { rowCount?: number }).rowCount || 0;
      },
      'cancelOutstandingInvitesForEmail',
      'starship_invite_tokens'
    );
  }
}

