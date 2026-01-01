import { Router } from 'express';
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { rateLimiters } from '@/middleware/rateLimiter';
import { sendSuccess, handleError } from '@/utils/responseHelpers';
import { getEnvConfig } from '@starships/env';

const envConfig = getEnvConfig();
const stripe = new Stripe(envConfig.STRIPE_SECRET_KEY);
const router: Router = Router();

/**
 * GET /subscriptions/plans
 *
 * Returns active recurring Stripe prices that define ship classes via metadata (Option A).
 *
 * Required price metadata keys:
 * - ship_class
 * - max_agents
 * - max_concurrent_turns
 * - monthly_credits
 *
 * Optional:
 * - display_name
 * - description
 */
router.get('/subscriptions/plans', rateLimiters.apiAuthenticated, jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
        const shipClass = (md.ship_class || md.shipClass || '').toString();
        const maxAgents = Number(md.max_agents ?? md.maxAgents);
        const maxConcurrentTurns = Number(md.max_concurrent_turns ?? md.maxConcurrentTurns);
        const monthlyCredits = Number(md.monthly_credits ?? md.monthlyCredits);
        const displayName = (md.display_name || md.displayName || '').toString();
        const description = (md.description || '').toString();

        // Only include well-formed plans
        if (!shipClass) return null;
        if (!Number.isFinite(maxAgents) || !Number.isFinite(maxConcurrentTurns) || !Number.isFinite(monthlyCredits)) return null;

        const unitAmount = typeof p.unit_amount === 'number' ? p.unit_amount : null;
        const interval = p.recurring?.interval || null;

        return {
          priceId: p.id,
          productId: typeof p.product === 'string' ? p.product : p.product?.id,
          shipClass,
          displayName: displayName || shipClass,
          description: description || (typeof p.product === 'string' ? '' : (p.product as any)?.description || ''),
          currency: p.currency,
          unitAmount, // cents
          interval,
          entitlements: {
            maxAgents: Math.trunc(maxAgents),
            maxConcurrentTurns: Math.trunc(maxConcurrentTurns),
            monthlyCredits: Math.trunc(monthlyCredits),
          },
        };
      })
      .filter(Boolean);

    sendSuccess(res, { plans }, 200);
  } catch (error) {
    handleError(error, res, 'listing subscription plans');
  }
});

export default router;


