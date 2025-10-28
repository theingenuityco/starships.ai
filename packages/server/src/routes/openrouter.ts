import { Router, type Request, type Response } from 'express';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { getEnvConfig } from '@starships/env';
import { handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import type { OpenRouterModel } from '@starships/protocol';

const router: Router = Router();

/**
 * GET /openrouter/models
 * Proxies OpenRouter models (filtered by account Provider Preferences).
 * Calls https://openrouter.ai/api/v1/models/user
 */
router.get('/openrouter/models', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { OPENROUTER_API_KEY } = getEnvConfig();

    if (!OPENROUTER_API_KEY) {
      sendError(res, 'CONFIGURATION_ERROR', 'OPENROUTER_API_KEY not configured on server', 500);
      return;
    }

    // Use /models/user endpoint to get only models filtered by provider preferences
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
    // Normalize to { data: OpenRouterModel[] }
    const payload: unknown = await resp.json();

    const models: OpenRouterModel[] = Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data as OpenRouterModel[])
      : Array.isArray(payload)
        ? (payload as OpenRouterModel[])
        : [];

    // Filter out openrouter/auto model
    const filteredByType = models.filter((model) => model.id !== 'openrouter/auto');

    // Check if filter query parameter is provided
    const filter = req.query.filter as string | undefined;
    const includePricing = filter?.includes('pricing');
    const includeTopProvider = filter?.includes('top_provider');

    // Return filtered fields based on query parameter
    const filteredModels = filteredByType.map((model) => {
      const result: Record<string, unknown> = {
        canonical_slug: model.canonical_slug,
        id: model.id,
        name: model.name,
      };

      if (includePricing) {
        result.pricing = model.pricing;
      }

      if (includeTopProvider) {
        result.top_provider = model.top_provider;
      }

      return result;
    });

    sendSuccess(res, filteredModels);
  } catch (error) {
    handleError(error, res, 'fetching OpenRouter models (filtered)');
  }
});
export default router;
