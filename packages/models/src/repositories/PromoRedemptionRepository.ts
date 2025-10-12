import { BaseRepository } from '@/repositories/BaseRepository';
import { fromDatabase, toDatabase } from '@/helpers/serialization-helper';
import type { PoolClient } from 'pg';
import type { PromoRedemptionModel } from '@starships/protocol';
import { PromoRedemptionEntity } from '@/entities/PromoRedemptionEntity';
import { nanoid } from 'nanoid';

export class PromoRedemptionRepository extends BaseRepository {
  constructor() {
    super('PromoRedemptionRepository');
  }

  async findByUserAndCode(userId: string, code: string): Promise<PromoRedemptionModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!userId?.trim()) throw new Error('userId is required');
        if (!code?.trim()) throw new Error('code is required');
        const conn = this.getConnection();
        const row = await conn.queryOne<Record<string, unknown>>(
          'SELECT * FROM promo_redemptions WHERE user_id = $1 AND lower(promo_code) = lower($2) LIMIT 1',
          [userId, code]
        );
        return row ? fromDatabase(PromoRedemptionEntity, row) : null;
      },
      'findByUserAndCode',
      'PromoRedemption'
    );
  }

  async createWithClient(client: PoolClient, data: Omit<PromoRedemptionModel, 'id' | 'redeemedAt'>): Promise<PromoRedemptionModel> {
    if (!data.userId?.trim()) throw new Error('userId is required');
    if (!data.promoCode?.trim()) throw new Error('promoCode is required');

    const now = new Date().toISOString();
    const id = nanoid();
    const toCreate: Record<string, unknown> = {
      userId: data.userId,
      promoCode: data.promoCode,
      stripeCouponId: data.stripeCouponId,
      stripePromotionId: data.stripePromotionId,
      rewardAmount: data.rewardAmount,
      status: data.status,
      message: data.message,
      redeemedAt: now,
    };

    await PromoRedemptionEntity.validate({ ...(toCreate as unknown as PromoRedemptionModel), id });

    const serialized = toDatabase({ id, ...(toCreate as Record<string, unknown>) });

    const cols = Object.keys(serialized);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const values = Object.values(serialized);

    const result = await client.query(
      `
      INSERT INTO promo_redemptions (${cols.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
      `,
      values
    );

    return fromDatabase(PromoRedemptionEntity, result.rows[0]);
  }

  async countSuccessfulByPromotionIdWithClient(client: PoolClient, stripePromotionId: string): Promise<number> {
    if (!stripePromotionId?.trim()) throw new Error('stripePromotionId is required');
    const res = await client.query<{ count: string }>(
      `SELECT COUNT(1) AS count
       FROM promo_redemptions
       WHERE stripe_promotion_id = $1 AND status = 'success'`,
      [stripePromotionId]
    );
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }

  async countSuccessfulByCodeWithClient(client: PoolClient, promoCode: string): Promise<number> {
    if (!promoCode?.trim()) throw new Error('promoCode is required');
    const res = await client.query<{ count: string }>(
      `SELECT COUNT(1) AS count
       FROM promo_redemptions
       WHERE lower(promo_code) = lower($1) AND status = 'success'`,
      [promoCode]
    );
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }
}

export default PromoRedemptionRepository;
