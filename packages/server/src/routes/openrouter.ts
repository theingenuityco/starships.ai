import { Router, type Request, type Response } from 'express';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { getEnvConfig } from '@starships/env';
import { handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import type { OpenRouterModel } from '@starships/protocol';

const router: Router = Router();

/**
 * GET /openrouter/models
 * Proxies OpenRouter models (unfiltered to get ALL available models).
 * Calls https://openrouter.ai/api/v1/models
 */
router.get('/openrouter/models', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { OPENROUTER_API_KEY } = getEnvConfig();

    if (!OPENROUTER_API_KEY) {
      sendError(res, 'CONFIGURATION_ERROR', 'OPENROUTER_API_KEY not configured on server', 500);
      return;
    }

    // Use unfiltered endpoint to get ALL models, not just filtered by provider preferences
    const endpoint = 'https://openrouter.ai/api/v1/models';

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
    // Normalize to { data: OpenRouterModel[] }
    const payload: unknown = await resp.json();

    const models: OpenRouterModel[] = Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data as OpenRouterModel[])
      : Array.isArray(payload)
        ? (payload as OpenRouterModel[])
        : [];

    sendSuccess<OpenRouterModel[]>(res, models);
  } catch (error) {
    handleError(error, res, 'fetching OpenRouter models (filtered)');
  }
});
export default router;
