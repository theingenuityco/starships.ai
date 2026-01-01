import { getConnection } from '@starships/models';
import { AppError } from '@starships/errors';
import crypto from 'crypto';

/**
 * DB-backed per-starship concurrency leases.
 *
 * This enforces "max concurrent turns per starship" across multiple server replicas.
 * Leases are released at the end of a turn, and also expire automatically as a safety net.
 */
export class StarshipTurnLeaseService {
  // Safety TTL for a lease in case the server crashes mid-turn.
  // Keep this comfortably above typical long turns.
  static readonly LEASE_TTL_SECONDS = 15 * 60; // 15 minutes

  async acquire(params: { starshipId: string; conversationId: string; maxConcurrentTurns: number }): Promise<string> {
    const { starshipId, conversationId } = params;
    const max = Math.max(1, Number(params.maxConcurrentTurns) || 1);

    const connection = getConnection();
    return connection.transaction(async (client) => {
      // Cleanup expired leases for this starship
      await client.query(`DELETE FROM starship_turn_leases WHERE starship_id = $1 AND expires_at < NOW()`, [starshipId]);

      // Count active leases
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM starship_turn_leases WHERE starship_id = $1 AND expires_at >= NOW()`,
        [starshipId]
      );
      const active = Number(countRes.rows?.[0]?.count || 0);
      if (active >= max) {
        throw new AppError(
          `Starship concurrency limit exceeded. Maximum ${max} concurrent turn(s) allowed for this starship.`,
          'CONCURRENT_LIMIT_EXCEEDED',
          409,
          { details: { starshipId, maxConcurrentTurns: max, activeTurns: active } }
        );
      }

      const leaseId = crypto.randomUUID();
      await client.query(
        `
        INSERT INTO starship_turn_leases (id, starship_id, conversation_id, expires_at)
        VALUES ($1, $2, $3, NOW() + ($4::int * INTERVAL '1 second'))
        `,
        [leaseId, starshipId, conversationId, StarshipTurnLeaseService.LEASE_TTL_SECONDS]
      );
      return leaseId;
    });
  }

  async release(leaseId: string): Promise<void> {
    if (!leaseId?.trim()) return;
    const connection = getConnection();
    await connection.query(`DELETE FROM starship_turn_leases WHERE id = $1`, [leaseId]);
  }
}

export default StarshipTurnLeaseService;


