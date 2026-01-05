import { Router } from 'express';
import type { Request, Response } from 'express';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { rateLimiters } from '@/middleware/rateLimiter';
import { sendSuccess, handleError } from '@/utils/responseHelpers';
import { SubscriptionPlanCatalogService } from '@/services/SubscriptionPlanCatalogService';

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
    const plans = await SubscriptionPlanCatalogService.listPlans();

    sendSuccess(res, { plans }, 200);
  } catch (error) {
    handleError(error, res, 'listing subscription plans');
  }
});

export default router;


