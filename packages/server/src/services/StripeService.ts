import Stripe from 'stripe';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: PlanFeatures;
  isPopular?: boolean;
}

export interface PlanFeatures {
  agents: number;
  firstOfficer: boolean;
  mcps: number;
  expeditionsParallel: number;
  artifactStorageGB: number;
  tokenRateLimit: number;
}

/**
 * Service for managing Stripe subscriptions and plans
 */
export class StripeService {
  private static stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  /**
   * Get all available subscription plans from Stripe
   */
  static async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    try {
      console.log('[STRIPE-SERVICE] Fetching subscription plans from Stripe...');

      // Get all products with plan metadata
      const products = await this.stripe.products.list({
        active: true,
        limit: 100
      });

      const plans: SubscriptionPlan[] = [];

      for (const product of products.data) {
        // Only process products that have plan metadata
        if (!product.metadata?.plan_type) {
          continue;
        }

        // Get prices for this product
        const prices = await this.stripe.prices.list({
          product: product.id,
          active: true,
          limit: 10
        });

        // Find monthly and yearly prices
        const monthlyPrice = prices.data.find(p => p.recurring?.interval === 'month');
        const yearlyPrice = prices.data.find(p => p.recurring?.interval === 'year');

        if (!monthlyPrice || !yearlyPrice) {
          console.warn(`[STRIPE-SERVICE] Missing price data for product: ${product.id}`);
          continue;
        }

        const plan: SubscriptionPlan = {
          id: product.id,
          name: product.name,
          description: product.description || '',
          priceMonthly: monthlyPrice.unit_amount || 0,
          priceYearly: yearlyPrice.unit_amount || 0,
          features: {
            agents: parseInt(product.metadata.agents || '0'),
            firstOfficer: product.metadata.first_officer === 'true',
            mcps: parseInt(product.metadata.mcps || '0'),
            expeditionsParallel: parseInt(product.metadata.expeditions_parallel || '0'),
            artifactStorageGB: parseInt(product.metadata.artifact_storage_gb || '0'),
            tokenRateLimit: parseInt(product.metadata.token_rate_limit || '0')
          },
          isPopular: product.metadata.plan_type === 'cruiser'
        };

        plans.push(plan);
      }

      // Sort plans by price (Scout first, then Cruiser)
      plans.sort((a, b) => a.priceMonthly - b.priceMonthly);

      console.log(`[STRIPE-SERVICE] Successfully fetched ${plans.length} subscription plans`);
      return plans;
    } catch (error) {
      console.error('[STRIPE-SERVICE] Failed to fetch subscription plans:', error);
      throw new Error(`Failed to fetch subscription plans: ${error}`);
    }
  }

  /**
   * Get a specific subscription plan by product ID
   */
  static async getSubscriptionPlan(productId: string): Promise<SubscriptionPlan | null> {
    try {
      console.log(`[STRIPE-SERVICE] Fetching subscription plan: ${productId}`);
      
      const product = await this.stripe.products.retrieve(productId);
      
      if (!product.active || !product.metadata?.plan_type) {
        return null;
      }

      const prices = await this.stripe.prices.list({
        product: product.id,
        active: true,
        limit: 10
      });

      const monthlyPrice = prices.data.find(p => p.recurring?.interval === 'month');
      const yearlyPrice = prices.data.find(p => p.recurring?.interval === 'year');

      if (!monthlyPrice || !yearlyPrice) {
        return null;
      }

      const plan: SubscriptionPlan = {
        id: product.id,
        name: product.name,
        description: product.description || '',
        priceMonthly: monthlyPrice.unit_amount || 0,
        priceYearly: yearlyPrice.unit_amount || 0,
        features: {
          agents: parseInt(product.metadata.agents || '0'),
          firstOfficer: product.metadata.first_officer === 'true',
          mcps: parseInt(product.metadata.mcps || '0'),
          expeditionsParallel: parseInt(product.metadata.expeditions_parallel || '0'),
          artifactStorageGB: parseInt(product.metadata.artifact_storage_gb || '0'),
          tokenRateLimit: parseInt(product.metadata.token_rate_limit || '0')
        },
        isPopular: product.metadata.plan_type === 'cruiser'
      };

      console.log(`[STRIPE-SERVICE] Successfully fetched plan: ${plan.name}`);
      return plan;
    } catch (error) {
      console.error(`[STRIPE-SERVICE] Failed to fetch plan ${productId}:`, error);
      throw new Error(`Failed to fetch subscription plan: ${error}`);
    }
  }
}