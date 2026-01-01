import { getEnvConfig } from '@starships/env';
import { UserRepository, StarshipRepository } from '@starships/models';
import { AppError } from '@starships/errors';
import { logger } from '@/utils/logger';
import { StripeService } from '@/services/StripeService';

/**
 * FrigateSubscriptionService
 *
 * Orchestrates starting a Stripe subscription checkout session to upgrade a starship to Frigate.
 * Fulfillment happens asynchronously via Stripe webhooks (invoice.paid, subscription updates).
 */
export class FrigateSubscriptionService {
  private readonly userRepo: UserRepository;
  private readonly starshipRepo: StarshipRepository;

  constructor() {
    this.userRepo = new UserRepository();
    this.starshipRepo = new StarshipRepository();
  }

  async createCheckoutSession(params: { userId: string; starshipId: string }): Promise<{ checkoutUrl: string }> {
    const config = getEnvConfig();
    const priceId = config.STRIPE_FRIGATE_PRICE_ID;
    if (!priceId) {
      throw new AppError('Frigate upgrades are not configured', 'CONFIGURATION_ERROR', 500, {
        details: { missing: 'STRIPE_FRIGATE_PRICE_ID' },
      });
    }

    const [user, starship] = await Promise.all([this.userRepo.findById(params.userId), this.starshipRepo.findById(params.starshipId)]);
    if (!user) {
      throw new AppError('User not found', 'RESOURCE_NOT_FOUND', 404);
    }
    if (!starship) {
      throw new AppError('Starship not found', 'STARSHIP_NOT_FOUND', 404, { details: { starshipId: params.starshipId } });
    }

    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      logger.info('[FRIGATE] Creating Stripe customer for user', { userId: user.id });
      const customer = await StripeService.createCustomer({ userId: user.id, email: user.email ?? null });
      stripeCustomerId = customer.id;
      await this.userRepo.update(user.id, { stripeCustomerId });
    }

    const idempotencyKey = `frigate-sub-${params.starshipId}-${Date.now()}`;
    const session = await StripeService.createFrigateSubscriptionCheckoutSession({
      stripeCustomerId,
      starshipId: params.starshipId,
      starshipSlug: starship.slug,
      userId: params.userId,
      idempotencyKey,
      priceId,
    });

    if (!session.url) {
      throw new AppError('Failed to create Stripe checkout session', 'INTERNAL_SERVER_ERROR', 500);
    }

    return { checkoutUrl: session.url };
  }
}

export default FrigateSubscriptionService;


