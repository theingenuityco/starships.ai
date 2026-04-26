import Stripe from 'stripe';
import { TopupRepository, WalletRepository, LedgerRepository, getConnection } from '@starships/models';
import { WalletService } from '@/services/WalletService';
import { StripeService } from '@/services/StripeService';
import { StarshipService } from '@/services/StarshipService';
import type { TopupModel, CreateTopupRequest } from '@starships/protocol';
import { logger } from '@/utils/logger';
import { ForbiddenError, NotFoundError } from '@starships/errors';
import { CREDITS_PER_USD, toCreditsString } from '@/config/credits';

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
   * Verify a Stripe checkout session and apply credits for a pending topup.
   * Acts as a client-side fallback when the webhook is delayed or fails.
   * Safe to call multiple times — idempotent via the topup status check.
   */
  async finalizeTopup({ topupId, userId }: { topupId: string; userId: string }): Promise<{ topup: TopupModel; credited: boolean }> {
    const topup = await this.topupRepository.findById(topupId);
    if (!topup) {
      throw new NotFoundError('Topup', topupId);
    }

    const walletRepo = new WalletRepository();
    const wallet = await walletRepo.findById(topup.walletId);
    if (!wallet) {
      throw new NotFoundError('Wallet', topup.walletId);
    }

    const hasAccess = await this.starshipService.hasOwnerAccess(userId, wallet.starshipId);
    if (!hasAccess) {
      throw new ForbiddenError('Access denied to this topup');
    }

    if (topup.status === 'completed') {
      return { topup, credited: true };
    }

    if (topup.status !== 'pending' || !topup.stripeSessionId) {
      return { topup, credited: false };
    }

    const session = await StripeService.getCheckoutSession(topup.stripeSessionId);
    if (session.payment_status !== 'paid') {
      return { topup, credited: false };
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

    const connection = getConnection();
    let credited = false;

    await connection.transaction(async (client) => {
      const rows = await client.query<{ id: string; wallet_id: string; amount_usd: string; status: string }>(
        'SELECT id, wallet_id, amount_usd, status FROM topups WHERE id = $1 FOR UPDATE',
        [topupId]
      );
      const locked = rows.rows?.[0];
      if (!locked || locked.status === 'completed') return;

      const creditsGranted = toCreditsString((Number(locked.amount_usd) || 0) * Number(CREDITS_PER_USD));
      const { balance } = await walletRepo.incrementBalanceReturningWithClient(client, locked.wallet_id, creditsGranted);

      const topupRepo = new TopupRepository();
      await topupRepo.markCompletedWithClient(locked.id, paymentIntentId, null, client);

      const ledgerRepo = new LedgerRepository();
      await ledgerRepo.createWithClient(client, {
        walletId: locked.wallet_id,
        type: 'TOPUP',
        amount: creditsGranted,
        balanceAfter: balance,
        meta: {
          topupId: locked.id,
          stripeSession: topup.stripeSessionId,
          stripePaymentIntent: paymentIntentId,
          amountUsd: locked.amount_usd,
          creditsGranted,
          creditsPerUsd: Number(CREDITS_PER_USD),
          source: 'client_finalize',
        },
      });

      credited = true;
    });

    logger.info('[TOPUP] Finalized topup from client callback', { topupId, credited, userId });
    const updated = await this.topupRepository.findById(topupId);
    return { topup: updated ?? topup, credited };
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
