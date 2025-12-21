import { getConnection, LedgerRepository, WalletRepository } from '@starships/models';
import type { WalletModel } from '@starships/protocol';
import { logger } from '@/utils/logger';

/**
 * Wallet Service - Creates and fetches wallets for starships
 * Layered architecture: Controller -> Service -> Repository
 */
export class WalletService {
  private walletRepository: WalletRepository;
  private ledgerRepository: LedgerRepository;

  constructor() {
    this.walletRepository = new WalletRepository();
    this.ledgerRepository = new LedgerRepository();
  }

  /**
   * Ensure a wallet exists for the given starship. Creates one if missing.
   * @param starshipId - The starship ID
   * @param initialCredits - Optional initial credits (default: 0)
   */
  async createForStarship(starshipId: string, initialCredits: number = 0): Promise<WalletModel> {
    try {
      logger.info('[WALLET] Ensuring wallet exists for starship', { starshipId, initialCredits, operation: 'createForStarship' });

      const existing = await this.walletRepository.findByStarshipId(starshipId);
      if (existing) {
        logger.debug('[WALLET] Wallet already exists for starship', { starshipId, walletId: existing.id });
        // Best-effort backfill: if caller expects initial credits and the wallet has no ledger entries yet,
        // create an adjustment so the "welcome credits" show up in the ledger UI.
        // This is intentionally conservative (only when count=0 and current balance matches expected initialCredits).
        if (initialCredits > 0) {
          try {
            const count = await this.ledgerRepository.countByWallet(existing.id);
            if (count === 0 && Number(existing.balance) === Number(initialCredits.toFixed(6))) {
              const connection = getConnection();
              await connection.transaction(async (client) => {
                await this.ledgerRepository.createWithClient(client, {
                  walletId: existing.id,
                  type: 'ADJUSTMENT',
                  amount: initialCredits.toFixed(6),
                  balanceAfter: existing.balance,
                  meta: { reason: 'WELCOME_CREDIT_BACKFILL', starshipId, initialCredits },
                });
              });
            }
          } catch (e) {
            logger.warn('[WALLET] Failed to backfill welcome credit ledger entry', { starshipId, walletId: existing.id }, e as Error);
          }
        }
        return existing;
      }

      const balanceStr = initialCredits.toFixed(6);
      const wallet = await this.walletRepository.create({
        starshipId,
        currency: 'CREDITS',
        balance: balanceStr,
      });

      // Record the initial credit grant in the immutable ledger so it appears in the Credit Ledger UI.
      if (initialCredits > 0) {
        try {
          const connection = getConnection();
          await connection.transaction(async (client) => {
            await this.ledgerRepository.createWithClient(client, {
              walletId: wallet.id,
              type: 'ADJUSTMENT',
              amount: balanceStr,
              balanceAfter: balanceStr,
              meta: { reason: 'WELCOME_CREDIT', starshipId, initialCredits },
            });
          });
        } catch (e) {
          // Don't fail wallet creation if ledger write fails; log and continue.
          logger.warn('[WALLET] Failed to create welcome credit ledger entry', { starshipId, walletId: wallet.id }, e as Error);
        }
      }

      logger.info('[WALLET] Wallet created', { starshipId, walletId: wallet.id, balance: wallet.balance, initialCredits });
      return wallet;
    } catch (error) {
      logger.error('[WALLET] Failed to create wallet', { starshipId, operation: 'createForStarship' }, error as Error);
      throw error;
    }
  }

  /**
   * Get a wallet by starshipId
   */
  async getByStarshipId(starshipId: string): Promise<WalletModel | null> {
    try {
      logger.debug('[WALLET] Fetching wallet by starshipId', { starshipId, operation: 'getByStarshipId' });
      return await this.walletRepository.findByStarshipId(starshipId);
    } catch (error) {
      logger.error('[WALLET] Failed to fetch wallet', { starshipId, operation: 'getByStarshipId' }, error as Error);
      throw error;
    }
  }
}

export default WalletService;
