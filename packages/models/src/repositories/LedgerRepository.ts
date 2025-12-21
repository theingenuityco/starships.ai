import { BaseRepository } from '@/repositories/BaseRepository';
import { fromDatabase } from '@/helpers/serialization-helper';
import type { PoolClient } from 'pg';
import { nanoid } from 'nanoid';
import { LedgerEntryEntity } from '@/entities/LedgerEntryEntity';
import type { LedgerEntryModel } from '@starships/protocol';

export class LedgerRepository extends BaseRepository {
  constructor() {
    super('LedgerRepository');
  }

  /**
   * Insert a new immutable ledger entry within an existing transaction
   */
  async createWithClient(
    client: PoolClient,
    data: {
      walletId: string;
      type: 'TOPUP' | 'USAGE' | 'REFUND' | 'ADJUSTMENT';
      amount: string; // decimal string
      balanceAfter: string; // decimal string
      meta?: Record<string, unknown>;
    }
  ): Promise<LedgerEntryModel> {
    if (!data.walletId?.trim()) throw new Error('walletId is required');
    if (!data.type) throw new Error('type is required');
    if (!data.amount?.trim()) throw new Error('amount is required');
    if (!data.balanceAfter?.trim()) throw new Error('balanceAfter is required');

    const id = nanoid();

    const result = await client.query(
      `
      INSERT INTO wallet_ledger (id, wallet_id, type, amount, balance_after, meta)
      VALUES ($1, $2, $3, $4::decimal, $5::decimal, COALESCE($6::jsonb, '{}'::jsonb))
      RETURNING *
      `,
      [id, data.walletId, data.type, data.amount, data.balanceAfter, data.meta ? JSON.stringify(data.meta) : null]
    );

    return fromDatabase(LedgerEntryEntity, result.rows[0]);
  }

  /**
   * Keyset pagination by (created_at DESC, id DESC)
   */
  async listByWalletKeyset(walletId: string, limit: number, cursor?: { createdAt: string; id: string }): Promise<LedgerEntryModel[]> {
    if (!walletId?.trim()) throw new Error('walletId is required');
    const conn = this.getConnection();

    const params: unknown[] = [walletId];
    let where = 'wallet_id = $1';
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      where += ` AND ((created_at < $2) OR (created_at = $2 AND id < $3))`;
    }
    params.push(limit);

    const rows = await conn.query(
      `
      SELECT *
      FROM wallet_ledger
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
      `,
      params
    );

    return rows.map((r) => fromDatabase(LedgerEntryEntity, r));
  }
  /**
   * Count ledger entries for a wallet (for offset-based pagination metadata)
   */
  async countByWallet(walletId: string, types?: Array<'TOPUP' | 'USAGE' | 'REFUND' | 'ADJUSTMENT'>): Promise<number> {
    if (!walletId?.trim()) throw new Error('walletId is required');
    const conn = this.getConnection();

    if (types && types.length > 0) {
      const inClause = types.map((_, i) => `$${i + 2}`).join(',');
      const sql = `SELECT COUNT(*) as count FROM wallet_ledger WHERE wallet_id = $1 AND type IN (${inClause})`;
      const result = await conn.queryOne<{ count: string }>(sql, [walletId, ...types]);
      return result ? parseInt(result.count, 10) : 0;
    }

    const result = await conn.queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM wallet_ledger WHERE wallet_id = $1`, [walletId]);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Offset-based pagination for a wallet ledger, ordered by created_at,id
   */
  async listByWalletPage(
    walletId: string,
    limit: number,
    offset: number,
    order: 'ASC' | 'DESC',
    types?: Array<'TOPUP' | 'USAGE' | 'REFUND' | 'ADJUSTMENT'>
  ): Promise<LedgerEntryModel[]> {
    if (!walletId?.trim()) throw new Error('walletId is required');
    const conn = this.getConnection();

    // Order is constrained by type to prevent SQL injection
    const orderSql = order === 'ASC' ? 'ASC' : 'DESC';

    const params: unknown[] = [walletId];
    let where = 'wallet_id = $1';
    if (types && types.length > 0) {
      const placeholders = types.map((_, i) => `$${i + 2}`).join(',');
      where += ` AND type IN (${placeholders})`;
      params.push(...types);
    }
    params.push(limit, offset);

    const rows = await conn.query(
      `
      SELECT *
      FROM wallet_ledger
      WHERE ${where}
      ORDER BY created_at ${orderSql}, id ${orderSql}
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    return rows.map((r) => fromDatabase(LedgerEntryEntity, r));
  }
}

export default LedgerRepository;
