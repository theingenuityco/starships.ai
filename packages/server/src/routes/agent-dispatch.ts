import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { AgentPersonaRepository, AgentRuntimeDispatchRepository, AgentRuntimeEventRepository } from '@starships/models';
import type { PersonaExecutionConfig } from '@starships/protocol';

const router: Router = Router();

// POST /starships/:starshipId/agent-personas/:personaId/dispatch - Dispatch a command to a persona (owner only)
router.post('/starships/:starshipId/agent-personas/:personaId/dispatch', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema, personaId: IdSchema }), req.params, res, 'dispatch parameters');
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

    const persona = await new AgentPersonaRepository().findById(params.personaId);
    if (!persona || String(persona.starshipId) !== String(params.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Persona not found in this starship', 400, { personaId: params.personaId });
      return;
    }

    // A dispatch is delivered via the runtime's pending queue (filtered by runtime_id).
    // With no runtime assigned the row would never match a pull and silently queue
    // forever, so reject up front.
    if (!persona.runtimeId) {
      sendError(res, 'VALIDATION_ERROR', 'Persona has no runtime assigned; cannot dispatch', 400, { personaId: persona.id });
      return;
    }

    // Snapshot the persona's behaviour so the runtime injects it at execution time,
    // and resolve the runtime currently assigned to this persona.
    const personaConfig: PersonaExecutionConfig = {
      personaId: persona.id,
      systemPrompt: persona.systemPrompt ?? null,
      model: persona.model ?? null,
      instructions: persona.instructions ?? null,
      temperature: persona.temperature ?? null,
    };

    const dispatch = await new AgentRuntimeDispatchRepository().create({
      starshipId: params.starshipId,
      personaId: persona.id,
      runtimeId: persona.runtimeId ?? null,
      commandType: body.commandType,
      payload: body.payload ?? {},
      persona: personaConfig,
      cardId: body.cardId ?? null,
    });
    // TODO(dispatch-push): when an in-memory WS channel exists, push to a connected
    // runtime here. Until then runtimes retrieve via the MCP `pull_commands` tool.
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

    const events = await new AgentRuntimeEventRepository().listByStarship(params.starshipId, query.limit ?? 100);
    sendSuccess(res, events);
  } catch (error) {
    handleError(error, res, 'listing agent events');
  }
});

export default router;
