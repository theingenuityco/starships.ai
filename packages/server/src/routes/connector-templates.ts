import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import type {
  AdminConnectorTemplateListResponse,
  AdminConnectorTemplateResponse,
  AuthUser,
  ConnectorTemplateAdminModel,
  ConnectorTemplateModel,
  UpdateConnectorTemplateRequest,
} from '@starships/protocol';
import { ConnectorTemplateRepository } from '@starships/models';

const router: Router = Router();

function requireInstanceAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
    sendError(res, 'FORBIDDEN', 'Only instance admins can access connector templates', 403);
    return;
  }
  next();
}

// Enforce auth + instance-admin for all connector template admin endpoints.
router.use('/admin/connector-templates', jwtAuthMiddleware, requireInstanceAdminMiddleware);

const TemplateIdOrProviderSchema = z.string().trim().min(1).max(255);

const TemplateTextSchema = z
  .string()
  .trim()
  .max(5000)
  .refine((val) => !/<[^>]*>/.test(val), { message: 'HTML tags are not allowed' });

const UpdateConnectorTemplateSchema = z
  .object({
    displayName: TemplateTextSchema.max(255).optional(),
    description: TemplateTextSchema.max(1024).optional(),
    authType: z.enum(['oauth2', 'api_key', 'custom', 'none']).optional(),
    isEnabled: z.boolean().optional(),
    version: z.string().trim().min(1).max(20).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    runtimeConfig: z.record(z.string(), z.unknown()).optional(),
    connectBlueprint: z.record(z.string(), z.unknown()).nullable().optional(),
    refreshBlueprint: z.record(z.string(), z.unknown()).nullable().optional(),
    testBlueprint: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .refine(
    (body) =>
      body.displayName !== undefined ||
      body.description !== undefined ||
      body.authType !== undefined ||
      body.isEnabled !== undefined ||
      body.version !== undefined ||
      body.category !== undefined ||
      body.runtimeConfig !== undefined ||
      body.connectBlueprint !== undefined ||
      body.refreshBlueprint !== undefined ||
      body.testBlueprint !== undefined,
    { message: 'At least one field must be provided' }
  );

function toTemplateSummary(entity: any): ConnectorTemplateModel {
  return {
    id: entity.id,
    slug: entity.slug,
    provider: entity.provider,
    displayName: entity.displayName,
    description: entity.description,
    authType: entity.authType,
    isEnabled: Boolean(entity.isEnabled),
    version: entity.version,
    category: entity.category,
    usageCount: entity.usageCount,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function toAdminModel(entity: any): ConnectorTemplateAdminModel {
  return {
    ...toTemplateSummary(entity),
    runtimeConfig: (entity.runtimeConfig || {}) as Record<string, unknown>,
    connectBlueprint: (entity.connectBlueprint ?? null) as Record<string, unknown> | null,
    refreshBlueprint: (entity.refreshBlueprint ?? null) as Record<string, unknown> | null,
    testBlueprint: (entity.testBlueprint ?? null) as Record<string, unknown> | null,
  };
}

// ============================================================================
// ADMIN CONNECTOR TEMPLATES (INSTANCE ADMIN ONLY)
// ============================================================================

// GET /admin/connector-templates - List connector templates (summaries)
router.get('/admin/connector-templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const repo = new ConnectorTemplateRepository();
    const templates = await repo.list();

    const payload: AdminConnectorTemplateListResponse = {
      connectors: templates.map(toTemplateSummary),
    };

    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'listing connector templates');
  }
});

// GET /admin/connector-templates/:id - Get a connector template (admin view)
router.get('/admin/connector-templates/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: TemplateIdOrProviderSchema }), req.params, res, 'connector template id');
    if (!params) return;

    const repo = new ConnectorTemplateRepository();
    const template = (await repo.findById(params.id)) ?? (await repo.findByProvider(params.id));
    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: params.id });
      return;
    }

    const payload: AdminConnectorTemplateResponse = {
      connector: toAdminModel(template),
    };

    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'fetching connector template');
  }
});

// PUT /admin/connector-templates/:id - Update a connector template (admin only)
router.put('/admin/connector-templates/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: TemplateIdOrProviderSchema }), req.params, res, 'connector template id');
    if (!params) return;

    const body = validateData(UpdateConnectorTemplateSchema, req.body as UpdateConnectorTemplateRequest, res, 'connector template update');
    if (!body) return;

    const repo = new ConnectorTemplateRepository();
    const existing = (await repo.findById(params.id)) ?? (await repo.findByProvider(params.id));
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: params.id });
      return;
    }

    const updated = await repo.update(existing.id, {
      displayName: body.displayName,
      description: body.description,
      authType: body.authType as any,
      isEnabled: body.isEnabled,
      version: body.version,
      category: body.category,
      runtimeConfig: body.runtimeConfig,
      connectBlueprint: body.connectBlueprint as any,
      refreshBlueprint: body.refreshBlueprint as any,
      testBlueprint: body.testBlueprint as any,
    });

    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: params.id });
      return;
    }

    const payload: AdminConnectorTemplateResponse = {
      connector: toAdminModel(updated),
    };

    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'updating connector template');
  }
});

export default router;
