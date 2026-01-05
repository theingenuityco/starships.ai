import Stripe from 'stripe';
import { getEnvConfig } from '@starships/env';
import { logger } from '@/utils/logger';
import type { ShipClass } from '@starships/protocol';

const envConfig = getEnvConfig();
const stripe = new Stripe(envConfig.STRIPE_SECRET_KEY);

export interface SubscriptionPlan {
  priceId: string;
  productId?: string;
  shipClass: ShipClass;
  displayName: string;
  description?: string;
  currency: string;
  unitAmount: number | null;
  interval: string | null;
  entitlements: {
    maxAgents: number;
    maxConcurrentTurns: number;
    monthlyCredits: number;
  };
}

function isShipClass(value: string): value is ShipClass {
  return value === 'scout' || value === 'frigate' || value === 'cruiser';
}

type CacheState = {
  expiresAtMs: number;
  plans: SubscriptionPlan[];
};

/**
 * Centralized helper for reading ship-class plans/entitlements from Stripe Price metadata.
 * Cached in-memory to avoid hitting Stripe on every request.
 */
export class SubscriptionPlanCatalogService {
  private static cache: CacheState | null = null;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  static async listPlans(params?: { forceRefresh?: boolean }): Promise<SubscriptionPlan[]> {
    const forceRefresh = Boolean(params?.forceRefresh);
    const now = Date.now();

    if (!forceRefresh && SubscriptionPlanCatalogService.cache && SubscriptionPlanCatalogService.cache.expiresAtMs > now) {
      return SubscriptionPlanCatalogService.cache.plans;
    }

    try {
      const prices = await stripe.prices.list({
        active: true,
        limit: 100,
        expand: ['data.product'],
      });

      const plans = prices.data
        .filter((p) => Boolean(p.recurring))
        .map((p) => {
          const md = p.metadata || {};
          const shipClassRaw = (md.ship_class || md.shipClass || '').toString();
          const maxAgents = Number(md.max_agents ?? md.maxAgents);
          const maxConcurrentTurns = Number(md.max_concurrent_turns ?? md.maxConcurrentTurns);
          const monthlyCredits = Number(md.monthly_credits ?? md.monthlyCredits);
          const displayName = (md.display_name || md.displayName || '').toString();
          const description = (md.description || '').toString();

          // Only include well-formed plans
          if (!shipClassRaw) return null;
          if (!isShipClass(shipClassRaw)) return null;
          if (!Number.isFinite(maxAgents) || !Number.isFinite(maxConcurrentTurns) || !Number.isFinite(monthlyCredits)) return null;

          const unitAmount = typeof p.unit_amount === 'number' ? p.unit_amount : null;
          const interval = p.recurring?.interval || null;

          const productId = typeof p.product === 'string' ? p.product : p.product?.id;
          const productDescription =
            typeof p.product === 'string' ? '' : ((p.product as unknown as { description?: string | null })?.description ?? '');

          return {
            priceId: p.id,
            productId,
            shipClass: shipClassRaw,
            displayName: displayName || shipClassRaw,
            description: description || productDescription,
            currency: p.currency,
            unitAmount, // cents
            interval,
            entitlements: {
              maxAgents: Math.trunc(maxAgents),
              maxConcurrentTurns: Math.trunc(maxConcurrentTurns),
              monthlyCredits: Math.trunc(monthlyCredits),
            },
          } satisfies SubscriptionPlan;
        })
        .filter(Boolean) as SubscriptionPlan[];

      SubscriptionPlanCatalogService.cache = {
        expiresAtMs: now + SubscriptionPlanCatalogService.CACHE_TTL_MS,
        plans,
      };

      return plans;
    } catch (error) {
      // Fail open: callers should provide safe fallbacks when plans can't be read.
      logger.warn('[SUBSCRIPTIONS] Failed to list plans from Stripe; returning empty plan catalog', {
        error: error instanceof Error ? error.message : String(error),
      });
      SubscriptionPlanCatalogService.cache = {
        expiresAtMs: now + 30 * 1000, // short TTL on failure
        plans: [],
      };
      return [];
    }
  }

  static async getEntitlementsForShipClass(shipClass: ShipClass): Promise<SubscriptionPlan['entitlements'] | null> {
    const plans = await SubscriptionPlanCatalogService.listPlans();
    const plan = plans.find((p) => p.shipClass === shipClass);
    return plan?.entitlements ?? null;
  }
}

export default SubscriptionPlanCatalogService;
