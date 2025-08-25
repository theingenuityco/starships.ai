/**
 * Starship management routes for Aether Core
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  StarshipRepository,
  AgentRepository,
  Starship,
  VisionRepository,
  ConnectorConfigTemplateRepository,
  ConnectorConfigHistoryRepository,
  UserRepository,
} from '@starships/models';
import {
  EnhancedValidationError as ValidationError,
  EnhancedConstraintViolationError as ConstraintViolationError,
  EnhancedNotFoundError as NotFoundError,
} from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import { SubscriptionService } from '../services/SubscriptionService';

/**
 * Error handling helper to convert custom errors to appropriate HTTP responses
 */
const handleError = (error: any, res: Response, context: string): void => {
  console.error(`[STARSHIPS] ${context}:`, error);

  if (error instanceof ValidationError) {
    res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      field: error.field,
    });
    return;
  }

  if (error instanceof ConstraintViolationError) {
    const statusCode = error.constraintType === 'unique' ? 409 : 400;
    res.status(statusCode).json({
      error: 'Constraint Violation',
      message: error.message,
      constraintType: error.constraintType,
    });
    return;
  }

  if (error instanceof NotFoundError) {
    res.status(404).json({
      error: 'Not Found',
      message: error.message,
      entityType: error.entityType,
      entityId: error.entityId,
    });
    return;
  }

  // Handle generic errors
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(500).json({
    error: 'Internal Server Error',
    message: `${context}: ${message}`,
  });
};

const router: Router = Router();

// Repository dependencies
let starshipRepo: StarshipRepository;
let agentRepo: AgentRepository;
let userRepo: UserRepository;
let configTemplateRepo: ConnectorConfigTemplateRepository;
let configHistoryRepo: ConnectorConfigHistoryRepository;
let visionRepo: VisionRepository;

export function initializeStarshipRoutes(deps: {
  starshipRepository: StarshipRepository;
  agentRepository: AgentRepository;
  userRepository: UserRepository;
  connectorConfigTemplateRepository: ConnectorConfigTemplateRepository;
  connectorConfigHistoryRepository: ConnectorConfigHistoryRepository;
  visionRepository: VisionRepository;
}) {
  starshipRepo = deps.starshipRepository;
  agentRepo = deps.agentRepository;
  userRepo = deps.userRepository;
  configTemplateRepo = deps.connectorConfigTemplateRepository;
  configHistoryRepo = deps.connectorConfigHistoryRepository;
  visionRepo = deps.visionRepository;
}

// GET /starships - Get user's starships
router.get('/starships', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const starships = await starshipRepo.findByOwner(userId);
    res.json({ starships });
  } catch (error) {
    console.error('Error fetching starships:', error);
    res.status(500).json({ error: 'Failed to fetch starships' });
  }
});

// POST /starships - Create new starship
router.post('/starships', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { name, class: starshipClass } = req.body;

    console.log('[STARSHIP-CREATE] Starting starship creation for user:', userId);

    if (!name || !starshipClass) {
      res.status(400).json({
        error: 'Missing required fields',
        details: 'Both name and class are required to create a starship',
        required_fields: ['name', 'class'],
        provided: { name: !!name, class: !!starshipClass },
      });
      return;
    }

    // Validate starship class
    if (!['scout', 'cruiser', 'draught'].includes(starshipClass)) {
      res.status(400).json({
        error: 'Invalid starship class',
        details: 'Starship class must be scout, cruiser, or draught',
        allowed_values: ['scout', 'cruiser', 'draught'],
        provided: starshipClass,
      });
      return;
    }

    // Check Scout plan limit (max 3 starships per user)
    if (starshipClass === 'scout') {
      console.log('[STARSHIP-CREATE] Checking Scout plan limit...');
      const existingStarships = await starshipRepo.findByOwner(userId);
      const scoutStarships = existingStarships.filter((s: any) => s.class === 'scout');
      
      if (scoutStarships.length >= 3) {
        console.log('[STARSHIP-CREATE] Scout limit reached. User has', scoutStarships.length, 'Scout starships');
        res.status(403).json({
          error: 'Scout plan limit reached',
          details: 'Scout plan allows a maximum of 3 starships. Please upgrade to Cruiser or Draught plan for more starships.',
          current_count: scoutStarships.length,
          limit: 3,
          upgrade_options: ['cruiser', 'draught']
        });
        return;
      }
      console.log('[STARSHIP-CREATE] Scout limit check passed. User has', scoutStarships.length, 'Scout starships');
    }

    console.log('[STARSHIP-CREATE] Generating unique slug...');
    // Generate unique slug for the starship
    const slug = await starshipRepo.generateUniqueSlug(name, userId);
    console.log('[STARSHIP-CREATE] Generated slug:', slug);

    console.log('[STARSHIP-CREATE] Creating starship in database...');
    // Create starship directly (bypassing codex system)
    const starship = await starshipRepo.create({
      ownerId: userId,
      name,
      class: starshipClass,
      slug,
      status: 'active',
    });
    console.log('[STARSHIP-CREATE] Starship created with ID:', starship.id);

    console.log('[STARSHIP-CREATE] Creating empty vision in database...');
    // Create empty vision in database for the new starship
    await visionRepo.create({
      starshipId: starship.id,
      statement: '',
      confidence: 0.5,
      refinementCount: 0,
      lastRefined: new Date().toISOString(),
      isActive: true,
    });
    console.log('[STARSHIP-CREATE] Vision created successfully in database');

    console.log('[STARSHIP-CREATE] Starship creation completed successfully');
    res.status(201).json({ starship });
  } catch (error) {
    console.error('[STARSHIP-CREATE] Error creating starship:', error);
    res.status(500).json({ error: 'Failed to create starship' });
  }
});

// POST /api/starships/create-paid - Create starship for paid plan
router.post('/starships/create-paid', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { name, plan, billingPeriod } = req.body;

    console.log('[STARSHIP-CREATE-PAID] Starting paid starship creation for user:', userId);

    // Validate required fields
    if (!name || !plan || !billingPeriod) {
      res.status(400).json({
        error: 'Missing required fields',
        details: 'Name, plan, and billingPeriod are required',
        required_fields: ['name', 'plan', 'billingPeriod'],
        provided: { name: !!name, plan: !!plan, billingPeriod: !!billingPeriod }
      });
      return;
    }

    // Validate paid plan only
    if (!['cruiser', 'draught'].includes(plan)) {
      res.status(400).json({
        error: 'Invalid plan',
        details: 'Plan must be cruiser or draught for paid starships',
        allowed_values: ['cruiser', 'draught'],
        provided: plan
      });
      return;
    }

    // Validate billing period
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      res.status(400).json({
        error: 'Invalid billing period',
        details: 'Billing period must be monthly or yearly',
        allowed_values: ['monthly', 'yearly'],
        provided: billingPeriod
      });
      return;
    }

    console.log('[STARSHIP-CREATE-PAID] Generating unique slug...');
    const slug = await starshipRepo.generateUniqueSlug(name, userId);
    console.log('[STARSHIP-CREATE-PAID] Generated slug:', slug);

    console.log('[STARSHIP-CREATE-PAID] Creating starship with pending_payment status...');
    // Create starship with pending_payment status
    const starship = await starshipRepo.create({
      ownerId: userId,
      name,
      class: plan, // Plan becomes the class
      slug,
      status: 'pending_payment', // CRITICAL: Not active until paid
      plan, // Store plan for billing
      billingPeriod // Store billing period
    });
    console.log('[STARSHIP-CREATE-PAID] Starship created with ID:', starship.id);

    // CRITICAL: Create empty vision for the starship (REQUIRED for all starships)
    console.log('[STARSHIP-CREATE-PAID] Creating empty vision...');
    await visionRepo.create({
      starshipId: starship.id,
      statement: 'Initial Vision Statement',
      confidence: 0.5,
      refinementCount: 0,
      lastRefined: new Date().toISOString(),
      isActive: true
    });

    // Create Stripe checkout session with starshipId
    console.log('[STARSHIP-CREATE-PAID] Creating Stripe checkout session...');
    const subscriptionService = new SubscriptionService(userRepo, starshipRepo);
    
    const checkoutUrl = await subscriptionService.createCheckoutSessionForStarship({
      userId,
      starshipId: starship.id, // Pass the actual starship ID
      starshipSlug: starship.slug, // Pass the slug for redirect URL
      plan,
      billingPeriod
    });

    console.log('[STARSHIP-CREATE-PAID] Checkout session created successfully');
    res.status(201).json({ 
      starship,
      checkoutUrl,
      message: 'Starship created. Redirect to checkout to complete payment.'
    });

  } catch (error) {
    console.error('[STARSHIP-CREATE-PAID] Error creating paid starship:', error);
    res.status(500).json({ error: 'Failed to create paid starship' });
  }
});

// GET /starships/:idOrSlug - Get specific starship (supports both ID and slug)
router.get('/starships/:idOrSlug', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    const userId = (req as any).user!.id;

    // Try to find by ID first, then by slug
    let starship = await starshipRepo.findById(idOrSlug);

    if (!starship) {
      // Try to find by slug
      starship = await starshipRepo.findBySlug(idOrSlug, userId);
    }

    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    // Check ownership
    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get deployed agents
    const agents = await starshipRepo.getDeployedAgents(starship.id);
    const availableSlots = await starshipRepo.getAvailableSlots(starship.id);

    res.json({ starship, agents, availableSlots });
  } catch (error) {
    console.error('Error fetching starship:', error);
    res.status(500).json({ error: 'Failed to fetch starship' });
  }
});

// POST /starships/:id/agents/:agentId/deploy - Deploy agent to starship
router.post(
  '/starships/:id/agents/:agentId/deploy',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipId, agentId } = req.params;

      // Verify starship ownership
      const starship = await starshipRepo.findById(starshipId);
      if (!starship || starship.ownerId !== (req as any).user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify agent exists
      const agent = await agentRepo.findById(agentId);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      // Deploy agent
      await starshipRepo.deployAgent(starshipId, agentId);

      res.json({ message: 'Agent deployed successfully' });
    } catch (error) {
      console.error('Error deploying agent:', error);

      if (error instanceof Error) {
        if (error.message.includes('No available agent slots')) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (error.message.includes('already deployed')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }

      res.status(500).json({ error: 'Failed to deploy agent' });
    }
  }
);

// DELETE /starships/:id/agents/:agentId - Remove agent from starship
router.delete(
  '/starships/:id/agents/:agentId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipId, agentId } = req.params;

      // Verify starship ownership
      const starship = await starshipRepo.findById(starshipId);
      if (!starship || starship.ownerId !== (req as any).user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Remove agent
      const removed = await starshipRepo.removeAgent(starshipId, agentId);

      if (!removed) {
        res.status(404).json({ error: 'Agent not deployed on this starship' });
        return;
      }

      res.json({ message: 'Agent removed successfully' });
    } catch (error) {
      console.error('Error removing agent:', error);
      res.status(500).json({ error: 'Failed to remove agent' });
    }
  }
);

// PUT /starships/:id - Update starship (name, status, class)
router.put('/starships/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;
    const { name, status, class: starshipClass } = req.body;

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Validate allowed updates
    const allowedUpdates: Partial<Starship> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Name must be a non-empty string' });
        return;
      }
      allowedUpdates.name = name.trim();
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        res.status(400).json({ error: 'Status must be one of: active, inactive' });
        return;
      }
      allowedUpdates.status = status;
    }

    if (starshipClass !== undefined) {
      if (!['scout', 'cruiser'].includes(starshipClass)) {
        res.status(400).json({ error: 'Class must be one of: scout, cruiser' });
        return;
      }
      // Check if there are deployed agents that exceed new class limits
      if (starshipClass === 'scout') {
        const deployedAgents = await starshipRepo.getDeployedAgents(starshipId);
        if (deployedAgents.length > 3) {
          res.status(400).json({
            error: 'Cannot change to scout class: too many deployed agents (max 3 for scout)',
          });
          return;
        }
      }
      allowedUpdates.class = starshipClass;
      // Update maxAgents based on new class
      allowedUpdates.maxAgents = starshipClass === 'scout' ? 3 : 6;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      res.status(400).json({ error: 'No valid updates provided' });
      return;
    }

    const updatedStarship = await starshipRepo.update(starshipId, allowedUpdates);
    if (!updatedStarship) {
      res.status(500).json({ error: 'Failed to update starship' });
      return;
    }

    res.json({ starship: updatedStarship });
  } catch (error) {
    console.error('Error updating starship:', error);
    res.status(500).json({ error: 'Failed to update starship' });
  }
});

// DELETE /starships/:id - Cancel subscription first, then delete starship
router.delete('/starships/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;

    console.log(`[STARSHIPS] Delete request for starship ${starshipId} by user ${userId}`);

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // STEP 1: Cancel subscription FIRST (if it exists)
    let subscriptionCancelled = true; // Default to true for free plans
    
    if (starship.subscriptionId && starship.plan !== 'scout') {
      console.log(`[STARSHIPS] Attempting to cancel subscription ${starship.subscriptionId} for starship ${starshipId}`);
      console.log(`[STARSHIPS] Starship plan: ${starship.plan}, billing: ${starship.billingPeriod}`);
      
      const subscriptionService = new SubscriptionService(userRepo, starshipRepo);
      subscriptionCancelled = await subscriptionService.cancelSubscription(starship.subscriptionId);
      
      if (!subscriptionCancelled) {
        // Subscription cancellation failed with a real error - DO NOT delete the starship
        console.error(`[STARSHIPS] Failed to cancel subscription ${starship.subscriptionId} - aborting starship deletion`);
        res.status(400).json({ 
          error: 'Could not cancel subscription. Please contact support or try again later.',
          details: 'There was an error cancelling your subscription. To prevent continued charges, we cannot delete the starship at this time.',
          subscriptionId: starship.subscriptionId
        });
        return;
      }
      
      console.log(`[STARSHIPS] Subscription ${starship.subscriptionId} handled successfully (cancelled or already cancelled)`);
    } else if (!starship.subscriptionId && starship.plan !== 'scout') {
      console.log(`[STARSHIPS] Warning: Paid starship ${starshipId} has no subscription ID`);
    }

    // STEP 2: Only delete starship if subscription was cancelled (or doesn't exist)
    console.log(`[STARSHIPS] Proceeding to delete starship ${starshipId} after successful subscription handling`);
    const deleted = await starshipRepo.delete(starshipId);
    
    if (!deleted) {
      // Starship deletion failed but subscription was already cancelled
      console.error(`[STARSHIPS] Critical: Subscription cancelled but starship deletion failed for ${starshipId}`);
      res.status(500).json({ 
        error: 'Subscription was cancelled but starship deletion failed. Please contact support.',
        warning: 'Your subscription has been cancelled and you will not be charged further.',
        subscriptionCancelled: true
      });
      return;
    }

    console.log(`[STARSHIPS] Successfully deleted starship ${starshipId}`);

    // Return success response
    res.json({ 
      message: 'Starship deleted successfully',
      starshipId,
      subscriptionCancelled,
      refundInfo: starship.subscriptionId && starship.plan !== 'scout'
        ? 'Subscription cancelled immediately. No refund will be issued for the remaining billing period.' 
        : null
    });
  } catch (error) {
    console.error('Error deleting starship:', error);
    res.status(500).json({ error: 'Failed to process starship deletion' });
  }
});

// GET /starships/:id/agents - Get detailed agent information for starship
router.get('/starships/:id/agents', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get deployed agents and available slots
    const deployedAgents = await starshipRepo.getDeployedAgents(starshipId);
    const availableSlots = await starshipRepo.getAvailableSlots(starshipId);

    res.json({
      starshipId,
      starshipName: starship.name,
      starshipClass: starship.class,
      maxAgents: starship.maxAgents,
      deployedAgents,
      availableSlots,
      deployedCount: deployedAgents.length,
    });
  } catch (error) {
    console.error('Error fetching starship agents:', error);
    res.status(500).json({ error: 'Failed to fetch starship agents' });
  }
});

// Get pricing data  
router.get('/pricing', async (req: Request, res: Response) => {
  try {
    const subscriptionService = new SubscriptionService(
      userRepo,
      starshipRepo
    );
    const pricing = await subscriptionService.getPricingData();
    res.json(pricing);
  } catch (error) {
    handleError(error, res, 'Failed to fetch pricing');
  }
});

// Create checkout session
router.post('/checkout-session', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { starshipName, plan, billingPeriod } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!starshipName || !plan || !billingPeriod) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Validate plan
    if (!['cruiser', 'draught'].includes(plan)) {
      res.status(400).json({ error: 'Invalid plan. Must be cruiser or draught' });
      return;
    }

    const subscriptionService = new SubscriptionService(
      userRepo,
      starshipRepo
    );
    const checkoutUrl = await subscriptionService.createCheckoutSession({
      userId,
      starshipName,
      plan,
      billingPeriod,
    });
    
    res.json({ url: checkoutUrl });
  } catch (error) {
    handleError(error, res, 'Failed to create checkout session');
  }
});

// Create billing portal session  
router.post('/:id/billing-portal', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const subscriptionService = new SubscriptionService(
      userRepo,
      starshipRepo
    );
    const portalUrl = await subscriptionService.createPortalSession(starshipId, userId);
    res.json({ url: portalUrl });
  } catch (error) {
    handleError(error, res, 'Failed to create billing portal');
  }
});

// POST /starships/:id/retry-payment - Retry payment for pending starship
router.post('/starships/:id/retry-payment', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get starship and verify ownership
    const starship = await starshipRepo.findById(starshipId);
    
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Only allow retry for pending_payment status
    if (starship.status !== 'pending_payment') {
      res.status(400).json({ 
        error: 'Invalid status',
        details: 'Can only retry payment for starships with pending_payment status',
        currentStatus: starship.status
      });
      return;
    }

    // Verify starship has plan and billing period
    if (!starship.plan || !starship.billingPeriod) {
      res.status(400).json({ 
        error: 'Invalid starship configuration',
        details: 'Starship is missing plan or billing period'
      });
      return;
    }

    console.log('[RETRY-PAYMENT] Creating new checkout session for starship:', starshipId);
    
    // Create new checkout session
    const subscriptionService = new SubscriptionService(userRepo, starshipRepo);
    const checkoutUrl = await subscriptionService.createCheckoutSessionForStarship({
      userId,
      starshipId: starship.id,
      starshipSlug: starship.slug,
      plan: starship.plan as 'cruiser' | 'draught',
      billingPeriod: starship.billingPeriod as 'monthly' | 'yearly'
    });

    res.json({ 
      checkoutUrl,
      message: 'New checkout session created. Redirect to complete payment.'
    });

  } catch (error) {
    handleError(error, res, 'Failed to create checkout session for retry');
  }
});

export default router;
