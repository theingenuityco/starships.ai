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
import { verifyResourceAccess, verifyStarshipAccess } from '@/middleware/verify-starship-access';
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
import OpenAI from 'openai';
import multer from 'multer';
import AdmZip from 'adm-zip';

const router: Router = Router();
const envConfig = getEnvConfig();
const stripe = new Stripe(envConfig.STRIPE_SECRET_KEY);
const bundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});
const openRouterClient =
  envConfig.OPENROUTER_API_KEY && envConfig.OPENROUTER_API_KEY.trim().length > 0
    ? new OpenAI({
        apiKey: envConfig.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://starships.ai',
          'X-Title': 'Starships.ai',
        },
      })
    : null;

function extractTextFromHtml(html: string): string {
  // Very lightweight extraction to avoid extra deps.
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
  return withoutTags.replace(/\s+/g, ' ').trim();
}

function requireAuthUser(req: Request, res: Response): AuthUser | null {
  const user = req.user as AuthUser | null | undefined;
  if (!user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return user;
}

function requireInstanceAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
    sendError(res, 'FORBIDDEN', 'Only instance admins can import/export agents and tools', 403);
    return;
  }
  next();
}

// POST /starships - Create new starship (OpenAPI pattern)
router.post('/starships', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;
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

    // First workspace gets welcome credits (same as legacy ensure-default flow); invite-joiners never hit this.
    const existing = await starshipService.getStarshipsForUser(userId);
    const initialCredits = existing.length === 0 ? 200 : 0;

    console.log('[STARSHIP-CREATE] Creating starship in database...');
    const starship = await starshipService.createStarship({
      ownerId: userId,
      name: name.trim(),
      shipClass: 'scout',
      initialCredits,
    });
    console.log('[STARSHIP-CREATE] Starship created with ID:', starship.id);

    sendSuccess(res, starship, 201);
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
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

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
    const hasAccess = await starshipService.hasOwnerAccess(userId, starshipId);
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
      const user = requireAuthUser(req, res);
      if (!user) return;
      const userId = user.id;

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
      const hasAccess = await starshipService.hasOwnerAccess(userId, starshipId);
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
 * POST /starships/:id/subscription/cancel-downgrade
 * If a subscription is set to end at period end (pending downgrade-to-scout), undo that and keep it renewing.
 */
router.post(
  '/starships/:id/subscription/cancel-downgrade',
  rateLimiters.financial,
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const starshipId = req.params.id;
      const user = requireAuthUser(req, res);
      if (!user) return;
      const userId = user.id;

      const paramValidation = validateData(z.object({ id: IdSchema }), { id: starshipId }, res, 'cancel downgrade');
      if (!paramValidation) return;

      const starshipService = new StarshipService();
      const hasAccess = await starshipService.hasOwnerAccess(userId, starshipId);
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
        sendSuccess(res, { ok: true }, 200);
        return;
      }

      const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ['items.data'] });
      const scheduleId = typeof subscription.schedule === 'string' ? subscription.schedule : (subscription.schedule?.id ?? null);

      if (scheduleId) {
        // Detach schedule so we can update cancellation behavior on the subscription.
        await stripe.subscriptionSchedules.release(scheduleId);
      }

      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
        proration_behavior: 'none',
        metadata: {
          ...(subscription.metadata || {}),
          pending_downgrade_to: '',
          requested_price_id: '',
        },
      });

      // Best-effort update local mirror.
      await connection.query(
        `UPDATE starship_subscriptions
            SET cancel_at_period_end = false,
                updated_at = NOW()
          WHERE starship_id = $1`,
        [starshipId]
      );

      sendSuccess(res, { ok: true }, 200);
    } catch (error) {
      handleError(error, res, 'cancelling downgrade');
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
      const user = requireAuthUser(req, res);
      if (!user) return;
      const userId = user.id;

      const paramValidation = validateData(z.object({ id: IdSchema }), { id: starshipId }, res, 'subscription status');
      if (!paramValidation) return;

      const starshipService = new StarshipService();
      const hasAccess = await starshipService.hasOwnerAccess(userId, starshipId);
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
      // If the subscription is managed by a schedule, Stripe may block direct cancel_at_period_end updates.
      // In that case, interpret end_behavior=cancel as "cancel at period end" for UI purposes.
      const scheduleId =
        typeof (subscription as unknown as { schedule?: unknown }).schedule === 'string'
          ? ((subscription as unknown as { schedule?: string }).schedule as string)
          : ((subscription as unknown as { schedule?: { id: string } | null }).schedule?.id ?? null);
      const schedule = scheduleId ? await stripe.subscriptionSchedules.retrieve(scheduleId) : null;
      const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end) || Boolean(schedule && schedule.end_behavior === 'cancel');
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
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

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

    // Check collaborator access (owner/admin/member)
    if (!(await starshipService.hasCollaboratorAccess(userId, starship.id))) {
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

    const user = requireAuthUser(req, res);
    if (!user) return;
    if (starship.ownerId !== user.id) {
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
      if (!(await verifyResourceAccess(agent.starshipId, user.id, 'agent', agentId, res))) {
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

    const user = requireAuthUser(req, res);
    if (!user) return;
    if (starship.ownerId !== user.id) {
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
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;
    const { name, status, maxAgents, description, websiteUrl } = req.body;

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
      const nextName = name.trim();
      // Only update name (and thus trigger slug regeneration) when the name actually changes.
      if (nextName !== starship.name) {
        allowedUpdates.name = nextName;
      }
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

    if (description !== undefined) {
      if (description === null) {
        allowedUpdates.description = '';
      } else if (typeof description !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'description must be a string', 400, { field: 'description' });
        return;
      } else {
        const trimmed = description.trim();
        // Allow empty to clear.
        allowedUpdates.description = trimmed;
        if (trimmed.length > 2000) {
          sendError(res, 'VALIDATION_ERROR', 'description must be 2000 characters or less', 400, { field: 'description' });
          return;
        }
      }
    }

    if (websiteUrl !== undefined) {
      if (websiteUrl === null) {
        allowedUpdates.websiteUrl = '';
      } else if (typeof websiteUrl !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be a string', 400, { field: 'websiteUrl' });
        return;
      } else {
        const trimmed = websiteUrl.trim();
        // Allow empty to clear.
        if (trimmed.length === 0) {
          allowedUpdates.websiteUrl = '';
        } else {
          if (trimmed.length > 2048) {
            sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be 2048 characters or less', 400, { field: 'websiteUrl' });
            return;
          }
          try {
            const u = new URL(trimmed);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') {
              sendError(res, 'VALIDATION_ERROR', 'websiteUrl must start with http:// or https://', 400, { field: 'websiteUrl' });
              return;
            }
          } catch {
            sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be a valid URL', 400, { field: 'websiteUrl' });
            return;
          }
          allowedUpdates.websiteUrl = trimmed;
        }
      }
    }

    if (Object.keys(allowedUpdates).length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'No valid updates provided', 400, {
        message: 'At least one valid field must be provided for update',
        allowed_fields: ['name', 'description', 'websiteUrl', 'status', 'maxAgents'],
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

/**
 * POST /starships/:id/generate-description-from-website
 *
 * Fetches the provided (or saved) website URL and uses an LLM to draft a long-form description.
 * This does NOT save the description; the client should call PUT /starships/:id to persist.
 */
router.post(
  '/starships/:id/generate-description-from-website',
  rateLimiters.apiAuthenticated,
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const starshipId = req.params.id;
      const user = requireAuthUser(req, res);
      if (!user) return;
      const userId = user.id;

      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      if (!openRouterClient) {
        sendError(res, 'CONFIGURATION_ERROR', 'OPENROUTER_API_KEY is not configured on server', 500);
        return;
      }

      const BodySchema = z.object({
        websiteUrl: z.string().trim().max(2048).optional(),
      });
      const body = validateData(BodySchema, req.body, res, 'generate description payload');
      if (!body) return;

      const starshipService = new StarshipService();
      const starship = await starshipService.getStarship(starshipId);
      if (!starship) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { resource: 'starship', id: starshipId });
        return;
      }
      if (starship.ownerId !== userId) {
        sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
        return;
      }

      const url = (body.websiteUrl ?? starship.websiteUrl ?? '').trim();
      if (!url) {
        sendError(res, 'VALIDATION_ERROR', 'websiteUrl is required (either provide it or save it on the starship first)', 400, {
          field: 'websiteUrl',
        });
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          sendError(res, 'VALIDATION_ERROR', 'websiteUrl must start with http:// or https://', 400, { field: 'websiteUrl' });
          return;
        }
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be a valid URL', 400, { field: 'websiteUrl' });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let html = '';
      try {
        const resp = await fetch(parsed.toString(), {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'starships.ai',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        html = await resp.text();
      } catch {
        sendError(res, 'NETWORK_ERROR', 'Failed to fetch website content', 400, { websiteUrl: parsed.toString() });
        return;
      } finally {
        clearTimeout(timeout);
      }

      const extracted = extractTextFromHtml(String(html || '')).slice(0, 40000);
      if (!extracted) {
        sendError(res, 'NETWORK_ERROR', 'Website content was empty or could not be parsed', 400, { websiteUrl: parsed.toString() });
        return;
      }

      const model = 'openai/gpt-5.2';
      const system = [
        'You write clear, accurate, professional company/project descriptions.',
        'Given a website URL and extracted website text, draft a description the user can paste into a product profile.',
        'Constraints:',
        '- Output plain text (no markdown headings).',
        '- HARD LIMIT: 2000 characters maximum (including spaces). Never exceed 2000 characters.',
        '- Focus on: what they do, who it is for, key features/capabilities, differentiators, and tone/voice matching the site.',
        '- Do not invent claims that are not supported by the text.',
      ].join('\n');

      const userPrompt = [
        `Website: ${parsed.toString()}`,
        '',
        'Extracted website text (may be truncated):',
        extracted,
        '',
        'Write the description now. Return only the description text.',
      ].join('\n');

      const MAX_CHARS = 2000;
      const generateOnce = async (extraUserInstruction?: string): Promise<string> => {
        const completion = await openRouterClient.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt + (extraUserInstruction ? `\n\n${extraUserInstruction}` : '') },
          ],
          temperature: 0.2,
          max_tokens: 800,
        });
        return String(completion.choices?.[0]?.message?.content ?? '').trim();
      };

      // First attempt.
      let description = await generateOnce();
      if (!description) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to generate description', 500);
        return;
      }

      // Retry once if the model violated the hard character limit.
      if (description.length > MAX_CHARS) {
        description = await generateOnce(
          `Your previous output was ${description.length} characters. Rewrite it to be ${MAX_CHARS} characters or fewer while preserving key details. Return only the description text.`
        );
      }

      if (!description) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to generate description', 500);
        return;
      }
      if (description.length > MAX_CHARS) {
        sendError(res, 'INTERNAL_SERVER_ERROR', `Generated description exceeded ${MAX_CHARS} characters`, 500, {
          maxChars: MAX_CHARS,
          actualChars: description.length,
        });
        return;
      }

      sendSuccess(res, { description }, 200);
    } catch (error) {
      handleError(error, res, 'generating starship description from website');
    }
  }
);

// DELETE /starships/:id - Cancel subscription first, then delete starship (OpenAPI pattern)
router.delete('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

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

// GET /starships/:id/agents - Get deployed agents for starship (collaborator access)
router.get('/starships/:id/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Authorization: collaborators can view deployed agents (needed for DM + conversation UI).
    const accessOk = await verifyStarshipAccess(starshipId, userId, res);
    if (!accessOk) return;

    const starshipService = new StarshipService();

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

/**
 * POST /starships/:id/import-bundle
 * Import a zipped agent bundle (manifest.json + agents/*.json + tools/*.json) into the given starship.
 *
 * Instance-admin only.
 */
router.post(
  '/starships/:id/import-bundle',
  jwtAuthMiddleware,
  requireInstanceAdminMiddleware,
  bundleUpload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      if (!req.file?.buffer) {
        sendError(res, 'VALIDATION_ERROR', 'No bundle file provided', 400);
        return;
      }

      let zip: AdmZip;
      try {
        zip = new AdmZip(req.file.buffer);
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Invalid zip bundle', 400);
        return;
      }

      const manifestEntry = zip.getEntry('manifest.json');
      if (!manifestEntry) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle is missing manifest.json', 400);
        return;
      }

      let manifestRaw: unknown;
      try {
        manifestRaw = JSON.parse(manifestEntry.getData().toString('utf8'));
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json is not valid JSON', 400);
        return;
      }

      const ManifestSchema = z.object({
        schemaVersion: z.literal('1'),
        kind: z.literal('bundle'),
        exportedAt: z.string().min(1),
        entities: z.object({
          agents: z
            .array(
              z.object({
                kind: z.literal('agent'),
                file: z.string().min(1),
                fromSlug: z.unknown().optional(),
                fromStarshipSlug: z.unknown().optional(),
              })
            )
            .default([]),
          tools: z
            .array(
              z.object({
                kind: z.literal('tool'),
                file: z.string().min(1),
                fromSlug: z.unknown().optional(),
                fromStarshipSlug: z.unknown().optional(),
              })
            )
            .default([]),
        }),
      });

      const manifestParsed = ManifestSchema.safeParse(manifestRaw);
      if (!manifestParsed.success) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json has an unexpected shape', 400, {
          issues: manifestParsed.error.issues,
        });
        return;
      }

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

      const warnings: string[] = [];
      const importedTools: unknown[] = [];
      const importedAgents: unknown[] = [];
      const toolSlugMap = new Map<string, string>();

      const svc = new ImportExportService();
      const starshipId = paramValidation.id;

      // Import tools first so agent tool assignment can be remapped.
      for (const t of manifestParsed.data.entities.tools) {
        const entry = zip.getEntry(t.file);
        if (!entry) {
          warnings.push(`Bundle is missing tool file: ${t.file}`);
          continue;
        }

        let containerRaw: unknown;
        try {
          containerRaw = JSON.parse(entry.getData().toString('utf8'));
        } catch {
          warnings.push(`Tool file is not valid JSON: ${t.file}`);
          continue;
        }

        const containerParsed = ContainerSchema.safeParse(containerRaw);
        if (!containerParsed.success || containerParsed.data.kind !== 'tool') {
          warnings.push(`Tool file is not a valid tool container: ${t.file}`);
          continue;
        }

        const result = await svc.importToStarship(starshipId, containerParsed.data as unknown as ImportExportContainerV1);
        if (result?.warnings?.length) warnings.push(...result.warnings);
        if (result?.kind === 'tool' && (result as any).tool) {
          importedTools.push((result as any).tool);
          const fromSlug = containerParsed.data.metadata?.fromSlug;
          const createdSlug = (result as any).tool?.slug;
          if (typeof fromSlug === 'string' && fromSlug.trim().length > 0 && typeof createdSlug === 'string' && createdSlug.trim().length > 0) {
            toolSlugMap.set(fromSlug, createdSlug);
          }
        }
      }

      for (const a of manifestParsed.data.entities.agents) {
        const entry = zip.getEntry(a.file);
        if (!entry) {
          warnings.push(`Bundle is missing agent file: ${a.file}`);
          continue;
        }

        let containerRaw: unknown;
        try {
          containerRaw = JSON.parse(entry.getData().toString('utf8'));
        } catch {
          warnings.push(`Agent file is not valid JSON: ${a.file}`);
          continue;
        }

        const containerParsed = ContainerSchema.safeParse(containerRaw);
        if (!containerParsed.success || containerParsed.data.kind !== 'agent') {
          warnings.push(`Agent file is not a valid agent container: ${a.file}`);
          continue;
        }

        const payload: any = containerParsed.data.payload as any;
        const assignedToolSlugsRaw = Array.isArray(payload?.assignedToolSlugs) ? payload.assignedToolSlugs : [];
        const assignedToolSlugs = assignedToolSlugsRaw.filter((s: unknown) => typeof s === 'string' && s.trim().length > 0) as string[];
        const rewrittenToolSlugs = assignedToolSlugs.map((s) => toolSlugMap.get(s) ?? s);

        const rewrittenContainer: ImportExportContainerV1 = {
          ...(containerParsed.data as any),
          payload: {
            ...(payload || {}),
            assignedToolSlugs: rewrittenToolSlugs,
          },
        };

        const result = await svc.importToStarship(starshipId, rewrittenContainer);
        if (result?.warnings?.length) warnings.push(...result.warnings);
        if (result?.kind === 'agent' && (result as any).agent) {
          importedAgents.push((result as any).agent);
        }
      }

      sendSuccess(
        res,
        {
          imported: { tools: importedTools.length, agents: importedAgents.length },
          tools: importedTools.length ? importedTools : undefined,
          agents: importedAgents.length ? importedAgents : undefined,
          warnings: warnings.length ? warnings : undefined,
        },
        201
      );
    } catch (error) {
      handleError(error, res, 'importing bundle into starship');
    }
  }
);

export default router;
