import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { AgentRepository, AgentHeartbeatRepository } from '@starships/models';

const router: Router = Router();

// Minimum cadence guards against the (30s) tick floor and runaway dispatch volume.
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const commandTypeSchema = z.string().min(1).max(64).refine(noXSS, { message: XSS_ERROR_MESSAGE });
const intervalSchema = z.coerce.number().int().min(MIN_INTERVAL_SECONDS).max(MAX_INTERVAL_SECONDS);

// GET /starships/:starshipId/agents/:agentId/heartbeats - List an agent's heartbeats
router.get('/starships/:starshipId/agents/:agentId/heartbeats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema, agentId: IdSchema }), req.params, res, 'heartbeat parameters');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, req.user!.id, res))) return;

    const agent = await new AgentRepository().findById(params.agentId);
    if (!agent || String(agent.starshipId) !== String(params.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Agent not found in this starship', 400, { agentId: params.agentId });
      return;
    }

    const heartbeats = await new AgentHeartbeatRepository().listByAgent(params.agentId);
    sendSuccess(res, heartbeats);
  } catch (error) {
    handleError(error, res, 'listing agent heartbeats');
  }
});

// POST /starships/:starshipId/agents/:agentId/heartbeats - Create a heartbeat (owner only)
router.post('/starships/:starshipId/agents/:agentId/heartbeats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema, agentId: IdSchema }), req.params, res, 'heartbeat parameters');
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

    const agent = await new AgentRepository().findById(params.agentId);
    if (!agent || String(agent.starshipId) !== String(params.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Agent not found in this starship', 400, { agentId: params.agentId });
      return;
    }

    const heartbeat = await new AgentHeartbeatRepository().create({
      starshipId: params.starshipId,
      agentId: params.agentId,
      name: body.name ?? null,
      commandType: body.commandType,
      payload: body.payload ?? {},
      intervalSeconds: body.intervalSeconds,
      enabled: body.enabled ?? true,
      createdByUserId: req.user!.id,
    });
    sendSuccess(res, heartbeat, 201);
  } catch (error) {
    handleError(error, res, 'creating agent heartbeat');
  }
});

// PUT /agent-heartbeats/:id - Update a heartbeat (owner only)
router.put('/agent-heartbeats/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: IdSchema }), req.params, res, 'heartbeat parameter');
    if (!params) return;

    const repo = new AgentHeartbeatRepository();
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
    handleError(error, res, 'updating agent heartbeat');
  }
});

// DELETE /agent-heartbeats/:id - Delete a heartbeat (owner only)
router.delete('/agent-heartbeats/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: IdSchema }), req.params, res, 'heartbeat parameter');
    if (!params) return;

    const repo = new AgentHeartbeatRepository();
    const existing = await repo.findById(params.id);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Heartbeat not found', 404, { id: params.id });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(existing.starshipId, req.user!.id, res))) return;

    const deleted = await repo.delete(params.id);
    sendSuccess(res, { deleted });
  } catch (error) {
    handleError(error, res, 'deleting agent heartbeat');
  }
});

export default router;
