import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import type { Blueprint } from '@starships/autopilot';
import type {
  AdminConnectorTemplateListResponse,
  AdminConnectorTemplateResponse,
  AuthUser,
  ConnectorTemplateAdminModel,
  ConnectorTemplateModel,
  CreateConnectorTemplateRequest,
  UpdateConnectorTemplateRequest,
} from '@starships/protocol';
import { ConnectorTemplateEntity, ConnectorTemplateRepository } from '@starships/models';

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
    // Blueprint is a structured DSL object; we keep runtime validation permissive here.
    connectBlueprint: z.unknown().nullable().optional(),
    refreshBlueprint: z.unknown().nullable().optional(),
    testBlueprint: z.unknown().nullable().optional(),
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

const CreateConnectorTemplateSchema = z.object({
  id: TemplateIdOrProviderSchema.optional(),
  slug: z.string().trim().min(1).max(255).optional(),
  provider: z.string().trim().min(1).max(255),
  displayName: TemplateTextSchema.max(255),
  description: TemplateTextSchema.max(1024),
  authType: z.enum(['oauth2', 'api_key', 'custom', 'none']),
  isEnabled: z.boolean().optional(),
  version: z.string().trim().min(1).max(20).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  runtimeConfig: z.record(z.string(), z.unknown()).optional(),
  // Blueprint is a structured DSL object; we keep runtime validation permissive here.
  connectBlueprint: z.unknown().nullable().optional(),
  refreshBlueprint: z.unknown().nullable().optional(),
  testBlueprint: z.unknown().nullable().optional(),
});

function toTemplateSummary(entity: ConnectorTemplateEntity): ConnectorTemplateModel {
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

function toAdminModel(entity: ConnectorTemplateEntity): ConnectorTemplateAdminModel {
  return {
    ...toTemplateSummary(entity),
    runtimeConfig: entity.runtimeConfig || {},
    connectBlueprint: entity.connectBlueprint ?? null,
    refreshBlueprint: entity.refreshBlueprint ?? null,
    testBlueprint: entity.testBlueprint ?? null,
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

// POST /admin/connector-templates - Create a connector template (admin only)
router.post('/admin/connector-templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = validateData(CreateConnectorTemplateSchema, req.body as CreateConnectorTemplateRequest, res, 'connector template create');
    if (!body) return;

    const repo = new ConnectorTemplateRepository();
    const created = await repo.create({
      id: body.id,
      slug: body.slug,
      provider: body.provider,
      displayName: body.displayName,
      description: body.description,
      authType: body.authType,
      isEnabled: body.isEnabled,
      version: body.version,
      category: body.category,
      runtimeConfig: body.runtimeConfig,
      connectBlueprint: (body.connectBlueprint as Blueprint | null | undefined) ?? undefined,
      refreshBlueprint: (body.refreshBlueprint as Blueprint | null | undefined) ?? undefined,
      testBlueprint: (body.testBlueprint as Blueprint | null | undefined) ?? undefined,
    } satisfies CreateConnectorTemplateRequest);

    const payload: AdminConnectorTemplateResponse = {
      connector: toAdminModel(created),
    };

    sendSuccess(res, payload, 201);
  } catch (error) {
    handleError(error, res, 'creating connector template');
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
      authType: body.authType,
      isEnabled: body.isEnabled,
      version: body.version,
      category: body.category,
      runtimeConfig: body.runtimeConfig,
      connectBlueprint: body.connectBlueprint as Blueprint | null | undefined,
      refreshBlueprint: body.refreshBlueprint as Blueprint | null | undefined,
      testBlueprint: body.testBlueprint as Blueprint | null | undefined,
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

// DELETE /admin/connector-templates/:id - Delete a connector template (admin only)
router.delete('/admin/connector-templates/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: TemplateIdOrProviderSchema }), req.params, res, 'connector template id');
    if (!params) return;

    const repo = new ConnectorTemplateRepository();
    const existing = (await repo.findById(params.id)) ?? (await repo.findByProvider(params.id));
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: params.id });
      return;
    }

    const deleted = await repo.delete(existing.id);
    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: params.id });
      return;
    }

    res.status(204).send();
  } catch (error) {
    handleError(error, res, 'deleting connector template');
  }
});

export default router;
