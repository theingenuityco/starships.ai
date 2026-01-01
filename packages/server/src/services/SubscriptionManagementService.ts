import Stripe from 'stripe';
import { getConnection, StarshipRepository, UserRepository } from '@starships/models';
import { AppError } from '@starships/errors';
import { StripeService } from '@/services/StripeService';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

function parseIntOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function readRequiredPlanMetadata(price: Stripe.Price): { shipClass: string; maxAgents: number; maxConcurrentTurns: number; monthlyCredits: number } {
  const md = price.metadata || {};
  const shipClass = (md.ship_class || md.shipClass || '').toString();
  const maxAgents = parseIntOrNull(md.max_agents ?? md.maxAgents);
  const maxConcurrentTurns = parseIntOrNull(md.max_concurrent_turns ?? md.maxConcurrentTurns);
  const monthlyCredits = parseIntOrNull(md.monthly_credits ?? md.monthlyCredits);
  if (!shipClass || maxAgents === null || maxConcurrentTurns === null || monthlyCredits === null) {
    throw new AppError('Plan metadata missing required keys', 'VALIDATION_ERROR', 400, { details: { metadata: md } });
  }
  return { shipClass, maxAgents, maxConcurrentTurns, monthlyCredits };
}

export class SubscriptionManagementService {
  private readonly userRepo = new UserRepository();
  private readonly starshipRepo = new StarshipRepository();

  /**
   * Change a starship's subscription plan to the given Stripe Price ID.
   *
   * Behavior:
   * - If the starship has an existing subscription (tracked in DB), update it in Stripe.
   * - Otherwise, create a new Checkout Session and return checkoutUrl.
   */
  async changePlan(params: {
    userId: string;
    starshipId: string;
    priceId: string;
  }): Promise<{ mode: 'checkout' | 'updated'; checkoutUrl?: string }> {
    const { userId, starshipId, priceId } = params;
    if (!priceId?.trim()) throw new AppError('Missing priceId', 'VALIDATION_ERROR', 400);

    const [user, starship] = await Promise.all([this.userRepo.findById(userId), this.starshipRepo.findById(starshipId)]);
    if (!user) throw new AppError('User not found', 'RESOURCE_NOT_FOUND', 404);
    if (!starship) throw new AppError('Starship not found', 'STARSHIP_NOT_FOUND', 404);

    // Ensure customer id
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await StripeService.createCustomer({ userId: user.id, email: user.email ?? null });
      stripeCustomerId = customer.id;
      await this.userRepo.update(user.id, { stripeCustomerId });
    }

    // Try to find existing subscription id for this starship.
    const connection = getConnection();
    const row = await connection.queryOne<{ stripe_subscription_id: string; status: string }>(
      `SELECT stripe_subscription_id, status
         FROM starship_subscriptions
        WHERE starship_id = $1
          AND status NOT IN ('canceled')
        ORDER BY updated_at DESC
        LIMIT 1`,
      [starshipId]
    );

    if (!row?.stripe_subscription_id) {
      // No known subscription; start checkout.
      const idempotencyKey = `sub-${starshipId}-${priceId}-${Date.now()}`;
      const session = await StripeService.createSubscriptionCheckoutSession({
        stripeCustomerId,
        starshipId,
        starshipSlug: starship.slug,
        userId,
        idempotencyKey,
        priceId,
      });
      if (!session.url) throw new AppError('Failed to create Stripe checkout session', 'INTERNAL_SERVER_ERROR', 500);
      return { mode: 'checkout', checkoutUrl: session.url };
    }

    const subscriptionId = row.stripe_subscription_id;
    const existing = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data'] });
    const item = existing.items?.data?.[0];
    if (!item?.id) throw new AppError('Subscription has no items', 'INTERNAL_SERVER_ERROR', 500);

    // Update subscription to the new price
    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: 'create_prorations',
      metadata: {
        ...(existing.metadata || {}),
        starship_id: starshipId,
        user_id: userId,
        price_id: priceId,
      },
    });

    // Apply entitlements immediately for UX (credits are still granted on invoice.paid).
    const price = await stripe.prices.retrieve(priceId);
    const plan = readRequiredPlanMetadata(price);
    await this.starshipRepo.update(starshipId, {
      shipClass: plan.shipClass as any,
      maxAgents: plan.maxAgents,
      maxConcurrentTurns: plan.maxConcurrentTurns,
    } as any);

    return { mode: 'updated' };
  }
}

export default SubscriptionManagementService;


