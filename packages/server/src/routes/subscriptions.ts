import { Router } from 'express';
import { StripeService } from '../services/StripeService';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

const router: Router = Router();

/**
 * Get all available subscription plans
 */
router.get('/plans', authMiddleware, async (req: Request, res: Response) => {
  try {
    console.log(`[SUBSCRIPTIONS] Fetching plans for user: ${req.user!.id}`);
    const plans = await StripeService.getSubscriptionPlans();
    res.json(plans);
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get a specific subscription plan by product ID
 */
router.get('/plans/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`[SUBSCRIPTIONS] Fetching plan ${id} for user: ${req.user!.id}`);
    
    const plan = await StripeService.getSubscriptionPlan(id);
    if (!plan) {
      res.status(404).json({ error: 'Subscription plan not found' });
    } else {
      res.json(plan);
    }
  } catch (error) {
    console.error('Error fetching subscription plan:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;