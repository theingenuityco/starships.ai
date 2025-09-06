/**
 * Starship management routes for Aether Core
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { StarshipService } from '@/services/StarshipService';
import { SubscriptionService } from '@/services/SubscriptionService';
import { createPaginationMeta, handleCommonError, sendError, sendSuccess, validatePagination, validateUUID } from '@/utils/responseHelpers';
import type { StarshipModel } from '@starships/protocol';
import type { Request, Response } from 'express';
import { Router } from 'express';

const router: Router = Router();

// GET /starships - Get user's starships (OpenAPI pattern)
router.get('/starships', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.id;
    const { page, limit, error: paginationError } = validatePagination(req.query.page as string, req.query.limit as string);

    if (paginationError) {
      sendError(res, paginationError.code, paginationError.message, 400);
      return;
    }

    const starshipService = new StarshipService();
    const starships = await starshipService.getStarshipsByOwner(userId);

    // Apply pagination
    const total = starships.length;
    const offset = (page - 1) * limit;
    const paginatedStarships = starships.slice(offset, offset + limit);

    sendSuccess(res, paginatedStarships, 200, createPaginationMeta(page, limit, total));
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching starships')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starships');
    }
  }
});

// POST /starships/create-paid - Create paid starship with pending payment status (OpenAPI pattern)
router.post('/starships/create-paid', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.id;
    const { name, plan, billingPeriod } = req.body;

    console.log('[STARSHIP-CREATE-PAID] Starting paid starship creation for user:', userId);

    // Validate required fields
    if (!name || !plan || !billingPeriod) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'Missing required fields', 400, {
        required_fields: ['name', 'plan', 'billingPeriod'],
        provided: { name: !!name, plan: !!plan, billingPeriod: !!billingPeriod },
      });
      return;
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'Name must be a non-empty string', 400, {
        field: 'name',
      });
      return;
    }

    // Validate paid plan only
    if (!['cruiser', 'draught'].includes(plan)) {
      sendError(res, 'INVALID_INPUT', 'Invalid paid plan', 400, {
        field: 'plan',
        allowed_values: ['cruiser', 'draught'],
        provided: plan,
      });
      return;
    }

    // Validate billing period
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      sendError(res, 'INVALID_INPUT', 'Invalid billing period', 400, {
        field: 'billingPeriod',
        allowed_values: ['monthly', 'yearly'],
        provided: billingPeriod,
      });
      return;
    }

    console.log('[STARSHIP-CREATE-PAID] Creating paid starship...');

    const starshipService = new StarshipService();
    const slug = await starshipService.generateUniqueSlug(name.trim(), userId);
    const starship = await starshipService.createPaidStarship({
      ownerId: userId,
      name: name.trim(),
      class: plan,
      slug,
      plan,
      billingPeriod,
    });

    // Create Stripe checkout session
    const subscriptionService = new SubscriptionService();
    const checkoutUrl = await subscriptionService.createCheckoutSessionForStarship({
      userId,
      starshipId: starship.id,
      starshipSlug: starship.slug,
      plan,
      billingPeriod,
    });

    sendSuccess(
      res,
      {
        starship,
        checkoutUrl,
        message: 'Starship created. Redirect to checkout to complete payment.',
      },
      201
    );
  } catch (error) {
    if (!handleCommonError(error, res, 'creating paid starship')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create paid starship');
    }
  }
});

// POST /starships - Create new starship (OpenAPI pattern)
router.post('/starships', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.id;
    const { name, class: starshipClass, plan, billingPeriod } = req.body;

    console.log('[STARSHIP-CREATE] Starting starship creation for user:', userId);

    // Validate required fields
    if (!name || !starshipClass) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'Missing required fields', 400, {
        required_fields: ['name', 'class'],
        provided: { name: !!name, class: !!starshipClass },
      });
      return;
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'Name must be a non-empty string', 400, {
        field: 'name',
      });
      return;
    }

    // Validate starship class
    if (!['scout', 'cruiser', 'draught'].includes(starshipClass)) {
      sendError(res, 'INVALID_INPUT', 'Invalid starship class', 400, {
        field: 'class',
        allowed_values: ['scout', 'cruiser', 'draught'],
        provided: starshipClass,
      });
      return;
    }

    // Handle paid plans - if plan/billingPeriod provided, create paid starship
    if (plan && billingPeriod) {
      // Validate paid plan only
      if (!['cruiser', 'draught'].includes(plan)) {
        sendError(res, 'INVALID_INPUT', 'Invalid paid plan', 400, {
          field: 'plan',
          allowed_values: ['cruiser', 'draught'],
          provided: plan,
        });
        return;
      }

      // Validate billing period
      if (!['monthly', 'yearly'].includes(billingPeriod)) {
        sendError(res, 'INVALID_INPUT', 'Invalid billing period', 400, {
          field: 'billingPeriod',
          allowed_values: ['monthly', 'yearly'],
          provided: billingPeriod,
        });
        return;
      }

      console.log('[STARSHIP-CREATE-PAID] Creating paid starship...');

      const starshipService = new StarshipService();
      const slug = await starshipService.generateUniqueSlug(name.trim(), userId);
      const starship = await starshipService.createPaidStarship({
        ownerId: userId,
        name: name.trim(),
        class: plan,
        slug,
        plan,
        billingPeriod,
      });

      // Create Stripe checkout session
      const subscriptionService = new SubscriptionService();
      const checkoutUrl = await subscriptionService.createCheckoutSessionForStarship({
        userId,
        starshipId: starship.id,
        starshipSlug: starship.slug,
        plan,
        billingPeriod,
      });

      sendSuccess(
        res,
        {
          starship,
          checkoutUrl,
          message: 'Starship created. Redirect to checkout to complete payment.',
        },
        201
      );
      return;
    }

    const starshipService = new StarshipService();

    // Check Scout plan limit (max 3 starships per user)
    if (starshipClass === 'scout') {
      console.log('[STARSHIP-CREATE] Checking Scout plan limit...');
      const canCreate = await starshipService.canCreateScoutStarship(userId);

      if (!canCreate) {
        console.log('[STARSHIP-CREATE] Scout limit reached.');
        sendError(res, 'QUOTA_EXCEEDED', 'Scout plan limit reached', 403, {
          message: 'Scout plan allows a maximum of 3 starships. Please upgrade to Cruiser or Draught plan for more starships.',
          current_count: 3,
          limit: 3,
          upgrade_options: ['cruiser', 'draught'],
        });
        return;
      }
      console.log('[STARSHIP-CREATE] Scout limit check passed.');
    }

    console.log('[STARSHIP-CREATE] Generating unique slug...');
    const slug = await starshipService.generateUniqueSlug(name.trim(), userId);
    console.log('[STARSHIP-CREATE] Generated slug:', slug);

    console.log('[STARSHIP-CREATE] Creating starship in database...');
    const starship = await starshipService.createStarship({
      ownerId: userId,
      name: name.trim(),
      class: starshipClass,
      slug,
    });
    console.log('[STARSHIP-CREATE] Starship created with ID:', starship.id);

    sendSuccess(
      res,
      {
        starship,
        message: 'Starship created successfully',
      },
      201
    );
  } catch (error) {
    if (!handleCommonError(error, res, 'creating starship')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create starship');
    }
  }
});

// GET /starships/:id - Get specific starship (supports both ID and slug) (OpenAPI pattern)
router.get('/starships/:idOrSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { idOrSlug } = req.params;
    const userId = (req as any).user!.id;

    const starshipService = new StarshipService();
    // Try to find by ID first, then by slug
    let starship = await starshipService.getStarship(idOrSlug, userId);

    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: idOrSlug,
      });
      return;
    }

    // Check ownership
    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Get deployed agents and available slots
    const starshipDetails = await starshipService.getStarshipWithDetails(starship.id);
    const agents = starshipDetails?.agents || [];
    const availableSlots = starshipDetails?.availableSlots || 0;

    sendSuccess(res, {
      starship,
      agents,
      availableSlots,
    });
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching starship')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starship');
    }
  }
});

// POST /starships/:id/agents/:agentId - Deploy agent to starship (OpenAPI pattern)
router.post('/starships/:id/agents/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, agentId } = req.params;

    // Validate UUIDs
    const { isValid: starshipValid, error: starshipError } = validateUUID(starshipId, 'starshipId');
    if (!starshipValid && starshipError) {
      sendError(res, starshipError.code, starshipError.message, 400, starshipError.details);
      return;
    }

    const { isValid: agentValid, error: agentError } = validateUUID(agentId, 'agentId');
    if (!agentValid && agentError) {
      sendError(res, agentError.code, agentError.message, 400, agentError.details);
      return;
    }

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== (req as any).user!.id) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Deploy agent (service will verify agent exists)
    await starshipService.deployAgent(starshipId, agentId);

    sendSuccess(res, { message: 'Agent deployed successfully' }, 201);
  } catch (error) {
    console.error('Error deploying agent:', error);

    if (error instanceof Error) {
      if (error.message.includes('No available agent slots')) {
        sendError(res, 'OPERATION_NOT_ALLOWED', error.message, 400);
        return;
      }
      if (error.message.includes('already deployed')) {
        sendError(res, 'RESOURCE_CONFLICT', error.message, 409);
        return;
      }
    }

    if (!handleCommonError(error, res, 'deploying agent')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to deploy agent');
    }
  }
});

// DELETE /starships/:id/agents/:agentId - Remove agent from starship (OpenAPI pattern)
router.delete('/starships/:id/agents/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, agentId } = req.params;

    // Validate UUIDs
    const { isValid: starshipValid, error: starshipError } = validateUUID(starshipId, 'starshipId');
    if (!starshipValid && starshipError) {
      sendError(res, starshipError.code, starshipError.message, 400, starshipError.details);
      return;
    }

    const { isValid: agentValid, error: agentError } = validateUUID(agentId, 'agentId');
    if (!agentValid && agentError) {
      sendError(res, agentError.code, agentError.message, 400, agentError.details);
      return;
    }

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== (req as any).user!.id) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Remove agent
    const removed = await starshipService.removeAgent(starshipId, agentId);
    if (!removed) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not deployed on this starship', 404, {
        resource: 'deployed_agent',
        starshipId,
        agentId,
      });
      return;
    }

    // Return 204 No Content for successful deletion
    res.status(204).send();
  } catch (error) {
    if (!handleCommonError(error, res, 'removing agent')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to remove agent');
    }
  }
});

// PUT /starships/:id - Update starship (name, status, class) (OpenAPI pattern)
router.put('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;
    const { name, status, class: starshipClass } = req.body;

    // Validate starship ID
    const { isValid, error } = validateUUID(starshipId, 'starshipId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Validate allowed updates
    const allowedUpdates: Partial<StarshipModel> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        sendError(res, 'VALIDATION_ERROR', 'Name must be a non-empty string', 400, {
          field: 'name',
        });
        return;
      }
      allowedUpdates.name = name.trim();
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        sendError(res, 'INVALID_INPUT', 'Invalid status value', 400, {
          field: 'status',
          allowed_values: ['active', 'inactive'],
          provided: status,
        });
        return;
      }
      allowedUpdates.status = status;
    }

    if (starshipClass !== undefined) {
      if (!['scout', 'cruiser', 'draught'].includes(starshipClass)) {
        sendError(res, 'INVALID_INPUT', 'Invalid starship class', 400, {
          field: 'class',
          allowed_values: ['scout', 'cruiser', 'draught'],
          provided: starshipClass,
        });
        return;
      }

      // Check if there are deployed agents that exceed new class limits
      if (starshipClass === 'scout') {
        const deployedAgents = await starshipService.getDeployedAgents(starshipId);
        if (deployedAgents.length > 3) {
          sendError(res, 'OPERATION_NOT_ALLOWED', 'Cannot change to scout class: too many deployed agents', 400, {
            message: 'Scout class allows maximum 3 deployed agents',
            current_deployed: deployedAgents.length,
            max_allowed: 3,
          });
          return;
        }
      }

      allowedUpdates.class = starshipClass;
      allowedUpdates.maxAgents = starshipClass === 'scout' ? 3 : 6;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'No valid updates provided', 400, {
        message: 'At least one valid field must be provided for update',
        allowed_fields: ['name', 'status', 'class'],
      });
      return;
    }

    const updatedStarship = await starshipService.updateStarship(starshipId, allowedUpdates);
    if (!updatedStarship) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update starship in database');
      return;
    }

    sendSuccess(res, updatedStarship);
  } catch (error) {
    if (!handleCommonError(error, res, 'updating starship')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update starship');
    }
  }
});

// DELETE /starships/:id - Cancel subscription first, then delete starship (OpenAPI pattern)
router.delete('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;

    console.log(`[STARSHIPS] Delete request for starship ${starshipId} by user ${userId}`);

    // Validate starship ID
    const { isValid, error } = validateUUID(starshipId, 'starshipId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // STEP 1: Cancel subscription FIRST (if it exists)
    let subscriptionCancelled = true; // Default to true for free plans

    if (starship.subscriptionId && starship.plan !== 'scout') {
      console.log(`[STARSHIPS] Attempting to cancel subscription ${starship.subscriptionId} for starship ${starshipId}`);
      console.log(`[STARSHIPS] Starship plan: ${starship.plan}, billing: ${starship.billingPeriod}`);

      const subscriptionService = new SubscriptionService();
      subscriptionCancelled = await subscriptionService.cancelSubscription(starship.subscriptionId);

      if (!subscriptionCancelled) {
        // Subscription cancellation failed with a real error - DO NOT delete the starship
        console.error(`[STARSHIPS] Failed to cancel subscription ${starship.subscriptionId} - aborting starship deletion`);
        sendError(res, 'SERVICE_UNAVAILABLE', 'Could not cancel subscription', 400, {
          message:
            'There was an error cancelling your subscription. To prevent continued charges, we cannot delete the starship at this time.',
          subscriptionId: starship.subscriptionId,
          action: 'Please contact support or try again later.',
        });
        return;
      }

      console.log(`[STARSHIPS] Subscription ${starship.subscriptionId} handled successfully (cancelled or already cancelled)`);
    } else if (!starship.subscriptionId && starship.plan !== 'scout') {
      console.log(`[STARSHIPS] Warning: Paid starship ${starshipId} has no subscription ID`);
    }

    // STEP 2: Only delete starship if subscription was cancelled (or doesn't exist)
    console.log(`[STARSHIPS] Proceeding to delete starship ${starshipId} after successful subscription handling`);
    const deleted = await starshipService.deleteStarship(starshipId);

    if (!deleted) {
      // Starship deletion failed but subscription was already cancelled
      console.error(`[STARSHIPS] Critical: Subscription cancelled but starship deletion failed for ${starshipId}`);
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Starship deletion failed after subscription cancellation', 500, {
        message: 'Subscription was cancelled but starship deletion failed. Please contact support.',
        warning: 'Your subscription has been cancelled and you will not be charged further.',
        subscriptionCancelled: true,
      });
      return;
    }

    console.log(`[STARSHIPS] Successfully deleted starship ${starshipId}`);

    // Return success with additional info (not 204 due to metadata)
    sendSuccess(res, {
      message: 'Starship deleted successfully',
      starshipId,
      subscriptionCancelled,
      refundInfo:
        starship.subscriptionId && starship.plan !== 'scout'
          ? 'Subscription cancelled immediately. No refund will be issued for the remaining billing period.'
          : null,
    });
  } catch (error) {
    if (!handleCommonError(error, res, 'deleting starship')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to process starship deletion');
    }
  }
});

// GET /starships/:id/agents - Get detailed agent information for starship (OpenAPI pattern)
router.get('/starships/:id/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;

    // Validate starship ID
    const { isValid, error } = validateUUID(starshipId, 'starshipId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Get deployed agents and available slots
    const deployedAgents = await starshipService.getDeployedAgents(starshipId);
    const availableSlots = await starshipService.getAvailableSlots(starshipId);

    sendSuccess(res, {
      starshipId,
      starshipName: starship.name,
      starshipClass: starship.class,
      maxAgents: starship.maxAgents,
      deployedAgents,
      availableSlots,
      deployedCount: deployedAgents.length,
    });
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching starship agents')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starship agents');
    }
  }
});

// Move these routes to separate endpoints following OpenAPI pattern

// GET /starships/pricing - Get pricing data (OpenAPI pattern)
router.get('/starships/pricing', async (req: Request, res: Response): Promise<void> => {
  try {
    const subscriptionService = new SubscriptionService();
    const pricing = await subscriptionService.getPricingData();
    sendSuccess(res, pricing);
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching pricing')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch pricing');
    }
  }
});

// POST /starships/checkout-sessions - Create checkout session (OpenAPI pattern)
router.post('/starships/checkout-sessions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { starshipName, plan, billingPeriod } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'Authentication required', 401);
      return;
    }

    // Validate required fields
    if (!starshipName || !plan || !billingPeriod) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'Missing required fields', 400, {
        required_fields: ['starshipName', 'plan', 'billingPeriod'],
        provided: { starshipName: !!starshipName, plan: !!plan, billingPeriod: !!billingPeriod },
      });
      return;
    }

    // Validate plan
    if (!['cruiser', 'draught'].includes(plan)) {
      sendError(res, 'INVALID_INPUT', 'Invalid plan', 400, {
        field: 'plan',
        allowed_values: ['cruiser', 'draught'],
        provided: plan,
      });
      return;
    }

    // Validate billing period
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      sendError(res, 'INVALID_INPUT', 'Invalid billing period', 400, {
        field: 'billingPeriod',
        allowed_values: ['monthly', 'yearly'],
        provided: billingPeriod,
      });
      return;
    }

    const subscriptionService = new SubscriptionService();
    const checkoutUrl = await subscriptionService.createCheckoutSession({
      userId,
      starshipName,
      plan,
      billingPeriod,
    });

    sendSuccess(res, { url: checkoutUrl }, 201);
  } catch (error) {
    if (!handleCommonError(error, res, 'creating checkout session')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create checkout session');
    }
  }
});

// POST /starships/:id/billing-portal - Create billing portal session (OpenAPI pattern)
router.post('/starships/:id/billing-portal', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'Authentication required', 401);
      return;
    }

    // Validate starship ID
    const { isValid, error } = validateUUID(starshipId, 'starshipId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const subscriptionService = new SubscriptionService();
    const portalUrl = await subscriptionService.createPortalSession(starshipId, userId);

    sendSuccess(res, { url: portalUrl }, 201);
  } catch (error) {
    if (!handleCommonError(error, res, 'creating billing portal')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create billing portal');
    }
  }
});

// POST /starships/:id/retry-payment - Retry payment for pending starship (OpenAPI pattern)
router.post('/starships/:id/retry-payment', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'Authentication required', 401);
      return;
    }

    // Validate starship ID
    const { isValid, error } = validateUUID(starshipId, 'starshipId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const starshipService = new StarshipService();

    // Get starship and verify ownership
    const starship = await starshipService.getStarship(starshipId);

    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Only allow retry for pending_payment status
    if (starship.status !== 'pending_payment') {
      sendError(res, 'OPERATION_NOT_ALLOWED', 'Invalid status for payment retry', 400, {
        message: 'Can only retry payment for starships with pending_payment status',
        currentStatus: starship.status,
        allowedStatus: 'pending_payment',
      });
      return;
    }

    // Verify starship has plan and billing period
    if (!starship.plan || !starship.billingPeriod) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid starship configuration', 400, {
        message: 'Starship is missing plan or billing period',
        missing: {
          plan: !starship.plan,
          billingPeriod: !starship.billingPeriod,
        },
      });
      return;
    }

    console.log('[RETRY-PAYMENT] Creating new checkout session for starship:', starshipId);

    // Create new checkout session
    const subscriptionService = new SubscriptionService();
    const checkoutUrl = await subscriptionService.createCheckoutSessionForStarship({
      userId,
      starshipId: starship.id,
      starshipSlug: starship.slug,
      plan: starship.plan as 'cruiser' | 'draught',
      billingPeriod: starship.billingPeriod as 'monthly' | 'yearly',
    });

    sendSuccess(
      res,
      {
        checkoutUrl,
        message: 'New checkout session created. Redirect to complete payment.',
      },
      201
    );
  } catch (error) {
    if (!handleCommonError(error, res, 'creating checkout session for retry')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create checkout session for retry');
    }
  }
});

export default router;
