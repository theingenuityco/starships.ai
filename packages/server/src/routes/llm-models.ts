import { Router, type Request, type Response } from 'express';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { getEnvConfig } from '@starships/env';
import { LlmModelRepository } from '@starships/models';
import type { OpenRouterModel, LlmModelModel, LlmModelProviderModel } from '@starships/protocol';

const router: Router = Router();

const repo = new LlmModelRepository();

// Curated allowlist for now (canonical OpenRouter-style IDs).
const ALLOWED_CANONICAL_MODELS = new Set<string>([
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-5.2',
  'openai/gpt-5.2-mini',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-opus-4.5',
  'anthropic/claude-haiku-4.5',
  'google/gemini-3-pro-image-preview',
  'google/gemini-3-flash-preview',
  'google/gemini-3-flash-lite-preview',
  'google/gemini-3-pro-preview',
]);

/**
 * GET /llm/models
 * List canonical models from DB catalog.
 */
router.get('/llm/models', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const enabledOnly = String(req.query.enabledOnly ?? 'true') !== 'false';
    const rows = await repo.listModels({ enabledOnly });
    const out: LlmModelModel[] = rows.map((r) => ({
      model: r.model,
      displayName: r.displayName ?? undefined,
      description: r.description ?? undefined,
      contextLength: typeof r.contextLength === 'number' ? r.contextLength : undefined,
      inputModalities: Array.isArray(r.inputModalities) ? r.inputModalities : [],
      outputModalities: Array.isArray(r.outputModalities) ? r.outputModalities : [],
      supportedParameters: Array.isArray(r.supportedParameters) ? r.supportedParameters : [],
      metadata: r.metadata ?? {},
      isEnabled: Boolean(r.isEnabled),
      isDeprecated: Boolean(r.isDeprecated),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    sendSuccess(res, out);
  } catch (error) {
    handleError(error, res, 'listing LLM models');
  }
});

/**
 * GET /llm/models/:model/providers
 * List provider routes for a canonical model.
 */
router.get('/llm/models/:model/providers', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const model = String(req.params.model || '').trim();
    if (!model) {
      sendError(res, 'VALIDATION_ERROR', 'model is required', 400);
      return;
    }
    const enabledOnly = String(req.query.enabledOnly ?? 'true') !== 'false';
    const rows = await repo.listProvidersForModel(model, { enabledOnly });
    const out: LlmModelProviderModel[] = rows.map((r) => ({
      model: r.model,
      provider: r.provider,
      providerModelId: r.providerModelId,
      priority: r.priority,
      isEnabled: Boolean(r.isEnabled),
      pricing: r.pricing ?? null,
      metadata: r.metadata ?? {},
      lastSyncedAt: r.lastSyncedAt ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    sendSuccess(res, out);
  } catch (error) {
    handleError(error, res, 'listing LLM model providers');
  }
});

/**
 * POST /llm/models/sync/openrouter
 * Admin-only: Sync OpenRouter /models/user into DB catalog.
 *
 * Notes:
 * - Populates canonical model ids as OpenRouter-style ids (model.id).
 * - Inserts provider routes for provider="openrouter" with provider_model_id=model.id.
 */
router.post('/llm/models/sync/openrouter', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user)) {
      sendError(res, 'FORBIDDEN', 'Admin access required', 403);
      return;
    }

    const env = getEnvConfig();
    if (!env.OPENROUTER_API_KEY) {
      sendError(res, 'CONFIGURATION_ERROR', 'OPENROUTER_API_KEY not configured on server', 500);
      return;
    }

    const endpoint = 'https://openrouter.ai/api/v1/models/user';
    const resp = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      sendError(res, 'SERVICE_UNAVAILABLE', `OpenRouter responded with ${resp.status}`, resp.status, { body });
      return;
    }

    const payload: unknown = await resp.json();
    const models: OpenRouterModel[] = Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data as OpenRouterModel[])
      : Array.isArray(payload)
        ? (payload as OpenRouterModel[])
        : [];

    // Only keep allowlisted canonical models.
    const filtered = (models || []).filter(
      (m) => m && m.id && m.id !== 'openrouter/auto' && ALLOWED_CANONICAL_MODELS.has(m.id)
    );

    const nowIso = new Date().toISOString();

    await repo.upsertModels(
      filtered.map((m) => {
        const inputModalities = m.architecture?.input_modalities ?? [];
        const outputModalities = m.architecture?.output_modalities ?? [];
        return {
          model: m.id,
          displayName: m.name ?? null,
          description: m.description ?? null,
          contextLength: typeof m.context_length === 'number' ? m.context_length : null,
          inputModalities: Array.isArray(inputModalities) ? (inputModalities as string[]) : [],
          outputModalities: Array.isArray(outputModalities) ? (outputModalities as string[]) : [],
          supportedParameters: Array.isArray(m.supported_parameters) ? (m.supported_parameters as string[]) : [],
          metadata: {
            source: 'openrouter',
            canonical_slug: m.canonical_slug,
          },
          isEnabled: true,
          isDeprecated: false,
        };
      })
    );

    await repo.upsertModelProviders(
      filtered.map((m) => ({
        model: m.id,
        provider: 'openrouter',
        providerModelId: m.id,
        priority: 0,
        isEnabled: true,
        pricing: m.pricing ?? null,
        metadata: {
          source: 'openrouter',
          top_provider: m.top_provider ?? null,
        },
        lastSyncedAt: nowIso,
      }))
    );

    // Prune any previously-synced OpenRouter routes outside the allowlist.
    // Keeps the DB catalog consistent with the curated list.
    try {
      const conn = (repo as unknown as { getConnection: () => { query: (q: string, p?: unknown[]) => Promise<unknown> } }).getConnection();
      const allow = Array.from(ALLOWED_CANONICAL_MODELS);

      await conn.query(
        `
        DELETE FROM llm_model_providers
        WHERE provider = 'openrouter'
          AND model <> ALL($1::text[])
        `,
        [allow]
      );

      // Optionally remove canonical models that are not allowlisted (only if they have no provider routes left).
      await conn.query(
        `
        DELETE FROM llm_models m
        WHERE m.model <> ALL($1::text[])
          AND NOT EXISTS (
            SELECT 1 FROM llm_model_providers p WHERE p.model = m.model
          )
        `,
        [allow]
      );
    } catch {
      // Non-fatal: sync still succeeded; pruning is best-effort.
    }

    sendSuccess(res, {
      syncedModels: filtered.length,
      provider: 'openrouter',
      allowlistSize: ALLOWED_CANONICAL_MODELS.size,
      at: nowIso,
    });
  } catch (error) {
    handleError(error, res, 'syncing OpenRouter models');
  }
});

export default router;
