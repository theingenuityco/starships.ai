import { WalletEntity } from '@/entities/WalletEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { WalletModel } from '@starships/protocol';
import type { PoolClient } from 'pg';

export class WalletRepository extends BaseRepository {
  constructor() {
    super('WalletRepository');
  }

  /**
   * Create wallet for a starship with default USD currency and 0.000000 balance
   */
  async create(data: { starshipId: string; balance?: string; currency?: 'USD' }): Promise<WalletModel> {
    return this.executeWithErrorHandling(
      async () => {
        if (!data?.starshipId?.trim()) {
          throw new Error('starshipId is required');
        }

        const now = new Date().toISOString();
        const walletData = {
          starshipId: data.starshipId,
          currency: data.currency ?? 'USD',
          balance: data.balance ?? '0.000000',
          createdAt: now,
          updatedAt: now,
        };

        await WalletEntity.validate(walletData, 'create');

        // Serialize and insert
        const entity = toEntityInstance(WalletEntity, walletData);
        const serialized = toDatabase(entity);
        const result = await this.createEntity<Record<string, unknown>>('wallets', serialized);

        return fromDatabase(WalletEntity, result);
      },
      'create',
      'Wallet'
    );
  }

  /**
   * Find wallet by starship id
   */
  async findByStarshipId(starshipId: string): Promise<WalletModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim()) {
          throw new Error('starshipId is required');
        }

        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>('SELECT * FROM wallets WHERE starship_id = $1', [starshipId]);
        return row ? fromDatabase(WalletEntity, row) : null;
      },
      'findByStarshipId',
      'Wallet'
    );
  }
  /**
   * Increment wallet balance atomically using an existing transaction client
   */
  async incrementBalanceWithClient(client: PoolClient, walletId: string, amountUsd: string): Promise<void> {
    if (!walletId?.trim()) throw new Error('walletId is required');
    if (!amountUsd?.trim()) throw new Error('amountUsd is required');

    await client.query(
      `
      UPDATE wallets
      SET balance = (balance + $1::decimal),
          updated_at = NOW()
      WHERE id = $2
      `,
      [amountUsd, walletId]
    );
  }
}

export default WalletRepository;
