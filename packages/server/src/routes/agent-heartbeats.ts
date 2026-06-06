import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { AgentPersonaRepository, AgentRuntimeHeartbeatRepository } from '@starships/models';

const router: Router = Router();

// Minimum cadence guards against the (30s) tick floor and runaway dispatch volume.
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const commandTypeSchema = z.string().min(1).max(64).refine(noXSS, { message: XSS_ERROR_MESSAGE });
const intervalSchema = z.coerce.number().int().min(MIN_INTERVAL_SECONDS).max(MAX_INTERVAL_SECONDS);

// GET /starships/:starshipId/agent-personas/:personaId/heartbeats - List a persona's heartbeats
router.get('/starships/:starshipId/agent-personas/:personaId/heartbeats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema, personaId: IdSchema }), req.params, res, 'heartbeat parameters');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, req.user!.id, res))) return;

    const persona = await new AgentPersonaRepository().findById(params.personaId);
    if (!persona || String(persona.starshipId) !== String(params.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Persona not found in this starship', 400, { personaId: params.personaId });
      return;
    }

    const heartbeats = await new AgentRuntimeHeartbeatRepository().listByPersona(params.personaId);
    sendSuccess(res, heartbeats);
  } catch (error) {
    handleError(error, res, 'listing persona heartbeats');
  }
});

// POST /starships/:starshipId/agent-personas/:personaId/heartbeats - Create a heartbeat (owner only)
router.post('/starships/:starshipId/agent-personas/:personaId/heartbeats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema, personaId: IdSchema }), req.params, res, 'heartbeat parameters');
    if (!params) return;
    if (!(await verifyStarshipOwnerAccess(params.starshipId, req.user!.id, res))) return;

    const body = validateData(
      z.object({
        name: z.string().max(255).refine(noXSS, { message: XSS_ERROR_MESSAGE }).optional(),
        commandType: commandTypeSchema,
        payload: z.record(z.string(), z.unknown()).optional(),
        intervalSeconds: intervalSchema,
        enabled: z.boolean().optional(),
      }),
      req.body,
      res,
      'create heartbeat'
    );
    if (!body) return;

    const persona = await new AgentPersonaRepository().findById(params.personaId);
    if (!persona || String(persona.starshipId) !== String(params.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Persona not found in this starship', 400, { personaId: params.personaId });
      return;
    }

    const heartbeat = await new AgentRuntimeHeartbeatRepository().create({
      starshipId: params.starshipId,
      personaId: params.personaId,
      name: body.name ?? null,
      commandType: body.commandType,
      payload: body.payload ?? {},
      intervalSeconds: body.intervalSeconds,
      enabled: body.enabled ?? true,
      createdByUserId: req.user!.id,
    });
    sendSuccess(res, heartbeat, 201);
  } catch (error) {
    handleError(error, res, 'creating persona heartbeat');
  }
});

// PUT /agent-runtime-heartbeats/:id - Update a heartbeat (owner only)
router.put('/agent-runtime-heartbeats/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: IdSchema }), req.params, res, 'heartbeat parameter');
    if (!params) return;

    const repo = new AgentRuntimeHeartbeatRepository();
    const existing = await repo.findById(params.id);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Heartbeat not found', 404, { id: params.id });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(existing.starshipId, req.user!.id, res))) return;

    const body = validateData(
      z.object({
        name: z.string().max(255).refine(noXSS, { message: XSS_ERROR_MESSAGE }).nullable().optional(),
        commandType: commandTypeSchema.optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
        intervalSeconds: intervalSchema.optional(),
        enabled: z.boolean().optional(),
      }),
      req.body,
      res,
      'update heartbeat'
    );
    if (!body) return;

    const updated = await repo.update(params.id, body);
    sendSuccess(res, updated);
  } catch (error) {
    handleError(error, res, 'updating persona heartbeat');
  }
});

// DELETE /agent-runtime-heartbeats/:id - Delete a heartbeat (owner only)
router.delete('/agent-runtime-heartbeats/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: IdSchema }), req.params, res, 'heartbeat parameter');
    if (!params) return;

    const repo = new AgentRuntimeHeartbeatRepository();
    const existing = await repo.findById(params.id);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Heartbeat not found', 404, { id: params.id });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(existing.starshipId, req.user!.id, res))) return;

    const deleted = await repo.delete(params.id);
    sendSuccess(res, { deleted });
  } catch (error) {
    handleError(error, res, 'deleting persona heartbeat');
  }
});

export default router;
