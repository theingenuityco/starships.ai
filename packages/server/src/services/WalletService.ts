import { WalletRepository } from '@starships/models';
import type { WalletModel } from '@starships/protocol';
import { logger } from '@/utils/logger';

/**
 * Wallet Service - Creates and fetches wallets for starships
 * Layered architecture: Controller -> Service -> Repository
 */
export class WalletService {
  private walletRepository: WalletRepository;

  constructor() {
    this.walletRepository = new WalletRepository();
  }

  /**
   * Ensure a wallet exists for the given starship. Creates one if missing.
   */
  async createForStarship(starshipId: string): Promise<WalletModel> {
    try {
      logger.info('[WALLET] Ensuring wallet exists for starship', { starshipId, operation: 'createForStarship' });

      const existing = await this.walletRepository.findByStarshipId(starshipId);
      if (existing) {
        logger.debug('[WALLET] Wallet already exists for starship', { starshipId, walletId: existing.id });
        return existing;
      }

      const wallet = await this.walletRepository.create({
        starshipId,
        currency: 'USD',
        balance: '0.000000',
      });

      logger.info('[WALLET] Wallet created', { starshipId, walletId: wallet.id, balance: wallet.balance });
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
