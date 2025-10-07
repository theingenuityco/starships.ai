import { TopupEntity } from '@/entities/TopupEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { TopupModel } from '@starships/protocol';
import type { PoolClient } from 'pg';

export class TopupRepository extends BaseRepository {
  constructor() {
    super('TopupRepository');
  }

  /**
   * Create a new topup record
   */
  async create(data: {
    id: string;
    walletId: string;
    amountUsd: string;
    status?: string;
    stripeSessionId?: string;
    idempotencyKey?: string;
  }): Promise<TopupModel> {
    return this.executeWithErrorHandling(
      async () => {
        if (!data?.id?.trim()) {
          throw new Error('id is required');
        }
        if (!data?.walletId?.trim()) {
          throw new Error('walletId is required');
        }
        if (!data?.amountUsd?.trim()) {
          throw new Error('amountUsd is required');
        }

        const now = new Date().toISOString();
        const topupData = {
          id: data.id,
          walletId: data.walletId,
          amountUsd: data.amountUsd,
          status: data.status ?? 'pending',
          stripeSessionId: data.stripeSessionId,
          idempotencyKey: data.idempotencyKey,
          createdAt: now,
          updatedAt: now,
        };

        await TopupEntity.validate(topupData, 'create');

        // Serialize and insert
        const entity = toEntityInstance(TopupEntity, topupData);
        const serialized = toDatabase(entity);
        const result = await this.createEntity<Record<string, unknown>>('topups', serialized);

        return fromDatabase(TopupEntity, result);
      },
      'create',
      'Topup'
    );
  }

  /**
   * Find topup by ID
   */
  async findById(id: string): Promise<TopupModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('id is required');
        }

        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>('SELECT * FROM topups WHERE id = $1', [id]);
        return row ? fromDatabase(TopupEntity, row) : null;
      },
      'findById',
      'Topup'
    );
  }

  /**
   * Find topups by wallet ID
   */
  async findByWalletId(walletId: string): Promise<TopupModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!walletId?.trim()) {
          throw new Error('walletId is required');
        }

        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>('SELECT * FROM topups WHERE wallet_id = $1 ORDER BY created_at DESC', [
          walletId,
        ]);
        return rows.map((row) => fromDatabase(TopupEntity, row));
      },
      'findByWalletId',
      'Topup'
    );
  }

  /**
   * Update Stripe session ID for a topup
   */
  async updateStripeSession(topupId: string, stripeSessionId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!topupId?.trim()) {
          throw new Error('topupId is required');
        }
        if (!stripeSessionId?.trim()) {
          throw new Error('stripeSessionId is required');
        }

        const connection = this.getConnection();
        await connection.query('UPDATE topups SET stripe_session_id = $1, updated_at = NOW() WHERE id = $2', [stripeSessionId, topupId]);
      },
      'updateStripeSession',
      'Topup'
    );
  }

  /**
   * Update topup status
   */
  async updateStatus(topupId: string, status: 'pending' | 'completed' | 'failed' | 'cancelled'): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!topupId?.trim()) {
          throw new Error('topupId is required');
        }
        if (!status) {
          throw new Error('status is required');
        }

        const connection = this.getConnection();
        await connection.query('UPDATE topups SET status = $1, updated_at = NOW() WHERE id = $2', [status, topupId]);
      },
      'updateStatus',
      'Topup'
    );
  }
  /**
   * Find topup by Stripe Checkout Session ID
   */
  async findByStripeSessionId(sessionId: string): Promise<TopupModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!sessionId?.trim()) {
          throw new Error('sessionId is required');
        }
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>('SELECT * FROM topups WHERE stripe_session_id = $1', [sessionId]);
        return row ? fromDatabase(TopupEntity, row) : null;
      },
      'findByStripeSessionId',
      'Topup'
    );
  }

  /**
   * Mark a topup as completed and set Stripe identifiers using an existing transaction client
   * Ensures atomicity with wallet balance updates.
   */
  async markCompletedWithClient(
    topupId: string,
    stripePaymentIntent: string | null,
    stripeChargeId: string | null,
    client: PoolClient
  ): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!topupId?.trim()) throw new Error('topupId is required');
        await client.query(
          `
          UPDATE topups
          SET status = 'completed',
              stripe_payment_intent = COALESCE($1, stripe_payment_intent),
              stripe_charge_id = COALESCE($2, stripe_charge_id),
              updated_at = NOW()
          WHERE id = $3
          `,
          [stripePaymentIntent, stripeChargeId, topupId]
        );
      },
      'markCompletedWithClient',
      'Topup',
      topupId
    );
  }

  /**
   * Update topup status using an existing transaction client (e.g., for failures/cancellations)
   */
  async updateStatusWithClient(
    topupId: string,
    status: 'pending' | 'completed' | 'failed' | 'cancelled',
    client: PoolClient
  ): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!topupId?.trim()) throw new Error('topupId is required');
        if (!status) throw new Error('status is required');

        await client.query('UPDATE topups SET status = $1, updated_at = NOW() WHERE id = $2', [status, topupId]);
      },
      'updateStatusWithClient',
      'Topup',
      topupId
    );
  }
  /**
   * Find topup by Stripe PaymentIntent ID
   */
  async findByStripePaymentIntent(paymentIntentId: string): Promise<TopupModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!paymentIntentId?.trim()) {
          throw new Error('paymentIntentId is required');
        }
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>('SELECT * FROM topups WHERE stripe_payment_intent = $1', [
          paymentIntentId,
        ]);
        return row ? fromDatabase(TopupEntity, row) : null;
      },
      'findByStripePaymentIntent',
      'Topup'
    );
  }
}

export default TopupRepository;
