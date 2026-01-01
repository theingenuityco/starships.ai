import Stripe from 'stripe';
import { logger } from '@/utils/logger';
import { CREDITS_PER_USD } from '@/config/credits';
import { getEnvConfig } from '@starships/env';

const envConfig = getEnvConfig();
const stripe = new Stripe(envConfig.STRIPE_SECRET_KEY);

/**
 * Stripe Service - Handles Stripe payment operations
 * Layered architecture: Controller -> Service -> Stripe SDK
 */
export class StripeService {
  /**
   * Create or retrieve a Stripe Customer for a user.
   * Note: Customer creation is idempotent from our side by persisting users.stripe_customer_id.
   */
  static async createCustomer(params: { userId: string; email?: string | null }): Promise<Stripe.Customer> {
    const email = params.email ?? undefined;
    const customer = await stripe.customers.create({
      ...(email ? { email } : {}),
      metadata: {
        user_id: params.userId,
      },
    });
    return customer;
  }

  /**
   * Create a Stripe Checkout Session for wallet topup
   */
  static async createCheckoutSession({
    amountUsd,
    walletId,
    starshipId,
    starshipSlug,
    idempotencyKey,
    topupId,
  }: {
    amountUsd: number;
    walletId: string;
    starshipId: string;
    starshipSlug?: string;
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
      const creditsGranted = Math.round(Number(amountUsd) * Number(CREDITS_PER_USD || 0));

      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          // Enable automatic tax calculation
          automatic_tax: {
            enabled: true,
          },
          // Require billing address for tax calculation
          billing_address_collection: 'required',
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Starships Credits',
                  description: `Buy ${creditsGranted} credits`,
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
            starship_slug: starshipSlug ?? null,
            amount_usd: amountUsd.toString(),
            credits_per_usd: String(CREDITS_PER_USD),
            credits_granted: String(creditsGranted),
            topup_id: topupId,
            idempotency_key: idempotencyKey,
          },
          // Ensure PaymentIntent carries metadata for charge events
          payment_intent_data: {
            metadata: {
              topup_id: topupId,
              wallet_id: walletId,
              starship_id: starshipId,
              starship_slug: starshipSlug ?? null,
              idempotency_key: idempotencyKey,
              credits_per_usd: String(CREDITS_PER_USD),
              credits_granted: String(creditsGranted),
            },
          },
          success_url: `${envConfig.PUBLIC_URL}/ship/${starshipSlug ?? starshipId}/billing/topup/success?topupId=${encodeURIComponent(
            topupId
          )}&amount=${encodeURIComponent(amountUsd.toFixed(2))}`,
          cancel_url: `${envConfig.PUBLIC_URL}/ship/${starshipSlug ?? starshipId}/billing/topup/failure?topupId=${encodeURIComponent(
            topupId
          )}`,
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

  /**
   * Create a Stripe Checkout Session for subscribing a starship to a paid ship class (generic).
   *
   * The plan definition (ship_class, entitlements, monthly credits) lives in Stripe Price metadata.
   */
  static async createSubscriptionCheckoutSession(params: {
    stripeCustomerId: string;
    starshipId: string;
    starshipSlug?: string;
    userId: string;
    idempotencyKey: string;
    priceId: string;
  }): Promise<Stripe.Checkout.Session> {
    const { stripeCustomerId, starshipId, starshipSlug, userId, idempotencyKey, priceId } = params;
    if (!priceId || !priceId.trim()) throw new Error('Missing priceId');

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        // Useful for routing and idempotency in webhook handlers
        client_reference_id: starshipId,
        metadata: {
          kind: 'ship_class_subscription',
          starship_id: starshipId,
          starship_slug: starshipSlug ?? null,
          user_id: userId,
          idempotency_key: idempotencyKey,
          price_id: priceId,
        },
        subscription_data: {
          metadata: {
            kind: 'ship_class_subscription',
            starship_id: starshipId,
            user_id: userId,
            price_id: priceId,
          },
        },
        success_url: `${envConfig.PUBLIC_URL}/ship/${starshipSlug ?? starshipId}/settings/my-starship?status=success`,
        cancel_url: `${envConfig.PUBLIC_URL}/ship/${starshipSlug ?? starshipId}/settings/my-starship?status=cancelled`,
        expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
      },
      { idempotencyKey }
    );

    return session;
  }
}

export default StripeService;
