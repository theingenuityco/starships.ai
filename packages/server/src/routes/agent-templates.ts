import { jwtAuthMiddleware, optionalJwtAuth } from '@/middleware/jwt-auth';
import { AgentTemplateService } from '@/services/AgentTemplateService';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, PaginationSchema, SlugSchema } from '@/schemas/common';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import { AgentTemplateRepository } from '@starships/models';
import { generatePresignedUrlInline } from '@/utils/s3-helper';

const router: Router = Router();

function toCreatorSafeTemplateModel(template: Record<string, unknown>): Record<string, unknown> {
  // Never expose raw S3 pointers even to creators (serve via API route).
  const hasAvatar = typeof template['avatarS3Key'] === 'string' && String(template['avatarS3Key']).length > 0;
  const id = typeof template['id'] === 'string' ? template['id'] : undefined;
  if (hasAvatar && id) {
    template['avatarUrl'] = `/api/v1/agent-templates/${id}/avatar`;
  }
  delete template['avatarS3Key'];
  delete template['avatarMimeType'];
  return template;
}

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
      query: z.string().optional(),
    });
    const queryValidation = validateData(QuerySchema, req.query, res, 'pagination query');
    if (!queryValidation) return;

    const { page, limit, query: searchQuery } = queryValidation;

    // Use search if query provided, otherwise get all templates
    const allTemplates = searchQuery
      ? await templateService.searchTemplates(searchQuery)
      : await templateService.getAllTemplates();

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedTemplates = allTemplates.slice(startIndex, startIndex + limit);

    const paginationMeta = createPaginationMeta(page, limit, paginatedTemplates.length);

    const requesterUserId = req.user?.id;
    const repo = new AgentTemplateRepository();

    const templateIds = paginatedTemplates
      .map((t): string | undefined => {
        if (!t || typeof t !== 'object') return undefined;
        const rec = t as unknown as Record<string, unknown>;
        return typeof rec.id === 'string' ? rec.id : undefined;
      })
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

    // Only creators can see sensitive fields. Everyone else gets the public-stripped model.
    const creatorIdsByTemplateId =
      requesterUserId && templateIds.length > 0
        ? await repo.getCreatorUserIdsByTemplateIds(templateIds)
        : new Map<string, string>();

    // Batch-load internals only for templates that belong to the requester.
    const creatorTemplateIds =
      requesterUserId && templateIds.length > 0
        ? templateIds.filter((id) => creatorIdsByTemplateId.get(id) === requesterUserId)
        : [];
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

// GET /agent-templates/:id - Get template by ID (public)
router.get('/agent-templates/:id', optionalJwtAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate template ID format
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'template parameter');
    if (!paramValidation) return;

    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Template service not available', 503);
      return;
    }

    const repo = new AgentTemplateRepository();
    const requesterUserId = req.user?.id;
    const creatorUserId = requesterUserId ? await repo.getCreatorUserIdByTemplateId(id) : null;
    const isCreator = !!requesterUserId && !!creatorUserId && requesterUserId === creatorUserId;

    const template = isCreator ? await repo.findInternalById(id) : await templateService.getTemplateById(id);

    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Template not found', 404, {
        resource: 'agent-template',
        id: id,
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
 * GET /agent-templates/:id/avatar (public)
 * Streams the template avatar from S3 via a server-generated presigned URL.
 */
router.get('/agent-templates/:id/avatar', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'template parameter');
    if (!paramValidation) return;
    const { id } = paramValidation;

    const repo = new AgentTemplateRepository();
    const storage = await repo.getAvatarStorageById(id);
    if (!storage || !storage.avatarS3Key) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Template avatar not found', 404, { resource: 'agent-template-avatar', id });
      return;
    }

    const url = await generatePresignedUrlInline(storage.avatarS3Key, 60);
    const response = await fetch(url);
    if (!response.ok) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Failed to fetch template avatar from storage', 500);
      return;
    }

    res.setHeader('Content-Type', storage.avatarMimeType || response.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (storage.avatarUpdatedAt) {
      res.setHeader('Last-Modified', new Date(storage.avatarUpdatedAt).toUTCString());
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
    handleError(error, res, 'fetching template avatar');
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
    const isId = IdSchema.safeParse(templateId).success;
    const template = isId ? await templateService.getTemplateById(templateId) : await templateRepo.findBySlug(templateId);
    const resolvedTemplateId = template?.id;

    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Template not found', 404, {
        resource: 'agent-template',
        ...(isId ? { id: templateId } : { slug: templateId }),
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
