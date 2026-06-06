import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { IdSchema, PaginationSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { validateData } from '@/utils/validation';
import { AgentPersonaService } from '../services/AgentPersonaService';
import { AgentRuntimeEventRepository } from '@starships/models';
import { handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import { verifyStarshipAccess, verifyResourceAccess } from '@/middleware/verify-starship-access';

const router: Router = Router();

const ACCESS_ROLES = ['viewer', 'contributor'] as const;

const NameSchema = z.string().min(1).max(100).refine(noXSS, { message: XSS_ERROR_MESSAGE });
const DescriptionSchema = z.string().max(500).refine(noXSS, { message: XSS_ERROR_MESSAGE });

const PersonaBehaviourSchema = {
  description: DescriptionSchema.optional(),
  avatarUrl: z.string().url().max(1024).optional(),
  accessRole: z.enum(ACCESS_ROLES).optional(),
  systemPrompt: z.string().max(80_000).optional(),
  model: z.string().max(100).refine(noXSS, { message: XSS_ERROR_MESSAGE }).optional(),
  instructions: z.string().max(80_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  runtimeId: IdSchema.nullable().optional(),
};

const CreatePersonaSchema = z.object({
  starshipId: IdSchema,
  name: NameSchema,
  ...PersonaBehaviourSchema,
});

const UpdatePersonaSchema = z.object({
  name: NameSchema.optional(),
  ...PersonaBehaviourSchema,
});

// GET /starships/:starshipId/agent-personas - List a starship's personas
router.get('/starships/:starshipId/agent-personas', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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

    const service = new AgentPersonaService();
    const result = await service.getPersonasByStarshipWithAccess(
      paramValidation.starshipId,
      req.user!.id,
      queryValidation.page,
      queryValidation.limit,
      queryValidation.order,
      typeof queryValidation.search === 'string' && queryValidation.search.trim().length > 0 ? queryValidation.search.trim() : undefined
    );

    sendSuccess(res, result.personas, 200, { pagination: result.pagination });
  } catch (error) {
    console.error('[AGENT-PERSONAS] Error fetching personas:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch personas');
  }
});

// GET /agent-personas/:id - Get a single persona
router.get('/agent-personas/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'persona parameter');
    if (!paramValidation) return;

    const service = new AgentPersonaService();
    const persona = await service.getPersona(paramValidation.id);
    if (!persona) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Persona not found', 404, { resource: 'agent-persona', id: paramValidation.id });
      return;
    }

    const hasAccess = await service.validateStarshipAccess(persona.starshipId, req.user!.id);
    if (!hasAccess) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this persona', 403, { starshipId: persona.starshipId });
      return;
    }

    sendSuccess(res, persona);
  } catch (error) {
    console.error('[AGENT-PERSONAS] Error getting persona:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to get persona');
  }
});

// GET /agent-personas/:id/activity - Activity timeline for a persona
router.get('/agent-personas/:id/activity', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'persona parameter');
    if (!paramValidation) return;

    const query = validateData(z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }), req.query, res, 'activity query');
    if (!query) return;

    const service = new AgentPersonaService();
    const persona = await service.getPersona(paramValidation.id);
    if (!persona) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Persona not found', 404, { resource: 'agent-persona', id: paramValidation.id });
      return;
    }
    const hasAccess = await service.validateStarshipAccess(persona.starshipId, req.user!.id);
    if (!hasAccess) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this persona', 403);
      return;
    }

    const events = await new AgentRuntimeEventRepository().listByPersona(paramValidation.id, query.limit ?? 100);
    sendSuccess(res, events);
  } catch (error) {
    console.error('[AGENT-PERSONAS] Error listing persona activity:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to list persona activity');
  }
});

// POST /agent-personas - Create a persona
router.post('/agent-personas', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const bodyValidation = validateData(CreatePersonaSchema, req.body, res, 'persona creation data');
    if (!bodyValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const hasAccess = await verifyStarshipAccess(bodyValidation.starshipId, userId, res);
    if (!hasAccess) return;

    const service = new AgentPersonaService();
    const persona = await service.createPersona({ ...bodyValidation, createdByUserId: userId });
    sendSuccess(res, persona, 201);
  } catch (error) {
    console.error('[AGENT-PERSONAS] Error creating persona:', error);
    handleError(error, res, 'creating persona');
  }
});

// PUT /agent-personas/:id - Update a persona
router.put('/agent-personas/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'persona parameter');
    if (!paramValidation) return;

    const bodyValidation = validateData(UpdatePersonaSchema, req.body, res, 'persona update data');
    if (!bodyValidation) return;

    const { id } = paramValidation;
    const service = new AgentPersonaService();
    const existing = await service.getPersona(id);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Persona not found', 404, { resource: 'agent-persona', id });
      return;
    }

    const hasAccess = await verifyResourceAccess(existing.starshipId, req.user!.id, 'agent-persona', id, res);
    if (!hasAccess) return;

    const persona = await service.updatePersona(id, bodyValidation);
    sendSuccess(res, persona);
  } catch (error) {
    console.error('[AGENT-PERSONAS] Error updating persona:', error);
    handleError(error, res, 'updating persona');
  }
});

// PUT /agent-personas/:id/runtime - Assign (or unassign) the persona's current runtime
router.put('/agent-personas/:id/runtime', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'persona parameter');
    if (!paramValidation) return;

    const bodyValidation = validateData(z.object({ runtimeId: IdSchema.nullable() }), req.body, res, 'assign runtime data');
    if (!bodyValidation) return;

    const { id } = paramValidation;
    const service = new AgentPersonaService();
    const existing = await service.getPersona(id);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Persona not found', 404, { resource: 'agent-persona', id });
      return;
    }

    const hasAccess = await verifyResourceAccess(existing.starshipId, req.user!.id, 'agent-persona', id, res);
    if (!hasAccess) return;

    const persona = await service.assignRuntime(id, bodyValidation.runtimeId);
    sendSuccess(res, persona);
  } catch (error) {
    console.error('[AGENT-PERSONAS] Error assigning runtime:', error);
    handleError(error, res, 'assigning persona runtime');
  }
});

// DELETE /agent-personas/:id - Delete a persona
router.delete('/agent-personas/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'persona parameter');
    if (!paramValidation) return;

    const service = new AgentPersonaService();
    const persona = await service.getPersona(paramValidation.id);
    if (!persona) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Persona not found', 404, { resource: 'agent-persona', id: paramValidation.id });
      return;
    }

    const hasAccess = await verifyResourceAccess(persona.starshipId, req.user!.id, 'agent-persona', paramValidation.id, res);
    if (!hasAccess) return;

    const deleted = await service.deletePersona(paramValidation.id);
    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Persona not found', 404, { resource: 'agent-persona', id: paramValidation.id });
      return;
    }

    sendSuccess(res, { message: 'Persona deleted successfully' }, 200);
  } catch (error) {
    console.error('[AGENT-PERSONAS] Error deleting persona:', error);
    handleError(error, res, 'deleting persona');
  }
});

export default router;
