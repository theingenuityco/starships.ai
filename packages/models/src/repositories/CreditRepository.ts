/**
 * CreditRepository
 *
 * Handles user credit balances and transaction ledger
 */

import { CreditTransactionEntity } from '@/entities/CreditTransactionEntity';
import { fromDatabaseArray } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import { randomUUID } from 'crypto';

export class CreditRepository extends BaseRepository {
  constructor() {
    super('CreditRepository');
  }

  /**
   * Get user credit balance
   */
  async getBalance(userId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<{ balance: string }>(`SELECT balance FROM user_credits WHERE user_id = $1`, [userId]);
        return result ? Number(result.balance) : 0;
      },
      'getBalance',
      'UserCredit',
      userId
    );
  }

  /**
   * Ensure user has a credit balance row (initialize if missing)
   */
  async ensureBalanceRow(userId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Check if row exists
        const existing = await connection.queryOne('SELECT id FROM user_credits WHERE user_id = $1', [userId]);

        if (!existing) {
          // Create balance row with 0 balance
          await connection.query(
            `INSERT INTO user_credits (id, user_id, balance, currency, created_at, updated_at)
             VALUES ($1, $2, 0, 'USD', NOW(), NOW())`,
            [`credit_${userId}`, userId]
          );
        }
      },
      'ensureBalanceRow',
      'UserCredit',
      userId
    );
  }

  /**
   * Top up user credits via webhook (atomic)
   */
  async topup(userId: string, amount: number, stripePaymentId: string, description?: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        await connection.transaction(async (client) => {
          // Ensure balance row exists
          await client.query(
            `INSERT INTO user_credits (id, user_id, balance, currency, created_at, updated_at)
             VALUES ($1, $2, 0, 'USD', NOW(), NOW())
             ON CONFLICT (user_id) DO NOTHING`,
            [`credit_${userId}`, userId]
          );

          // Update balance
          await client.query(
            `UPDATE user_credits
             SET balance = balance + $1, updated_at = NOW()
             WHERE user_id = $2`,
            [amount, userId]
          );

          // Record transaction
          await client.query(
            `INSERT INTO credit_transactions (id, user_id, amount, type, description, stripe_payment_id, created_at)
             VALUES ($1, $2, $3, 'purchase', $4, $5, NOW())`,
            [`tx_${randomUUID()}`, userId, amount, description, stripePaymentId]
          );
        });
      },
      'topup',
      'UserCredit',
      userId
    );
  }

  /**
   * Deduct credits for usage (atomic with sufficient balance check)
   */
  async deductForUsage(userId: string, amount: number, usageId: string): Promise<{ ok: boolean; remaining: number }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        const result = await connection.queryOne<{ balance: string }>(
          `UPDATE user_credits
           SET balance = balance - $1, updated_at = NOW()
           WHERE user_id = $2 AND balance >= $1
           RETURNING balance`,
          [amount, userId]
        );

        if (result) {
          // Record transaction
          await connection.query(
            `INSERT INTO credit_transactions (id, user_id, amount, type, usage_id, created_at)
             VALUES ($1, $2, $3, 'usage', $4, NOW())`,
            [`tx_${randomUUID()}`, userId, -amount, usageId]
          );

          return { ok: true, remaining: Number(result.balance) };
        }

        // Fetch actual remaining balance when deduction fails
        const current = await connection.queryOne<{ balance: string }>(`SELECT balance FROM user_credits WHERE user_id = $1`, [userId]);
        return { ok: false, remaining: Number(current?.balance) || 0 };
      },
      'deductForUsage',
      'UserCredit',
      userId
    );
  }

  /**
   * List credit transactions for a user
   */
  async listTransactions(
    userId: string,
    options: { limit?: number; offset?: number; order?: 'ASC' | 'DESC' } = {}
  ): Promise<{ records: CreditTransactionEntity[]; total: number }> {
    return this.executeWithErrorHandling(
      async () => {
        const limit = Math.max(1, Math.min(200, options.limit ?? 20));
        const offset = Math.max(0, options.offset ?? 0);
        const order = options.order === 'ASC' ? 'ASC' : 'DESC';

        const connection = this.getConnection();

        // Get total count
        const totalResult = await connection.queryOne<{ total: string }>(
          `SELECT COUNT(*) as total FROM credit_transactions WHERE user_id = $1`,
          [userId]
        );
        const total = Number(totalResult?.total) || 0;

        // Get paginated records
        const result = await connection.query(
          `SELECT * FROM credit_transactions
           WHERE user_id = $1
           ORDER BY created_at ${order}
           LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        );

        return {
          records: fromDatabaseArray(CreditTransactionEntity, result),
          total,
        };
      },
      'listTransactions',
      'CreditTransaction',
      userId
    );
  }
}

export default CreditRepository;
