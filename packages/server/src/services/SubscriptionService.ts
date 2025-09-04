import Stripe from 'stripe';
import { UserRepository, StarshipRepository } from '@starships/models';
import { getEnvConfig } from '@starships/env';

export class SubscriptionService {
  private stripe: Stripe;
  private env = getEnvConfig();

  constructor(
    private userRepository: UserRepository,
    private starshipRepository: StarshipRepository
  ) {
    this.stripe = new Stripe(this.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-07-30.basil', // ✅ CONFIRMED: Matches your setup-stripe.ts (line 10)
    });
  }

  // Check free starship limit
  async canCreateFreeStarship(userId: string): Promise<boolean> {
    const count = await this.starshipRepository.countFreeStarships(userId);
    return count < 3;
  }

  // Get or create Stripe customer
  async getOrCreateCustomer(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('User not found');
    if (!user.email) throw new Error('User email is required for billing operations');

    // If user has a stored customer ID, verify it still exists
    if (user.stripeCustomerId) {
      try {
        // Try to retrieve the customer to verify it exists
        const customer = await this.stripe.customers.retrieve(user.stripeCustomerId);
        
        // Check if customer is deleted
        if ((customer as any).deleted) {
          console.log(`[SUBSCRIPTION] Customer ${user.stripeCustomerId} is deleted in Stripe, creating new one`);
        } else {
          console.log(`[SUBSCRIPTION] Using existing customer ${user.stripeCustomerId}`);
          return user.stripeCustomerId;
        }
      } catch (error: any) {
        // Customer doesn't exist
        if (error.type === 'StripeInvalidRequestError' && error.code === 'resource_missing') {
          console.log(`[SUBSCRIPTION] Customer ${user.stripeCustomerId} not found in Stripe, creating new one`);
        } else {
          // Real error - throw it
          throw error;
        }
      }
    }

    // Create new customer
    console.log(`[SUBSCRIPTION] Creating new Stripe customer for user ${userId}`);
    const customer = await this.stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });

    await this.userRepository.updateStripeCustomerId(userId, customer.id);
    console.log(`[SUBSCRIPTION] Created new customer ${customer.id} for user ${userId}`);
    return customer.id;
  }

  // Create checkout session
  async createCheckoutSession(params: {
    userId: string;
    starshipName: string;
    plan: 'cruiser' | 'draught';
    billingPeriod: 'monthly' | 'yearly';
  }): Promise<string> {
    const customerId = await this.getOrCreateCustomer(params.userId);

    // Get price ID from environment
    const priceKey = `STRIPE_PRICE_${params.plan.toUpperCase()}_${params.billingPeriod.toUpperCase()}`;
    const priceId = this.env[priceKey as keyof typeof this.env] as string;

    if (!priceId) {
      throw new Error(`Price not found for ${params.plan} ${params.billingPeriod}`);
    }

    // Build URLs - use CLIENT_URL for frontend redirects
    let baseUrl = process.env.CLIENT_URL;
    
    if (!baseUrl) {
      throw new Error('CLIENT_URL environment variable is required for Stripe checkout');
    }
    
    // Ensure baseUrl has proper scheme and remove trailing slash
    baseUrl = baseUrl.trim().replace(/\/$/, '');
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `http://${baseUrl}`;
    }
    
    console.log('[SUBSCRIPTION] Using baseUrl for Stripe checkout:', baseUrl);

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      // Apply FREEACCESS coupon by default
      discounts: [
        {
          coupon: 'FREEACCESS',
        },
      ],
      // Only collect payment method if needed (skips for $0 total)
      payment_method_collection: 'if_required',
      success_url: `${baseUrl}/starships/create/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/starships/create/cancel`,
      metadata: {
        userId: params.userId,
        starshipName: params.starshipName,
        plan: params.plan,
        billingPeriod: params.billingPeriod,
      },
    });

    return session.url!;
  }

  // Create checkout session for existing starship
  async createCheckoutSessionForStarship(params: {
    userId: string;
    starshipId: string;
    starshipSlug: string;
    plan: 'cruiser' | 'draught';
    billingPeriod: 'monthly' | 'yearly';
  }): Promise<string> {
    const customerId = await this.getOrCreateCustomer(params.userId);

    // Get price ID from environment
    const priceKey = `STRIPE_PRICE_${params.plan.toUpperCase()}_${params.billingPeriod.toUpperCase()}`;
    const priceId = this.env[priceKey as keyof typeof this.env] as string;

    if (!priceId) {
      throw new Error(`Price not found for ${params.plan} ${params.billingPeriod}`);
    }

    // Build URLs - use CLIENT_URL for frontend redirects
    let baseUrl = process.env.CLIENT_URL;
    
    if (!baseUrl) {
      throw new Error('CLIENT_URL environment variable is required for Stripe checkout');
    }
    
    // Ensure baseUrl has proper scheme and remove trailing slash
    baseUrl = baseUrl.trim().replace(/\/$/, '');
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `http://${baseUrl}`;
    }
    
    console.log('[SUBSCRIPTION] Creating checkout for starship:', params.starshipId);

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      // Apply FREEACCESS coupon by default
      discounts: [
        {
          coupon: 'FREEACCESS',
        },
      ],
      // Only collect payment method if needed (skips for $0 total)
      payment_method_collection: 'if_required',
      // Redirect to starship-specific page after payment
      // The command deck is a good landing page for new starships
      success_url: `${baseUrl}/ship/${params.starshipSlug}/command-deck?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/starships/create/cancel`,
      metadata: {
        starshipId: params.starshipId, // CRITICAL: Pass starshipId, not name
        userId: params.userId,
        plan: params.plan,
        billingPeriod: params.billingPeriod
      }
    });

    return session.url!;
  }

  // Create billing portal session
  async createPortalSession(starshipId: string, userId: string): Promise<string> {
    const starship = await this.starshipRepository.findById(starshipId);
    if (!starship || starship.ownerId !== userId) {
      throw new Error('Starship not found or access denied');
    }

    if (starship.plan === 'scout') {
      throw new Error('Free starships do not have subscription management');
    }

    const customerId = await this.getOrCreateCustomer(userId);
    const baseUrl = this.env.NODE_ENV === 'production'
      ? 'https://app.starships.ai' // TODO: Set your production domain
      : `http://localhost:${this.env.SERVER_PORT}`;

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/starships/${starshipId}`,
    });

    return session.url;
  }

  // Get pricing data
  async getPricingData(): Promise<any[]> {
    const products = await this.stripe.products.list({ active: true });
    const prices = await this.stripe.prices.list({ active: true });

    const pricing = products.data
      .filter(product => product.metadata.plan_type)
      .map(product => {
        const productPrices = prices.data.filter(p => p.product === product.id);
        const monthlyPrice = productPrices.find(p => p.recurring?.interval === 'month');
        const yearlyPrice = productPrices.find(p => p.recurring?.interval === 'year');

        return {
          id: product.metadata.plan_type,
          name: product.name,
          description: product.description,
          monthly: monthlyPrice ? monthlyPrice.unit_amount! / 100 : 0,
          yearly: yearlyPrice ? yearlyPrice.unit_amount! / 100 : 0,
          features: {
            maxAgents: parseInt(product.metadata.max_agents || '0'),
          },
        };
      });

    // Add Scout plan
    pricing.unshift({
      id: 'scout',
      name: 'Scout Starship',
      description: 'Free tier - up to 3 starships per account',
      monthly: 0,
      yearly: 0,
      features: {
        maxAgents: 3,
      },
    });

    return pricing;
  }

  // Cancel subscription immediately without proration
  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    if (!subscriptionId) {
      console.log('[SUBSCRIPTION] No subscription to cancel');
      return true; // No subscription = nothing to cancel = success
    }
    
    try {
      // First check if subscription exists
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      
      // If already cancelled, consider it a success
      if (subscription.status === 'canceled') {
        console.log(`[SUBSCRIPTION] Subscription ${subscriptionId} is already cancelled`);
        return true;
      }
      
      // Cancel immediately without proration (MVP approach)
      const cancelledSub = await this.stripe.subscriptions.cancel(
        subscriptionId,
        {
          prorate: false,        // No proration for MVP
          invoice_now: false     // Don't create final invoice
        }
      );
      
      console.log(`[SUBSCRIPTION] Successfully cancelled subscription ${subscriptionId}, status: ${cancelledSub.status}`);
      return cancelledSub.status === 'canceled';
    } catch (error: any) {
      // Check if error is because subscription doesn't exist
      if (error.type === 'StripeInvalidRequestError' && error.code === 'resource_missing') {
        console.log(`[SUBSCRIPTION] Subscription ${subscriptionId} not found in Stripe - likely already cancelled`);
        // Subscription doesn't exist = already cancelled = allow deletion
        return true;
      }
      
      console.error(`[SUBSCRIPTION] Failed to cancel subscription ${subscriptionId}:`, error);
      // Other errors should block deletion
      return false;
    }
  }
}