import { Router, type Request, type Response } from 'express';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { getEnvConfig } from '@starships/env';
import { handleError, sendError, sendSuccess } from '../utils/responseHelpers';

const router: Router = Router();

/**
 * GET /openrouter/models
 * Proxies OpenRouter models filtered by the account's Provider Preferences.
 * Calls https://openrouter.ai/api/v1/models/user
 */
router.get('/openrouter/models', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { OPENROUTER_API_KEY } = getEnvConfig();

    if (!OPENROUTER_API_KEY) {
      sendError(res, 'CONFIGURATION_ERROR', 'OPENROUTER_API_KEY not configured on server', 500);
      return;
    }

    const endpoint = 'https://openrouter.ai/api/v1/models/user';

    const resp = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      sendError(res, 'SERVICE_UNAVAILABLE', `OpenRouter responded with ${resp.status}`, resp.status, { body });
      return;
    }

    // Normalize to { data: Model[] }
    const payload: unknown = await resp.json();
    let models: unknown = payload;
    if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
      models = (payload as Record<string, unknown>)['data'];
    }
    sendSuccess(res, models);
  } catch (error) {
    handleError(error, res, 'fetching OpenRouter models (filtered)');
  }
});

export default router;
