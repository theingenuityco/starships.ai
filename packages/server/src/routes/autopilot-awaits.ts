import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { IdSchema } from '@/schemas/common';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { AutopilotAwaitRepository } from '@starships/models';

const router: Router = Router();
const awaitRepo = new AutopilotAwaitRepository();

const StatusSchema = z.enum(['waiting', 'resuming', 'completed', 'cancelled', 'failed']);

/**
 * GET /starships/:starshipId/autopilot/awaits
 * List autopilot awaits for a starship (optionally filtered by status).
 */
router.get('/starships/:starshipId/autopilot/awaits', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = z.object({ starshipId: IdSchema }).parse(req.params);
    const query = z
      .object({
        status: StatusSchema.optional(),
        limit: z.coerce.number().min(1).max(500).optional(),
      })
      .strict()
      .parse(req.query);

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) {
      return;
    }

    const awaits = await awaitRepo.listByStarship({
      starshipId: params.starshipId,
      status: query.status,
      limit: query.limit,
    });
    sendSuccess(res, awaits, 200);
  } catch (error) {
    handleError(error, res, 'listing autopilot awaits');
  }
});

export default router;

