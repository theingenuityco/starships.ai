import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { AgentRepository, AgentDispatchRepository, AgentEventRepository } from '@starships/models';

const router: Router = Router();

// POST /starships/:starshipId/agents/:agentId/dispatch - Dispatch a command to an agent (owner only)
router.post('/starships/:starshipId/agents/:agentId/dispatch', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema, agentId: IdSchema }), req.params, res, 'dispatch parameters');
    if (!params) return;
    if (!(await verifyStarshipOwnerAccess(params.starshipId, req.user!.id, res))) return;

    const body = validateData(
      z.object({
        commandType: z.string().min(1).max(64).refine(noXSS, { message: XSS_ERROR_MESSAGE }),
        payload: z.record(z.string(), z.unknown()).optional(),
        cardId: IdSchema.optional(),
      }),
      req.body,
      res,
      'dispatch command'
    );
    if (!body) return;

    const agent = await new AgentRepository().findById(params.agentId);
    if (!agent || String(agent.starshipId) !== String(params.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Agent not found in this starship', 400, { agentId: params.agentId });
      return;
    }

    const dispatch = await new AgentDispatchRepository().create({
      starshipId: params.starshipId,
      agentId: params.agentId,
      commandType: body.commandType,
      payload: body.payload ?? {},
      cardId: body.cardId ?? null,
    });
    // TODO(dispatch-push): when an in-memory WS channel exists, push to a connected
    // agent here. Until then agents retrieve via the MCP `pull_commands` tool.
    sendSuccess(res, dispatch, 201);
  } catch (error) {
    handleError(error, res, 'dispatching command');
  }
});

// GET /starships/:starshipId/agent-events - Activity log (most recent first)
router.get('/starships/:starshipId/agent-events', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, req.user!.id, res))) return;

    const query = validateData(z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }), req.query, res, 'events query');
    if (!query) return;

    const events = await new AgentEventRepository().listByStarship(params.starshipId, query.limit ?? 100);
    sendSuccess(res, events);
  } catch (error) {
    handleError(error, res, 'listing agent events');
  }
});

export default router;
