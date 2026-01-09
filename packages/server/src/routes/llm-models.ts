import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { validateData } from '@/utils/validation';
import { getEnvConfig } from '@starships/env';
import { LlmModelRepository } from '@starships/models';
import type { OpenRouterModel, LlmModelModel, LlmModelProviderModel } from '@starships/protocol';

const router: Router = Router();

const repo = new LlmModelRepository();

const ModelIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'model is required')
  .max(255, 'model must be 255 characters or less')
  // OpenRouter-style ids commonly include provider/model, and may include dots or suffixes like :free
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/_-]*$/, 'Invalid model identifier');

const ModelParamSchema = z.object({ model: ModelIdentifierSchema }).passthrough();
const CreateModelBodySchema = z.object({ model: ModelIdentifierSchema }).passthrough();

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
    const params = validateData(ModelParamSchema, req.params, res, 'llm model params');
    if (!params) return;
    const { model } = params;
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
 * POST /llm/models
 * Admin-only: create a canonical model (or upsert basic fields).
 */
router.post('/llm/models', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user)) {
      sendError(res, 'FORBIDDEN', 'Admin access required', 403);
      return;
    }
    const body = validateData(CreateModelBodySchema, req.body, res, 'create llm model body');
    if (!body) return;
    const { model } = body;

    await repo.upsertModels([
      {
        model,
        displayName: typeof body.displayName === 'string' ? body.displayName : null,
        description: typeof body.description === 'string' ? body.description : null,
        contextLength: typeof body.contextLength === 'number' ? body.contextLength : null,
        isEnabled: typeof body.isEnabled === 'boolean' ? body.isEnabled : true,
        isDeprecated: typeof body.isDeprecated === 'boolean' ? body.isDeprecated : false,
        metadata:
          body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : { source: 'admin' },
      },
    ]);

    sendSuccess(res, { model });
  } catch (error) {
    handleError(error, res, 'creating LLM model');
  }
});

/**
 * PUT /llm/models/:model
 * Admin-only: update canonical model fields.
 */
router.put('/llm/models/:model', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user)) {
      sendError(res, 'FORBIDDEN', 'Admin access required', 403);
      return;
    }
    const params = validateData(ModelParamSchema, req.params, res, 'llm model params');
    if (!params) return;
    const { model } = params;

    const body = (req.body || {}) as Record<string, unknown>;
    await repo.updateModel(model, {
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      contextLength: typeof body.contextLength === 'number' ? body.contextLength : undefined,
      isEnabled: typeof body.isEnabled === 'boolean' ? body.isEnabled : undefined,
      isDeprecated: typeof body.isDeprecated === 'boolean' ? body.isDeprecated : undefined,
      metadata:
        body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : undefined,
    });

    sendSuccess(res, { model });
  } catch (error) {
    handleError(error, res, 'updating LLM model');
  }
});

/**
 * POST /llm/models/:model/providers
 * Admin-only: upsert a provider route for a canonical model.
 */
router.post('/llm/models/:model/providers', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user)) {
      sendError(res, 'FORBIDDEN', 'Admin access required', 403);
      return;
    }
    const params = validateData(ModelParamSchema, req.params, res, 'llm model params');
    if (!params) return;
    const { model } = params;
    const body = (req.body || {}) as Record<string, unknown>;
    const provider = String(body.provider ?? '').trim();
    const providerModelId = String(body.providerModelId ?? '').trim();
    if (!provider || !providerModelId) {
      sendError(res, 'VALIDATION_ERROR', 'provider and providerModelId are required', 400);
      return;
    }

    await repo.upsertModelProviders([
      {
        model,
        provider,
        providerModelId,
        priority: typeof body.priority === 'number' ? body.priority : 0,
        isEnabled: typeof body.isEnabled === 'boolean' ? body.isEnabled : true,
        metadata:
          body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : { source: 'admin' },
      },
    ]);

    sendSuccess(res, { model, provider, providerModelId });
  } catch (error) {
    handleError(error, res, 'upserting LLM model provider');
  }
});

/**
 * DELETE /llm/models/:model/providers?provider=...&providerModelId=...
 * Admin-only: delete one provider route.
 */
router.delete('/llm/models/:model/providers', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user)) {
      sendError(res, 'FORBIDDEN', 'Admin access required', 403);
      return;
    }
    const params = validateData(ModelParamSchema, req.params, res, 'llm model params');
    if (!params) return;
    const { model } = params;
    const provider = String(req.query.provider ?? '').trim();
    const providerModelId = String(req.query.providerModelId ?? '').trim();
    if (!model || !provider || !providerModelId) {
      sendError(res, 'VALIDATION_ERROR', 'model, provider, and providerModelId are required', 400);
      return;
    }
    await repo.deleteProviderRoute({ model, provider, providerModelId });
    sendSuccess(res, { model, provider, providerModelId });
  } catch (error) {
    handleError(error, res, 'deleting LLM model provider');
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
      const rawBody = await resp.text().catch(() => '');
      const bodySnippet = rawBody ? rawBody.slice(0, 1000) : '';
      // Log upstream details server-side, but don't leak response bodies to clients.
      console.warn('[LLM_MODELS] OpenRouter sync failed', {
        status: resp.status,
        statusText: resp.statusText,
        bodySnippet,
      });
      sendError(res, 'SERVICE_UNAVAILABLE', `OpenRouter responded with ${resp.status}`, resp.status);
      return;
    }

    const payload: unknown = await resp.json();
    const models: OpenRouterModel[] = Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data as OpenRouterModel[])
      : Array.isArray(payload)
        ? (payload as OpenRouterModel[])
        : [];

    // Only sync models that exist in our DB catalog (canonical allowlist is DB-driven).
    const catalog = await repo.listModels({ enabledOnly: false });
    const allowlist = new Set(catalog.map((m) => m.model));

    const filtered = (models || []).filter((m) => m && m.id && m.id !== 'openrouter/auto' && allowlist.has(m.id));

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
    // Keeps the DB catalog consistent with the curated list in DB.
    try {
      const conn = (repo as unknown as { getConnection: () => { query: (q: string, p?: unknown[]) => Promise<unknown> } }).getConnection();
      const allow = Array.from(allowlist);

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
      allowlistSize: allowlist.size,
      at: nowIso,
    });
  } catch (error) {
    handleError(error, res, 'syncing OpenRouter models');
  }
});

export default router;
