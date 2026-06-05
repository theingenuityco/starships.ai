import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { IdSchema, PaginationSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { validateData } from '@/utils/validation';
import { AgentRuntimeService } from '../services/AgentRuntimeService';
import { handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import { verifyStarshipAccess, verifyResourceAccess } from '@/middleware/verify-starship-access';

const router: Router = Router();

const AGENT_RUNTIME_KINDS = ['claude-code', 'codex', 'hermes', 'openclaw', 'custom'] as const;

const NameSchema = z.string().min(1).max(100).refine(noXSS, { message: XSS_ERROR_MESSAGE });

const CreateRuntimeSchema = z.object({
  starshipId: IdSchema,
  name: NameSchema,
  kind: z.enum(AGENT_RUNTIME_KINDS),
});

const UpdateRuntimeSchema = z.object({
  name: NameSchema.optional(),
  kind: z.enum(AGENT_RUNTIME_KINDS).optional(),
});

// GET /starships/:starshipId/agent-runtimes - List a starship's registered runtimes
router.get('/starships/:starshipId/agent-runtimes', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const queryValidation = validateData(
      PaginationSchema.extend({
        order: z.enum(['ASC', 'DESC']).optional(),
        search: z.string().trim().max(200).refine(noXSS, { message: XSS_ERROR_MESSAGE }).optional(),
      }),
      req.query,
      res,
      'pagination query'
    );
    if (!queryValidation) return;

    const service = new AgentRuntimeService();
    const result = await service.getRuntimesByStarshipWithAccess(
      paramValidation.starshipId,
      req.user!.id,
      queryValidation.page,
      queryValidation.limit,
      queryValidation.order,
      typeof queryValidation.search === 'string' && queryValidation.search.trim().length > 0 ? queryValidation.search.trim() : undefined
    );

    sendSuccess(res, result.runtimes, 200, { pagination: result.pagination });
  } catch (error) {
    console.error('[AGENT-RUNTIMES] Error fetching runtimes:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch agent runtimes');
  }
});

// GET /agent-runtimes/:id - Get a single runtime by id
router.get('/agent-runtimes/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'runtime parameter');
    if (!paramValidation) return;

    const service = new AgentRuntimeService();
    const runtime = await service.getRuntime(paramValidation.id);
    if (!runtime) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent runtime not found', 404, { resource: 'agent-runtime', id: paramValidation.id });
      return;
    }

    const hasAccess = await service.validateStarshipAccess(runtime.starshipId, req.user!.id);
    if (!hasAccess) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this runtime', 403, { starshipId: runtime.starshipId });
      return;
    }

    sendSuccess(res, runtime);
  } catch (error) {
    console.error('[AGENT-RUNTIMES] Error getting runtime:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to get agent runtime');
  }
});

// POST /agent-runtimes - Register a new runtime (engine)
router.post('/agent-runtimes', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const bodyValidation = validateData(CreateRuntimeSchema, req.body, res, 'runtime creation data');
    if (!bodyValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const hasAccess = await verifyStarshipAccess(bodyValidation.starshipId, userId, res);
    if (!hasAccess) return;

    const service = new AgentRuntimeService();
    const runtime = await service.createRuntime({ ...bodyValidation, createdByUserId: userId });
    sendSuccess(res, runtime, 201);
  } catch (error) {
    console.error('[AGENT-RUNTIMES] Error creating runtime:', error);
    handleError(error, res, 'creating agent runtime');
  }
});

// PUT /agent-runtimes/:id - Update a registered runtime
router.put('/agent-runtimes/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'runtime parameter');
    if (!paramValidation) return;

    const bodyValidation = validateData(UpdateRuntimeSchema, req.body, res, 'runtime update data');
    if (!bodyValidation) return;

    const { id } = paramValidation;
    const service = new AgentRuntimeService();
    const existing = await service.getRuntime(id);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent runtime not found', 404, { resource: 'agent-runtime', id });
      return;
    }

    const hasAccess = await verifyResourceAccess(existing.starshipId, req.user!.id, 'agent-runtime', id, res);
    if (!hasAccess) return;

    const runtime = await service.updateRuntime(id, bodyValidation);
    sendSuccess(res, runtime);
  } catch (error) {
    console.error('[AGENT-RUNTIMES] Error updating runtime:', error);
    handleError(error, res, 'updating agent runtime');
  }
});

// DELETE /agent-runtimes/:id - Remove a registered runtime
router.delete('/agent-runtimes/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'runtime parameter');
    if (!paramValidation) return;

    const service = new AgentRuntimeService();
    const runtime = await service.getRuntime(paramValidation.id);
    if (!runtime) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent runtime not found', 404, { resource: 'agent-runtime', id: paramValidation.id });
      return;
    }

    const hasAccess = await verifyResourceAccess(runtime.starshipId, req.user!.id, 'agent-runtime', paramValidation.id, res);
    if (!hasAccess) return;

    const deleted = await service.deleteRuntime(paramValidation.id);
    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent runtime not found', 404, { resource: 'agent-runtime', id: paramValidation.id });
      return;
    }

    sendSuccess(res, { message: 'Agent runtime deleted successfully' }, 200);
  } catch (error) {
    console.error('[AGENT-RUNTIMES] Error deleting runtime:', error);
    handleError(error, res, 'deleting agent runtime');
  }
});

export default router;
