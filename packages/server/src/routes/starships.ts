/**
 * Starship management routes for Aether Core
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { StarshipService } from '@/services/StarshipService';
import { rateLimiters } from '@/middleware/rateLimiter';
import { AgentService } from '@/services/AgentService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';
import { verifyResourceAccess } from '@/middleware/verify-starship-access';
import type { StarshipModel } from '@starships/protocol';
import type { AuthUser, ImportExportContainerV1 } from '@starships/protocol';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { ImportExportService } from '@/services/ImportExportService';
import { SubscriptionCheckoutService } from '@/services/SubscriptionCheckoutService';
import { SubscriptionManagementService } from '@/services/SubscriptionManagementService';
import { getConnection } from '@starships/models';
import { getEnvConfig } from '@starships/env';
import Stripe from 'stripe';

const router: Router = Router();
const envConfig = getEnvConfig();
const stripe = new Stripe(envConfig.STRIPE_SECRET_KEY);

function requireInstanceAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
    sendError(res, 'FORBIDDEN', 'Only instance admins can import/export agents and tools', 403);
    return;
  }
  next();
}

// Helper function for authentication check
const checkAuth = (req: Request, res: Response): boolean => {
  const user = (req as any).user;
  if (!user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return false;
  }
  return true;
};

// POST /starships - Create new starship (OpenAPI pattern)
router.post('/starships', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.id;
    const { name } = req.body;

    console.log('[STARSHIP-CREATE] Starting starship creation for user:', userId);

    // Validate required fields
    if (!name) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'Missing required fields', 400, {
        required_fields: ['name'],
        provided: { name: !!name },
      });
      return;
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'Name must be a non-empty string', 400, {
        field: 'name',
      });
      return;
    }

    const starshipService = new StarshipService();

    console.log('[STARSHIP-CREATE] Creating starship in database...');
    const starship = await starshipService.createStarship({
      ownerId: userId,
      name: name.trim(),
      // New starships are created as Scout class by default
      shipClass: 'scout',
      maxAgents: 5,
      maxConcurrentTurns: 1,
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
    handleError(error, res, 'creating starship');
  }
});

/**
 * POST /starships/:id/subscribe
 * Starts a Stripe subscription checkout for a given Stripe Price ID.
 *
 * Plan definitions live in Stripe Price metadata (Option A).
 * Request body: { priceId: string }
 */
router.post('/starships/:id/subscribe', rateLimiters.financial, jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id as string;

    const bodyValidation = validateData(
      z.object({
        priceId: z.string().min(1, 'priceId is required'),
      }),
      req.body,
      res,
      'subscription checkout'
    );
    if (!bodyValidation) return;
    const { priceId } = bodyValidation;

    const starshipService = new StarshipService();
    const hasAccess = await starshipService.hasAccess(userId, starshipId);
    if (!hasAccess) {
      sendError(res, 'FORBIDDEN', 'Access denied to this starship', 403);
      return;
    }

    const service = new SubscriptionCheckoutService();
    const { checkoutUrl } = await service.createCheckoutSession({ userId, starshipId, priceId });
    sendSuccess(res, { checkoutUrl }, 201);
  } catch (error) {
    handleError(error, res, 'creating subscription checkout');
  }
});

/**
 * POST /starships/:id/subscription/change
 * Change the starship's subscription plan to the provided Stripe priceId.
 *
 * If no subscription exists yet, falls back to starting a Checkout Session (mode=subscription).
 */
router.post(
  '/starships/:id/subscription/change',
  rateLimiters.financial,
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const starshipId = req.params.id;
      const userId = (req as any).user!.id as string;

      const bodyValidation = validateData(
        z.object({
          priceId: z.string().min(1, 'priceId is required'),
        }),
        req.body,
        res,
        'subscription plan change'
      );
      if (!bodyValidation) return;
      const { priceId } = bodyValidation;

      const starshipService = new StarshipService();
      const hasAccess = await starshipService.hasAccess(userId, starshipId);
      if (!hasAccess) {
        sendError(res, 'FORBIDDEN', 'Access denied to this starship', 403);
        return;
      }

      const svc = new SubscriptionManagementService();
      const result = await svc.changePlan({ userId, starshipId, priceId });
      sendSuccess(res, result, 200);
    } catch (error) {
      handleError(error, res, 'changing subscription plan');
    }
  }
);

/**
 * GET /starships/:id/subscription/status
 * Returns the starship's Stripe subscription renewal/cancellation state for billing UI.
 */
router.get(
  '/starships/:id/subscription/status',
  rateLimiters.apiAuthenticated,
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const starshipId = req.params.id;
      const userId = (req as any).user!.id as string;

      const paramValidation = validateData(z.object({ id: IdSchema }), { id: starshipId }, res, 'subscription status');
      if (!paramValidation) return;

      const starshipService = new StarshipService();
      const hasAccess = await starshipService.hasAccess(userId, starshipId);
      if (!hasAccess) {
        sendError(res, 'FORBIDDEN', 'Access denied to this starship', 403);
        return;
      }

      const connection = getConnection();
      const row = await connection.queryOne<{ stripe_subscription_id: string }>(
        `SELECT stripe_subscription_id
           FROM starship_subscriptions
          WHERE starship_id = $1
            AND status NOT IN ('canceled')
          ORDER BY updated_at DESC
          LIMIT 1`,
        [starshipId]
      );

      if (!row?.stripe_subscription_id) {
        sendSuccess(res, { subscriptionId: null, status: null, cancelAtPeriodEnd: false, renewAt: null }, 200);
        return;
      }

      const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ['items.data'] });
      const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
      const status = subscription.status ?? null;

      const item0 = subscription.items?.data?.[0];
      const currentPeriodEndSeconds =
        (subscription as unknown as { current_period_end?: unknown }).current_period_end ??
        (item0 as unknown as { current_period_end?: unknown } | undefined)?.current_period_end ??
        null;
      const currentPeriodStartSeconds =
        (subscription as unknown as { current_period_start?: unknown }).current_period_start ??
        (item0 as unknown as { current_period_start?: unknown } | undefined)?.current_period_start ??
        null;

      const cpe = typeof currentPeriodEndSeconds === 'number' ? currentPeriodEndSeconds : null;
      const cps = typeof currentPeriodStartSeconds === 'number' ? currentPeriodStartSeconds : null;
      const renewAt = cpe ? new Date(cpe * 1000).toISOString() : null;

      // Best-effort cache into DB for other consumers.
      await connection.query(
        `UPDATE starship_subscriptions
            SET status = COALESCE($2, status),
                cancel_at_period_end = $3,
                current_period_start = COALESCE(to_timestamp($4::double precision), current_period_start),
                current_period_end = COALESCE(to_timestamp($5::double precision), current_period_end),
                updated_at = NOW()
          WHERE starship_id = $1`,
        [starshipId, status, cancelAtPeriodEnd, cps, cpe]
      );

      sendSuccess(res, { subscriptionId: subscription.id, status, cancelAtPeriodEnd, renewAt }, 200);
    } catch (error) {
      handleError(error, res, 'fetching subscription status');
    }
  }
);

// GET /starships/:id - Get specific starship (supports both ID and slug) (OpenAPI pattern)
router.get('/starships/:idOrSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { idOrSlug } = req.params;
    const userId = (req as any).user!.id;

    const starshipService = new StarshipService();
    // Try to find by ID first, then by slug
    const starship = await starshipService.getStarship(idOrSlug, userId);

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

    // Return just the starship model
    // Note: For detailed agent info and available slots, use GET /starships/:id/agents endpoint
    sendSuccess(res, starship);
  } catch (error) {
    handleError(error, res, 'fetching starship');
  }
});

// POST /starships/:id/agents/:agentId - Deploy agent to starship (OpenAPI pattern)
router.post('/starships/:id/agents/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, agentId } = req.params;

    // Validate IDs
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
        agentId: IdSchema,
      }),
      { id: starshipId, agentId },
      res,
      'starship and agent parameters'
    );
    if (!paramValidation) return;

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

    // Authorization: verify user owns the agent (or agent has no starship assigned)
    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);

    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        id: agentId,
      });
      return;
    }

    // If agent is already assigned to a starship, verify user owns that starship
    if (agent.starshipId) {
      if (!(await verifyResourceAccess(agent.starshipId, (req as any).user!.id, 'agent', agentId, res))) {
        return;
      }
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

    handleError(error, res, 'deploying agent');
  }
});

// DELETE /starships/:id/agents/:agentId - Remove agent from starship (OpenAPI pattern)
router.delete('/starships/:id/agents/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, agentId } = req.params;

    // Validate IDs
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
        agentId: IdSchema,
      }),
      { id: starshipId, agentId },
      res,
      'starship and agent parameters'
    );
    if (!paramValidation) return;

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
    handleError(error, res, 'removing agent');
  }
});

// PUT /starships/:id - Update starship (name, status, maxAgents) (OpenAPI pattern)
router.put('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;
    const { name, status, maxAgents } = req.body;

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

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

    if (maxAgents !== undefined) {
      if (typeof maxAgents !== 'number' || maxAgents < 1 || maxAgents > 50) {
        sendError(res, 'VALIDATION_ERROR', 'maxAgents must be a number between 1 and 50', 400, {
          field: 'maxAgents',
        });
        return;
      }

      // Check if there are deployed agents that exceed new maxAgents limits
      const deployedAgents = await starshipService.getDeployedAgents(starshipId);
      if (deployedAgents.length > maxAgents) {
        sendError(res, 'OPERATION_NOT_ALLOWED', 'Cannot reduce maxAgents below current deployed agent count', 400, {
          message: 'Current deployed agents exceed the new maxAgents limit',
          current_deployed: deployedAgents.length,
          new_max_agents: maxAgents,
        });
        return;
      }

      allowedUpdates.maxAgents = maxAgents;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'No valid updates provided', 400, {
        message: 'At least one valid field must be provided for update',
        allowed_fields: ['name', 'status', 'maxAgents'],
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
    handleError(error, res, 'updating starship');
  }
});

// DELETE /starships/:id - Cancel subscription first, then delete starship (OpenAPI pattern)
router.delete('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;

    console.log(`[STARSHIPS] Delete request for starship ${starshipId} by user ${userId}`);

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

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

    // Delete starship directly - no subscription logic needed
    console.log(`[STARSHIPS] Deleting starship ${starshipId}`);
    const deleted = await starshipService.deleteStarship(starshipId);

    if (!deleted) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete starship', 500);
      return;
    }

    console.log(`[STARSHIPS] Successfully deleted starship ${starshipId}`);

    // Return success
    sendSuccess(res, {
      message: 'Starship deleted successfully',
      starshipId,
    });
  } catch (error) {
    handleError(error, res, 'deleting starship');
  }
});

// GET /starships/:id/agents - Get deployed agents for starship (OpenAPI pattern)
router.get('/starships/:id/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

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

    // Get deployed agents
    const deployedAgents = await starshipService.getDeployedAgents(starshipId);

    // NOTE: This endpoint returns an AgentModel[] directly (wrapped in ApiResponse),
    // because the client expects a list in many places.
    sendSuccess(res, deployedAgents);
  } catch (error) {
    handleError(error, res, 'fetching starship agents');
  }
});

/**
 * POST /starships/:id/import
 * Import a single agent or tool into the given starship using the shared JSON container schema.
 *
 * Instance-admin only.
 */
router.post(
  '/starships/:id/import',
  jwtAuthMiddleware,
  requireInstanceAdminMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      // Basic container validation (deep validation is handled in service-level create calls)
      const ContainerSchema = z.object({
        schemaVersion: z.literal('1'),
        kind: z.enum(['agent', 'tool']),
        exportedAt: z.string().min(1),
        metadata: z
          .object({
            fromSlug: z.string().optional(),
            fromStarshipSlug: z.string().optional(),
          })
          .passthrough()
          .optional(),
        source: z
          .object({
            app: z.string().optional(),
            version: z.string().optional(),
          })
          .optional(),
        payload: z.unknown(),
      });

      const bodyValidation = validateData(ContainerSchema, req.body, res, 'import container');
      if (!bodyValidation) return;

      const svc = new ImportExportService();
      const result = await svc.importToStarship(paramValidation.id, bodyValidation as unknown as ImportExportContainerV1);
      sendSuccess(res, result, 201);
    } catch (error) {
      handleError(error, res, 'importing into starship');
    }
  }
);

export default router;
