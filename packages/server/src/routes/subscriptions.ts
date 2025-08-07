import { Router } from 'express';
import { StripeService } from '../services/StripeService';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getConnection, Subscription } from '@starships/models';

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

/**
 * Create checkout session - SIMPLE VERSION
 */
router.post('/checkout', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { priceId } = req.body;
    
    if (!priceId) {
      res.status(400).json({ error: 'Price ID is required' });
      return;
    }

    console.log(`[SUBSCRIPTIONS] Creating checkout for user: ${req.user!.id}, price: ${priceId}`);
    
    const checkoutSession = await StripeService.createCheckoutSession(priceId, req.user!.id);
    
    res.json(checkoutSession);  // Just return { url: "stripe-checkout-url" }
    
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Verify checkout session status after payment attempt
 */
router.get('/verify-session/:sessionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`[SUBSCRIPTIONS] Verifying session: ${sessionId} for user: ${req.user!.id}`);
    
    const sessionStatus = await StripeService.verifyCheckoutSession(sessionId);
    
    res.json(sessionStatus);
    
  } catch (error) {
    console.error('Error verifying checkout session:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get current user's subscription status for feature gating
 */
router.get('/current', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    console.log(`[SUBSCRIPTIONS] Getting current subscription for user: ${userId}`);
    
    const connection = getConnection();
    
    // Industry standard: Check expiration at query time
    // Get user's subscription that is both active AND not expired
    const result = await connection.executeQuery<{ s: Subscription }>(`
      MATCH (user:User {id: $userId})-[:HAS_SUBSCRIPTION]->(s:Subscription)
      WHERE s.status = 'active' 
        AND datetime(s.currentPeriodEnd) > datetime()
      RETURN s
      ORDER BY s.createdAt DESC
      LIMIT 1
    `, { userId });
    
    const subscription = result.length > 0 ? result[0].s : null;
    const planId = subscription?.planId || 'scout';  // Default to scout if no active subscription
    const isActive = !!subscription;
    
    // Get plan features from actual Stripe data
    let planFeatures;
    try {
      const stripePlans = await StripeService.getSubscriptionPlans();
      
      // Find the plan by matching the planId with Stripe plan names or metadata
      const stripePlan = stripePlans.find(p => 
        p.name.toLowerCase().includes(planId.toLowerCase()) ||
        p.id.toLowerCase().includes(planId.toLowerCase())
      );
      
      if (stripePlan) {
        planFeatures = stripePlan.features;
        console.log(`[SUBSCRIPTIONS] Found plan features for ${planId} from Stripe:`, stripePlan.name);
      } else {
        // If we can't find the plan in Stripe, default to scout plan features
        const scoutPlan = stripePlans.find(p => 
          p.name.toLowerCase().includes('scout')
        );
        
        if (scoutPlan) {
          planFeatures = scoutPlan.features;
          console.log(`[SUBSCRIPTIONS] Plan ${planId} not found, using Scout plan features from Stripe`);
        } else {
          console.warn(`[SUBSCRIPTIONS] Could not find any plan in Stripe, using fallback`);
          planFeatures = getDefaultScoutFeatures();
        }
      }
    } catch (error) {
      console.error('[SUBSCRIPTIONS] Error fetching plan features from Stripe:', error);
      planFeatures = getDefaultScoutFeatures();
    }
    
    res.json({
      plan: planId,
      isActive,
      features: planFeatures,
      subscription: subscription ? {
        currentPeriodEnd: subscription.currentPeriodEnd,
        stripeCustomerId: subscription.stripeCustomerId,
        status: subscription.status
      } : null
    });
    
  } catch (error) {
    console.error('[SUBSCRIPTIONS] Error getting current subscription:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Fallback function for default scout features (matches Stripe config as last resort)
function getDefaultScoutFeatures() {
  return {
    agents: 3,
    firstOfficer: true,  // Updated to match Stripe config
    mcps: 2,             // Updated to match Stripe config  
    expeditionsParallel: 1,
    artifactStorageGB: 5,
    tokenRateLimit: 20000  // Updated to match Stripe config
  };
}

export default router;