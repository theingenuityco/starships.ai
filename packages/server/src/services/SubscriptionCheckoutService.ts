import { UserRepository, StarshipRepository } from '@starships/models';
import { AppError } from '@starships/errors';
import { logger } from '@/utils/logger';
import { StripeService } from '@/services/StripeService';
import Stripe from 'stripe';
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

/**
 * SubscriptionCheckoutService
 *
 * Starts a Stripe Checkout Session (mode=subscription) for a given Stripe Price ID.
 * Plan definitions live in Stripe Price metadata (Option A).
 */
export class SubscriptionCheckoutService {
  private readonly userRepo: UserRepository;
  private readonly starshipRepo: StarshipRepository;

  constructor() {
    this.userRepo = new UserRepository();
    this.starshipRepo = new StarshipRepository();
  }

  async createCheckoutSession(params: { userId: string; starshipId: string; priceId: string }): Promise<{ checkoutUrl: string }> {
    const { userId, starshipId, priceId } = params;
    if (!priceId?.trim()) {
      throw new AppError('Missing priceId', 'VALIDATION_ERROR', 400, { details: { field: 'priceId' } });
    }

    const [user, starship] = await Promise.all([this.userRepo.findById(userId), this.starshipRepo.findById(starshipId)]);
    if (!user) throw new AppError('User not found', 'RESOURCE_NOT_FOUND', 404);
    if (!starship) throw new AppError('Starship not found', 'STARSHIP_NOT_FOUND', 404, { details: { starshipId } });
    if (starship.ownerId !== userId) {
      throw new AppError('Access denied to this starship', 'FORBIDDEN', 403, { details: { starshipId } });
    }

    // Prevent privilege escalation via arbitrary price IDs: require a valid recurring plan with required metadata.
    const price = await stripe.prices.retrieve(priceId);
    if (!price?.active || !price.recurring) {
      throw new AppError('Invalid subscription plan', 'VALIDATION_ERROR', 400, { details: { priceId } });
    }
    readRequiredPlanMetadata(price);

    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      logger.info('[SUBSCRIPTION] Creating Stripe customer for user', { userId: user.id });
      const customer = await StripeService.createCustomer({ userId: user.id, email: user.email ?? null });
      stripeCustomerId = customer.id;
      await this.userRepo.update(user.id, { stripeCustomerId });
    }

    const idempotencyKey = `sub-${starshipId}-${priceId}-${Date.now()}`;
    const session = await StripeService.createSubscriptionCheckoutSession({
      stripeCustomerId,
      starshipId,
      starshipSlug: starship.slug,
      userId,
      idempotencyKey,
      priceId,
    });

    if (!session.url) {
      throw new AppError('Failed to create Stripe checkout session', 'INTERNAL_SERVER_ERROR', 500);
    }

    return { checkoutUrl: session.url };
  }
}

export default SubscriptionCheckoutService;


