import Stripe from 'stripe';
import { getConnection, StarshipRepository, UserRepository } from '@starships/models';
import { AppError } from '@starships/errors';
import { StripeService } from '@/services/StripeService';
import { getEnvConfig } from '@starships/env';
import type { ShipClass } from '@starships/protocol';

const envConfig = getEnvConfig();
const stripe = new Stripe(envConfig.STRIPE_SECRET_KEY);

function parseIntOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function isShipClass(value: string): value is ShipClass {
  return value === 'scout' || value === 'frigate' || value === 'cruiser';
}

function shipClassRank(shipClass: ShipClass): number {
  // Lower rank means "lower tier". Used to detect upgrade vs downgrade.
  switch (shipClass) {
    case 'scout':
      return 0;
    case 'frigate':
      return 1;
    case 'cruiser':
      return 2;
  }
}

function readRequiredPlanMetadata(price: Stripe.Price): {
  shipClass: ShipClass;
  maxAgents: number;
  maxConcurrentTurns: number;
  monthlyCredits: number;
} {
  const md = price.metadata || {};
  const shipClass = (md.ship_class || md.shipClass || '').toString();
  const maxAgents = parseIntOrNull(md.max_agents ?? md.maxAgents);
  const maxConcurrentTurns = parseIntOrNull(md.max_concurrent_turns ?? md.maxConcurrentTurns);
  const monthlyCredits = parseIntOrNull(md.monthly_credits ?? md.monthlyCredits);
  if (!shipClass || maxAgents === null || maxConcurrentTurns === null || monthlyCredits === null) {
    throw new AppError('Plan metadata missing required keys', 'VALIDATION_ERROR', 400, { details: { metadata: md } });
  }
  if (!isShipClass(shipClass)) {
    throw new AppError('Plan metadata ship_class is invalid', 'VALIDATION_ERROR', 400, { details: { shipClass } });
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

    // If the existing subscription is not in a paying state, do NOT attempt an in-place update.
    // Instead, redirect the user through Checkout to (re)establish a valid payment flow.
    // This commonly happens if a prior checkout attempt left the subscription in `incomplete`/`unpaid`.
    const isPaying = existing.status === 'active' || existing.status === 'trialing';
    if (!isPaying) {
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

    // Determine whether this is a downgrade (apply at next renewal) vs upgrade (apply immediately).
    const nextPrice = await stripe.prices.retrieve(priceId);
    const nextPlan = readRequiredPlanMetadata(nextPrice);
    const currentRank = shipClassRank(starship.shipClass);
    const nextRank = shipClassRank(nextPlan.shipClass);
    const isDowngrade = nextRank < currentRank;

    if (isDowngrade) {
      // Downgrades take effect next renewal. Product requirement: ideally the subscription will NOT renew,
      // so we cancel at period end (the starship will revert to Scout when Stripe marks the subscription non-paying).
      const scheduleId =
        typeof (existing as unknown as { schedule?: unknown }).schedule === 'string'
          ? ((existing as unknown as { schedule?: string }).schedule as string)
          : ((existing as unknown as { schedule?: { id: string } | null }).schedule?.id ?? null);

      // If Stripe has already put this subscription under a schedule, we must update the schedule (Stripe forbids
      // changing cancellation behavior directly on the subscription).
      if (scheduleId) {
        const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
        const phaseStart = schedule.phases?.[0]?.start_date ?? schedule.current_phase?.start_date ?? null;
        if (!phaseStart) {
          throw new AppError('Subscription schedule missing phase start_date', 'INTERNAL_SERVER_ERROR', 500, {
            details: { scheduleId },
          });
        }

        const currentItem = existing.items?.data?.[0];
        const currentPriceId =
          typeof currentItem?.price === 'string' ? currentItem.price : (currentItem?.price as Stripe.Price | undefined)?.id;
        const nextRenewalAt = currentItem?.current_period_end ?? null;
        if (!currentPriceId) throw new AppError('Subscription item missing price', 'INTERNAL_SERVER_ERROR', 500);
        if (!nextRenewalAt) throw new AppError('Subscription item missing current_period_end', 'INTERNAL_SERVER_ERROR', 500);

        await stripe.subscriptionSchedules.update(scheduleId, {
          end_behavior: 'cancel',
          proration_behavior: 'none',
          metadata: {
            ...(schedule.metadata || {}),
            starship_id: starshipId,
            user_id: userId,
            pending_downgrade_to: 'scout',
            requested_price_id: priceId,
          },
          phases: [
            {
              start_date: phaseStart,
              end_date: nextRenewalAt,
              items: [{ price: currentPriceId, quantity: currentItem?.quantity ?? 1 }],
              proration_behavior: 'none',
            },
          ],
        });
      } else {
        await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
          proration_behavior: 'none',
          metadata: {
            ...(existing.metadata || {}),
            starship_id: starshipId,
            user_id: userId,
            pending_downgrade_to: 'scout',
            requested_price_id: priceId,
          },
        });
      }

      // Do NOT apply entitlements immediately; webhook will enforce Scout once the subscription ends.
      return { mode: 'updated' };
    }

    // Upgrades/same-tier switches apply immediately (with prorations) for UX.
    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: 'create_prorations',
      cancel_at_period_end: false,
      metadata: {
        ...(existing.metadata || {}),
        starship_id: starshipId,
        user_id: userId,
        price_id: priceId,
      },
    });

    // Apply entitlements immediately for UX (credits are still granted on invoice.paid).
    await this.starshipRepo.update(starshipId, {
      shipClass: nextPlan.shipClass,
      maxAgents: nextPlan.maxAgents,
      maxConcurrentTurns: nextPlan.maxConcurrentTurns,
    });

    return { mode: 'updated' };
  }
}

export default SubscriptionManagementService;
