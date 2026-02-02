import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { IdSchema } from '@/schemas/common';
import { PresenceService } from '@/services/PresenceService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const router: Router = Router();

function requireUserId(req: Request, res: Response): string | null {
  const userId = req.user?.id as string | undefined;
  if (!userId) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return userId;
}

/**
 * POST /starships/:starshipId/presence/heartbeat
 *
 * Activity heartbeat for "online" presence (recently active).
 */
router.post('/starships/:starshipId/presence/heartbeat', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    const starshipId = params.starshipId;

    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const svc = PresenceService.getInstance();
    const serverTimeMs = Date.now();
    await svc.touch(starshipId, userId, serverTimeMs);
    // Best-effort pruning to keep the ZSET bounded.
    try {
      await svc.pruneOld(starshipId, serverTimeMs);
    } catch {
      /* best-effort only */
    }

    sendSuccess(res, { ok: true, serverTimeMs }, 200);
  } catch (error) {
    handleError(error, res, 'presence heartbeat');
  }
});

/**
 * GET /starships/:starshipId/presence
 *
 * Returns online users in the starship based on recent heartbeats.
 */
router.get('/starships/:starshipId/presence', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    const starshipId = params.starshipId;

    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const svc = PresenceService.getInstance();
    const serverTimeMs = Date.now();
    const onlineUserIds = await svc.listOnlineUserIds(starshipId, serverTimeMs);
    const cfg = svc.getConfig();

    sendSuccess(res, { serverTimeMs, onlineUserIds, onlineWindowMs: cfg.onlineWindowMs }, 200);
  } catch (error) {
    handleError(error, res, 'fetching presence');
  }
});

export default router;

