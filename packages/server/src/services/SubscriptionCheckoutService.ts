import { UserRepository, StarshipRepository } from '@starships/models';
import { AppError } from '@starships/errors';
import { logger } from '@/utils/logger';
import { StripeService } from '@/services/StripeService';

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


