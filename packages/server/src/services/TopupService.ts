import { TopupRepository } from '@starships/models';
import { WalletService } from '@/services/WalletService';
import { StripeService } from '@/services/StripeService';
import { StarshipService } from '@/services/StarshipService';
import type { TopupModel, CreateTopupRequest } from '@starships/protocol';
import { logger } from '@/utils/logger';

/**
 * Topup Service - Orchestrates wallet topup operations
 * Layered architecture: Controller -> Service -> Repository/Stripe
 */
export class TopupService {
  private topupRepository: TopupRepository;
  private walletService: WalletService;
  private starshipService: StarshipService;

  constructor() {
    this.topupRepository = new TopupRepository();
    this.walletService = new WalletService();
    this.starshipService = new StarshipService();
  }

  /**
   * Create a new topup and initiate Stripe checkout session
   */
  async createTopup({
    starshipId,
    amountUsd,
    walletId,
  }: {
    starshipId: string;
    amountUsd: number;
    walletId: string;
  }): Promise<{ checkoutUrl: string; topup: TopupModel }> {
    try {
      logger.info('[TOPUP] Creating topup', {
        starshipId,
        amountUsd,
        walletId,
        operation: 'createTopup',
      });

      // Validate amount
      if (!amountUsd || amountUsd <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      if (amountUsd < 1) {
        throw new Error('Minimum topup amount is $1');
      }

      if (amountUsd > 1000) {
        throw new Error('Maximum topup amount is $1000 per transaction');
      }

      // Ensure wallet exists
      const wallet = await this.walletService.getByStarshipId(starshipId);
      if (!wallet) {
        throw new Error('Wallet not found for starship');
      }

      if (wallet.id !== walletId) {
        throw new Error('Wallet ID does not match starship');
      }

      // Resolve starship metadata (slug) for redirect destinations
      const starship = await this.starshipService.getStarship(starshipId);
      if (!starship) {
        throw new Error('Starship not found');
      }

      // Generate idempotency key
      const idempotencyKey = `${starshipId}-${Math.random().toString(36)}`;

      // Create pending topup record
      const topup = await this.topupRepository.create({
        id: idempotencyKey,
        walletId,
        amountUsd: amountUsd.toFixed(4),
        status: 'pending',
        idempotencyKey,
      });

      try {
        // Create Stripe checkout session
        const session = await StripeService.createCheckoutSession({
          amountUsd,
          walletId,
          starshipId,
          starshipSlug: starship.slug,
          idempotencyKey,
          topupId: topup.id,
        });

        // Update topup with Stripe session ID
        await this.topupRepository.updateStripeSession(topup.id, session.id);

        logger.info('[TOPUP] Topup created successfully', {
          topupId: topup.id,
          sessionId: session.id,
          starshipId,
          amountUsd,
        });

        return {
          checkoutUrl: session.url!,
          topup: {
            ...topup,
            stripeSessionId: session.id,
          },
        };
      } catch (stripeError) {
        // If Stripe fails, mark topup as failed
        await this.topupRepository.updateStatus(topup.id, 'failed');
        throw stripeError;
      }
    } catch (error) {
      logger.error(
        '[TOPUP] Failed to create topup',
        {
          starshipId,
          amountUsd,
          walletId,
          operation: 'createTopup',
        },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get topup by ID
   */
  async getTopupById(topupId: string): Promise<TopupModel | null> {
    try {
      logger.debug('[TOPUP] Fetching topup by ID', { topupId, operation: 'getTopupById' });
      return await this.topupRepository.findById(topupId);
    } catch (error) {
      logger.error('[TOPUP] Failed to fetch topup', { topupId, operation: 'getTopupById' }, error as Error);
      throw error;
    }
  }

  /**
   * Get topups by wallet ID
   */
  async getTopupsByWalletId(walletId: string): Promise<TopupModel[]> {
    try {
      logger.debug('[TOPUP] Fetching topups by wallet ID', { walletId, operation: 'getTopupsByWalletId' });
      return await this.topupRepository.findByWalletId(walletId);
    } catch (error) {
      logger.error('[TOPUP] Failed to fetch topups', { walletId, operation: 'getTopupsByWalletId' }, error as Error);
      throw error;
    }
  }

  /**
   * Update topup status (for webhook processing in Phase 3)
   */
  async updateTopupStatus(topupId: string, status: 'completed' | 'failed' | 'cancelled'): Promise<void> {
    try {
      logger.info('[TOPUP] Updating topup status', { topupId, status, operation: 'updateTopupStatus' });
      await this.topupRepository.updateStatus(topupId, status);
    } catch (error) {
      logger.error('[TOPUP] Failed to update topup status', { topupId, status, operation: 'updateTopupStatus' }, error as Error);
      throw error;
    }
  }
}

export default TopupService;
