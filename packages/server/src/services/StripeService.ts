import Stripe from 'stripe';
import { logger } from '@/utils/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

/**
 * Stripe Service - Handles Stripe payment operations
 * Layered architecture: Controller -> Service -> Stripe SDK
 */
export class StripeService {
  /**
   * Create a Stripe Checkout Session for wallet topup
   */
  static async createCheckoutSession({
    amountUsd,
    walletId,
    starshipId,
    idempotencyKey,
    topupId,
  }: {
    amountUsd: number;
    walletId: string;
    starshipId: string;
    idempotencyKey: string;
    topupId: string;
  }) {
    try {
      logger.info('[STRIPE] Creating checkout session', {
        amountUsd,
        walletId,
        starshipId,
        operation: 'createCheckoutSession',
      });

      // Validate amount
      if (!amountUsd || amountUsd <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      if (amountUsd > 10000) {
        throw new Error('Amount cannot exceed $10,000');
      }

      // Convert to cents for Stripe
      const unitAmount = Math.round(Number(amountUsd) * 100);

      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Starship Wallet Top-up',
                  description: `Add $${amountUsd} USD to your starship wallet`,
                },
                unit_amount: unitAmount,
              },
              quantity: 1,
            },
          ],
          // Useful for reconciliation in webhook handlers
          client_reference_id: topupId,
          // Session-level metadata (optional)
          metadata: {
            wallet_id: walletId,
            starship_id: starshipId,
            amount_usd: amountUsd.toString(),
            topup_id: topupId,
            idempotency_key: idempotencyKey,
          },
          // Ensure PaymentIntent carries metadata for charge events
          payment_intent_data: {
            metadata: {
              topup_id: topupId,
              wallet_id: walletId,
              starship_id: starshipId,
              idempotency_key: idempotencyKey,
            },
          },
          success_url: `${process.env.PUBLIC_URL}/ship/${starshipId}/management?tab=billing&status=success`,
          cancel_url: `${process.env.PUBLIC_URL}/ship/${starshipId}/management?tab=billing&status=cancelled`,
          expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
        },
        {
          idempotencyKey,
        }
      );

      logger.info('[STRIPE] Checkout session created', {
        sessionId: session.id,
        amountUsd,
        walletId,
        starshipId,
      });

      return session;
    } catch (error) {
      logger.error(
        '[STRIPE] Failed to create checkout session',
        {
          amountUsd,
          walletId,
          starshipId,
          operation: 'createCheckoutSession',
        },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Retrieve a Stripe Checkout Session
   */
  static async getCheckoutSession(sessionId: string) {
    try {
      logger.debug('[STRIPE] Retrieving checkout session', { sessionId, operation: 'getCheckoutSession' });

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      logger.debug('[STRIPE] Checkout session retrieved', { sessionId, status: session.status });
      return session;
    } catch (error) {
      logger.error('[STRIPE] Failed to retrieve checkout session', { sessionId, operation: 'getCheckoutSession' }, error as Error);
      throw error;
    }
  }
}

export default StripeService;
