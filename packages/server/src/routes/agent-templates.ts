import { jwtAuthMiddleware, optionalJwtAuth } from '@/middleware/jwt-auth';
import { AgentTemplateService } from '@/services/AgentTemplateService';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, PaginationSchema, SlugSchema } from '@/schemas/common';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import { AgentTemplateRepository } from '@starships/models';
import { buildPublicS3ObjectUrl, generatePresignedUrlInline } from '@/utils/s3-helper';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import type { AgentTemplateModel, AuthUser } from '@starships/protocol';
import { AgentTemplateMarketingService } from '@/services/AgentTemplateMarketingService';
import { triggerNextRevalidate } from '@/utils/nextRevalidate';
import {
  completeAgentTemplateMarketingJob,
  createAgentTemplateMarketingJob,
  failAgentTemplateMarketingJob,
  getAgentTemplateMarketingJob,
  markJobStep,
} from '@/services/AgentTemplateMarketingJobs';

const router: Router = Router();

type ConnectionLike = {
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null | undefined>;
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
};

// Cache the agents table template id column name once per process.
// This is a one-time migration compatibility check and should not hit information_schema on every request.
let cachedAgentsTemplateColumn: 'source_template_id' | 'template_id' | null = null;
let cachedAgentsTemplateColumnPromise: Promise<'source_template_id' | 'template_id'> | null = null;

function toCreatorSafeTemplateModel(template: Record<string, unknown>): Record<string, unknown> {
  // Never expose raw S3 pointers even to creators (serve via direct public URL).
  const hasAvatar = typeof template['avatarS3Key'] === 'string' && String(template['avatarS3Key']).length > 0;
  const id = typeof template['id'] === 'string' ? template['id'] : undefined;
  if (hasAvatar && id) {
    const s3Key = String(template['avatarS3Key'] || '').trim();
    const url = s3Key ? buildPublicS3ObjectUrl(s3Key) : undefined;
    if (url) template['avatarUrl'] = url;
  }
  delete template['avatarS3Key'];
  delete template['avatarMimeType'];
  return template;
}

function requireInstanceAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
    sendError(res, 'FORBIDDEN', 'Only instance admins can access agent template admin endpoints', 403);
    return;
  }
  next();
}

// Enforce auth + instance-admin for all agent template admin endpoints.
router.use('/admin/agent-templates', jwtAuthMiddleware, requireInstanceAdminMiddleware);

// Zod schemas for validation
// Using standard pagination schema for consistency

const CreateAgentFromTemplateSchema = z.object({
  starshipId: z.string().regex(/^([a-z0-9_-]{10,30}|[a-z0-9-]{1,100})$/i, 'Invalid starship ID or slug'),
});

// Helper function to get AgentTemplateService instance
function getAgentTemplateService(): AgentTemplateService | null {
  try {
    return new AgentTemplateService();
  } catch (error) {
    console.error('Failed to get AgentTemplateService:', error);
    return null;
  }
}

// GET /agent-templates - Get all templates (public)
router.get('/agent-templates', optionalJwtAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Template service not available', 503);
      return;
    }

    // Validate pagination and search parameters
    const QuerySchema = PaginationSchema.extend({
      // Client code commonly uses `search`; legacy callers may use `query`.
      search: z.string().optional(),
      query: z.string().optional(),
      category: z
        .enum(['general', 'coding', 'creative', 'analysis', 'support', 'utility', 'data', 'communication', 'automation'])
        .optional(),
    });
    const queryValidation = validateData(QuerySchema, req.query, res, 'pagination query');
    if (!queryValidation) return;

    const { page, limit } = queryValidation;
    const searchQuery = (queryValidation.search || queryValidation.query || '').trim();
    const category = queryValidation.category;

    const requesterUserId = req.user?.id;
    const repo = new AgentTemplateRepository();
    const connection = (((repo as any).getConnection?.() ?? null) as unknown as ConnectionLike | null) ?? null;
    const windowDays = 30; // popularity window for listing (avoid `usage_count`)

    async function resolveAgentsTemplateColumn(): Promise<'source_template_id' | 'template_id'> {
      if (cachedAgentsTemplateColumn) return cachedAgentsTemplateColumn;
      if (!connection?.queryOne) return 'template_id';

      if (cachedAgentsTemplateColumnPromise) return await cachedAgentsTemplateColumnPromise;

      cachedAgentsTemplateColumnPromise = (async () => {
        const row = await connection.queryOne<{ has_source: boolean; has_template: boolean }>(
          `
            SELECT
              EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'source_template_id') AS has_source,
              EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'template_id') AS has_template
          `
        );
        const resolved: 'source_template_id' | 'template_id' = row?.has_source ? 'source_template_id' : 'template_id';
        cachedAgentsTemplateColumn = resolved;
        return resolved;
      })();

      try {
        return await cachedAgentsTemplateColumnPromise;
      } catch (e) {
        // If the query fails, don't poison the cache; allow a later retry.
        cachedAgentsTemplateColumnPromise = null;
        throw e;
      }
    }

    // Popularity-sorted listing (no search).
    // For search queries, keep relevance sorting from repository search.
    let paginatedTemplates: AgentTemplateModel[] = [];
    let paginationMeta = createPaginationMeta(page, limit, 0);

    if (searchQuery) {
      const base = await templateService.searchTemplates(searchQuery);
      const filtered = category ? base.filter((t) => t?.category === category) : base;
      const startIndex = (page - 1) * limit;
      paginatedTemplates = filtered.slice(startIndex, startIndex + limit);
      paginationMeta = createPaginationMeta(page, limit, filtered.length);
    } else {
      if (!connection?.queryOne || !connection?.query) {
        // Fallback: no DB connection method exposed. Keep deterministic ordering (newest first).
        const base = category ? await templateService.getTemplatesByCategory(category) : await templateService.getAllTemplates();
        const startIndex = (page - 1) * limit;
        paginatedTemplates = base.slice(startIndex, startIndex + limit);
        paginationMeta = createPaginationMeta(page, limit, base.length);
      } else {
        const templateCol = await resolveAgentsTemplateColumn();
        const offset = (page - 1) * limit;

        const whereSql = category ? `WHERE at.category = $2` : '';
        const whereCountSql = category ? `WHERE at.category = $1` : '';
        const countParams: unknown[] = category ? [category] : [];
        const countRow = await connection.queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM agent_templates at ${whereCountSql}`, countParams);

        // For count query, we didn't include windowDays; rebuild params for the main query.
        const listParams: unknown[] = category ? [windowDays, category, limit, offset] : [windowDays, limit, offset];
        const pLimit = `$${category ? 3 : 2}`;
        const pOffset = `$${category ? 4 : 3}`;

        const rows = await connection.query<{ id: string }>(
          `
            WITH agent_msgs AS (
              SELECT DISTINCT
                a.${templateCol} AS template_id,
                m.conversation_id AS conversation_id
              FROM messages m
              JOIN agents a ON a.id = m.agent_id
              WHERE m.role = 'assistant'
                AND m.agent_id IS NOT NULL
                AND a.${templateCol} IS NOT NULL
                AND m.created_at >= NOW() - ($1::int * INTERVAL '1 day')
            ),
            agent_usage AS (
              SELECT
                template_id,
                COUNT(*)::int AS conversation_refs,
                COUNT(DISTINCT conversation_id)::int AS conversation_count
              FROM agent_msgs
              GROUP BY template_id
            ),
            agent_tokens AS (
              SELECT
                am.template_id AS template_id,
                COALESCE(SUM(u.total_tokens), 0)::bigint AS token_count
              FROM agent_msgs am
              JOIN usage u ON u.conversation_id = am.conversation_id
              WHERE u.created_at >= NOW() - ($1::int * INTERVAL '1 day')
              GROUP BY am.template_id
            )
            SELECT at.id
            FROM agent_templates at
            LEFT JOIN agent_usage au ON au.template_id = at.id
            LEFT JOIN agent_tokens tok ON tok.template_id = at.id
            ${whereSql}
            ORDER BY
              COALESCE(au.conversation_count, 0) DESC,
              COALESCE(tok.token_count, 0) DESC,
              COALESCE(au.conversation_refs, 0) DESC,
              at.created_at DESC
            LIMIT ${pLimit}
            OFFSET ${pOffset}
          `,
          listParams
        );

        const ids = (rows || [])
          .map((r: { id?: unknown }) => (typeof r?.id === 'string' ? String(r.id).trim() : ''))
          .filter((x: string) => x.length > 0);

        const fetched = await templateService.getTemplatesByIds(ids);
        const byId = new Map<string, AgentTemplateModel>();
        for (const t of fetched || []) {
          const tid = (t as unknown as { id?: unknown })?.id;
          if (typeof tid === 'string' && tid.trim().length > 0) byId.set(tid, t);
        }
        paginatedTemplates = ids.map((id) => byId.get(id)).filter((t): t is AgentTemplateModel => !!t);
        paginationMeta = createPaginationMeta(page, limit, countRow?.n ?? 0);
      }
    }

    const templateIds = paginatedTemplates
      .map((t): string | undefined => {
        if (!t || typeof t !== 'object') return undefined;
        const rec = t as unknown as Record<string, unknown>;
        return typeof rec.id === 'string' ? rec.id : undefined;
      })
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

    // Only creators can see sensitive fields. Everyone else gets the public-stripped model.
    const creatorIdsByTemplateId =
      requesterUserId && templateIds.length > 0 ? await repo.getCreatorUserIdsByTemplateIds(templateIds) : new Map<string, string>();

    // Batch-load internals only for templates that belong to the requester.
    const creatorTemplateIds =
      requesterUserId && templateIds.length > 0 ? templateIds.filter((id) => creatorIdsByTemplateId.get(id) === requesterUserId) : [];
    const internalsByTemplateId =
      creatorTemplateIds.length > 0
        ? await repo.findInternalByIds(creatorTemplateIds)
        : new Map<string, import('@starships/protocol').AgentTemplateModel>();

    const hydrated = await Promise.all(
      paginatedTemplates.map(async (t) => {
        const publicModel: Record<string, unknown> = { ...((t ?? {}) as unknown as Record<string, unknown>) };
        const templateId = typeof publicModel['id'] === 'string' ? (publicModel['id'] as string) : undefined;

        const creatorUserId = templateId ? creatorIdsByTemplateId.get(templateId) : undefined;
        const isCreator = !!requesterUserId && !!creatorUserId && requesterUserId === creatorUserId;

        if (!isCreator || !templateId) {
          // Defensive: repository already strips sensitive fields, but ensure we never leak them from this route.
          delete publicModel['systemPrompt'];
          delete publicModel['blueprint'];
          delete publicModel['state'];
          delete publicModel['temperature'];
          delete publicModel['maxTokens'];
          delete publicModel['reasoning'];
          delete publicModel['timeout'];
          return publicModel;
        }

        const internal = internalsByTemplateId.get(templateId);
        if (!internal) return publicModel;
        return toCreatorSafeTemplateModel({ ...(internal as unknown as Record<string, unknown>) });
      })
    );

    sendSuccess(res, hydrated, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'loading templates');
  }
});

// POST /admin/agent-templates/:id/marketing/generate - Generate marketing content for a published template (instance admin only)
router.post('/admin/agent-templates/:id/marketing/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'template parameter');
    if (!paramValidation) return;

    const { id: templateId } = paramValidation;
    const adminUserId = req.user!.id;

    const job = createAgentTemplateMarketingJob(templateId, adminUserId);

    // Kick off background job (best-effort; status is tracked in memory).
    (async () => {
      try {
        markJobStep(job.id, 'validate_admin', 'running');
        markJobStep(job.id, 'validate_admin', 'completed');

        const svc = new AgentTemplateMarketingService();
        const result = await svc.generateTemplateMarketingContent(templateId, adminUserId, {
          onStep: (key, status) => {
            // Map service step keys into job step keys (same strings, minus validate_admin)
            markJobStep(job.id, key as any, status as any);
          },
        });

        // Ensure any still-pending steps are marked completed (defensive).
        for (const step of [
          'load_template',
          'generate_problem_statements',
          'load_avatar_reference',
          'generate_problem_image',
          'generate_capabilities_image',
          'generate_try_prompts_image',
          'persist_template_assets',
          'revalidate',
        ] as const) {
          markJobStep(job.id, step, 'completed');
        }

        completeAgentTemplateMarketingJob(job.id, result);
      } catch (err) {
        // Mark the currently-running step as failed is handled by step callbacks; store job-level error too.
        failAgentTemplateMarketingJob(job.id, err);
      }
    })();

    sendSuccess(res, {
      message: 'Agent template marketing job started',
      jobId: job.id,
      job,
    });
  } catch (error) {
    console.error('[AGENT-TEMPLATES] Error generating template marketing content:', error);
    handleError(error, res, 'generating template marketing content');
  }
});

// GET /admin/agent-templates/marketing/jobs/:jobId - Poll marketing generation progress (instance admin only)
router.get('/admin/agent-templates/marketing/jobs/:jobId', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ jobId: z.string().min(1).max(100) }), req.params, res, 'job parameter');
    if (!paramValidation) return;

    const job = getAgentTemplateMarketingJob(paramValidation.jobId);
    if (!job) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Marketing job not found (expired or invalid id)', 404);
      return;
    }

    sendSuccess(res, job, 200);
  } catch (error) {
    handleError(error, res, 'loading marketing job status');
  }
});

// POST /admin/agent-templates/:id/marketing/revalidate - Revalidate public marketplace ISR caches (instance admin only)
router.post('/admin/agent-templates/:id/marketing/revalidate', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'template parameter');
    if (!paramValidation) return;

    // Revalidate the caches used by marketplace pages.
    triggerNextRevalidate({ tags: ['public-agent-templates', 'public-tool-templates', 'public-connector-catalog'] });
    sendSuccess(res, { ok: true }, 200);
  } catch (error) {
    handleError(error, res, 'revalidating marketplace caches');
  }
});

// POST /admin/agent-templates/:id/marketing/rendering - Enable/disable marketing sections rendering (instance admin only)
router.post('/admin/agent-templates/:id/marketing/rendering', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'template parameter');
    if (!paramValidation) return;
    const bodyValidation = validateData(z.object({ disabled: z.boolean() }), req.body, res, 'rendering parameter');
    if (!bodyValidation) return;

    const { id: templateId } = paramValidation;
    const { disabled } = bodyValidation;

    const repo = new AgentTemplateRepository();
    const updated = await repo.update(templateId, { marketplaceMarketingRenderingDisabled: disabled });
    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Template not found', 404, { resource: 'agent-template', id: templateId });
      return;
    }

    // Revalidate the caches used by marketplace pages.
    triggerNextRevalidate({ tags: ['public-agent-templates', 'public-tool-templates', 'public-connector-catalog'] });

    sendSuccess(res, { ok: true, disabled }, 200);
  } catch (error) {
    handleError(error, res, 'updating marketing rendering setting');
  }
});

// GET /agent-templates/:id/required-connectors - Get required connectors for an agent template (public)
router.get('/agent-templates/:id/required-connectors', optionalJwtAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'template parameter');
    if (!paramValidation) return;
    const { id } = paramValidation;

    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Template service not available', 503);
      return;
    }

    const requiredConnectors = await templateService.getRequiredConnectorsForTemplate(id);
    sendSuccess(res, { requiredConnectors }, 200);
  } catch (error) {
    handleError(error, res, 'loading required connectors');
  }
});

// GET /agent-templates/:id - Get template by ID (public)
router.get('/agent-templates/:id', optionalJwtAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate template ID format
    const paramValidation = validateData(z.object({ id: z.union([IdSchema, SlugSchema]) }), req.params, res, 'template parameter');
    if (!paramValidation) return;

    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Template service not available', 503);
      return;
    }

    const repo = new AgentTemplateRepository();
    const requesterUserId = req.user?.id;
    // Support slugs in addition to internal ids. Slugs can match our broad IdSchema,
    // so always try slug lookup first, then fall back to id.
    const bySlug = await repo.findBySlug(id);
    const resolvedTemplateId = bySlug?.id ?? id;

    const creatorUserId = requesterUserId ? await repo.getCreatorUserIdByTemplateId(resolvedTemplateId) : null;
    const isCreator = !!requesterUserId && !!creatorUserId && requesterUserId === creatorUserId;

    const template = isCreator ? await repo.findInternalById(resolvedTemplateId) : await templateService.getTemplateById(resolvedTemplateId);

    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Template not found', 404, {
        resource: 'agent-template',
        id: resolvedTemplateId,
      });
      return;
    }

    if (isCreator) {
      const creatorModel = toCreatorSafeTemplateModel({ ...((template ?? {}) as unknown as Record<string, unknown>) });
      sendSuccess(res, creatorModel, 200);
      return;
    }

    // Defensive: repository already strips sensitive fields, but ensure we never leak them from this route.
    const publicModel: Record<string, unknown> = { ...((template ?? {}) as unknown as Record<string, unknown>) };
    delete publicModel['systemPrompt'];
    delete publicModel['blueprint'];
    delete publicModel['state'];
    delete publicModel['temperature'];
    delete publicModel['maxTokens'];
    delete publicModel['reasoning'];
    delete publicModel['timeout'];

    sendSuccess(res, publicModel, 200);
  } catch (error) {
    handleError(error, res, 'loading template');
  }
});

/**
 * GET /agent-templates/:id/profile-images/:type (public)
 * Streams the template profile image from S3 via a server-generated presigned URL.
 * @param type Profile image type: 'problem-statements' | 'capabilities' | 'try-these-prompts'
 */
router.get('/agent-templates/:id/profile-images/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
        type: z.enum(['problem-statements', 'capabilities', 'try-these-prompts']),
      }),
      req.params,
      res,
      'template parameter'
    );
    if (!paramValidation) return;
    const { id, type } = paramValidation;

    // Map URL type to database type
    const typeMap: Record<string, 'problem_statements' | 'capabilities' | 'try_these_prompts'> = {
      'problem-statements': 'problem_statements',
      capabilities: 'capabilities',
      'try-these-prompts': 'try_these_prompts',
    };
    const dbType = typeMap[type];
    if (!dbType) {
      sendError(res, 'VALIDATION_ERROR', `Invalid profile image type: ${type}`, 400);
      return;
    }

    const repo = new AgentTemplateRepository();
    const storage = await repo.getProfileImageStorageById(id, dbType);
    if (!storage || !storage.s3Key) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Template profile image not found', 404, {
        resource: 'agent-template-profile-image',
        id,
        type,
      });
      return;
    }

    const url = await generatePresignedUrlInline(storage.s3Key, 60);
    const response = await fetch(url);
    if (!response.ok) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Failed to fetch template profile image from storage', 500);
      return;
    }

    res.setHeader('Content-Type', storage.mimeType || response.headers.get('content-type') || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (storage.updatedAt) {
      res.setHeader('Last-Modified', new Date(storage.updatedAt).toUTCString());
    }

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
      res.end();
    } else {
      const buf = await response.arrayBuffer();
      res.send(Buffer.from(buf));
    }
  } catch (error) {
    handleError(error, res, 'fetching template profile image');
  }
});

// POST /agent-templates/:templateId/agents - Create agent from template (OpenAPI pattern)
// NOTE: Despite the param name, this route supports passing either an internal id OR a template slug.
router.post('/agent-templates/:templateId/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Support either internal id or public slug in the path param.
    const paramValidation = validateData(z.object({ templateId: z.union([IdSchema, SlugSchema]) }), req.params, res, 'template parameter');
    if (!paramValidation) return;
    const validatedTemplateId = paramValidation.templateId;

    // Validate request body using the schema
    const bodyValidation = validateData(CreateAgentFromTemplateSchema, req.body, res, 'request body');
    if (!bodyValidation) return;

    const { starshipId } = bodyValidation;

    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Template service not available', 503);
      return;
    }

    const templateRepo = new AgentTemplateRepository();
    // NOTE:
    // Template slugs (e.g. `data-analyst-3ie8`) can match our broad IdSchema.
    // To avoid mis-classifying slugs as ids, always try slug lookup first, then fall back to id.
    const templateBySlug = await templateRepo.findBySlug(validatedTemplateId);
    const template = templateBySlug ?? (await templateService.getTemplateById(validatedTemplateId));
    const resolvedTemplateId = template?.id;

    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Template not found', 404, {
        resource: 'agent-template',
        templateId: validatedTemplateId,
      });
      return;
    }

    // Validate provided starshipId exists and belongs to user using service layer
    try {
      const starship = await templateService.validateStarshipAccess(starshipId, userId);
      console.log(`[TEMPLATE] Using specified starship "${starship.name}" (${starshipId}) for agent creation`);
    } catch (starshipError: unknown) {
      const err = starshipError && typeof starshipError === 'object' ? (starshipError as Record<string, unknown>) : {};
      const errName = typeof err.name === 'string' ? err.name : undefined;
      const errMessage = typeof err.message === 'string' ? err.message : undefined;

      console.error('[TEMPLATE] Error validating starship access:', {
        starshipId: starshipId,
        errorName: errName,
        errorMessage: errMessage,
        fullError: starshipError,
      });

      if (errName === 'NotFoundError') {
        sendError(res, 'RESOURCE_NOT_FOUND', errMessage || 'Starship not found', 404, {
          resource: 'starship',
          id: starshipId,
          hint: 'Please ensure you have access to a starship before creating agents',
        });
      } else if (errName === 'ValidationError') {
        sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403, {
          details: 'You do not have permission to create agents on this starship',
        });
      } else {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to validate starship', 500, {
          details: 'Could not verify starship ownership and existence',
        });
      }
      return;
    }

    // Create agent from template with validated starship ID
    if (!resolvedTemplateId) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Template resolution failed', 500, {
        templateId,
        hint: 'Resolved template id is missing',
      });
      return;
    }

    const agent = await templateService.createAgentFromTemplate(resolvedTemplateId, starshipId);

    // Log the creation for audit purposes
    console.log(`[TEMPLATE] Agent "${agent.name}" created from template "${template.name}" by user ${userId} on starship ${starshipId}`);

    sendSuccess(res, agent, 201);
  } catch (error) {
    handleError(error, res, 'creating agent from template');
  }
});

export default router;
