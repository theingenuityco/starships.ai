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
  ConnectorAuthV2,
  ConnectorEndpointV2,
  ConnectorTemplateAdminModel,
  ConnectorTemplateModel,
  ConnectorTemplateRuntimeFieldsV2,
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
    name: TemplateTextSchema.max(255).optional(),
    description: TemplateTextSchema.max(1024).optional(),
    authType: z.enum(['oauth2', 'api_key', 'platform_jwt', 'none']).optional(),
    isEnabled: z.boolean().optional(),
    version: z.string().trim().min(1).max(20).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    baseUrl: z.string().trim().min(1).max(2048).optional(),
    auth: z.record(z.string(), z.unknown()).optional(),
    variables: z.array(z.record(z.string(), z.unknown())).optional(),
    endpoints: z.array(z.record(z.string(), z.unknown())).optional(),
    rateLimit: z.record(z.string(), z.unknown()).optional(),
    metadataSchema: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.description !== undefined ||
      body.authType !== undefined ||
      body.isEnabled !== undefined ||
      body.version !== undefined ||
      body.category !== undefined ||
      body.baseUrl !== undefined ||
      body.auth !== undefined ||
      body.variables !== undefined ||
      body.endpoints !== undefined ||
      body.rateLimit !== undefined ||
      body.metadataSchema !== undefined,
    { message: 'At least one field must be provided' }
  );

const CreateConnectorTemplateSchema = z.object({
  id: TemplateIdOrProviderSchema.optional(),
  slug: z.string().trim().min(1).max(255).optional(),
  provider: z.string().trim().min(1).max(255),
  name: TemplateTextSchema.max(255),
  description: TemplateTextSchema.max(1024),
  authType: z.enum(['oauth2', 'api_key', 'platform_jwt', 'none']),
  isEnabled: z.boolean().optional(),
  version: z.string().trim().min(1).max(20).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  baseUrl: z.string().trim().min(1).max(2048),
  auth: z.record(z.string(), z.unknown()),
  variables: z.array(z.record(z.string(), z.unknown())).optional(),
  endpoints: z.array(z.record(z.string(), z.unknown())),
  rateLimit: z.record(z.string(), z.unknown()).optional(),
  metadataSchema: z.record(z.string(), z.unknown()).optional(),
});

function toTemplateSummary(entity: ConnectorTemplateEntity): ConnectorTemplateModel {
  return {
    id: entity.id,
    slug: entity.slug,
    provider: entity.provider,
    name: entity.name,
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
    baseUrl: entity.baseUrl,
    auth: entity.authJson as unknown as ConnectorAuthV2,
    variables: entity.variablesJson as unknown as ConnectorTemplateRuntimeFieldsV2['variables'],
    endpoints: entity.endpointsJson as unknown as ConnectorEndpointV2[],
    rateLimit: entity.rateLimitJson as unknown as ConnectorTemplateRuntimeFieldsV2['rateLimit'],
    metadataSchema: entity.metadataSchemaJson as unknown as ConnectorTemplateRuntimeFieldsV2['metadataSchema'],
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
      name: body.name,
      description: body.description,
      authType: body.authType,
      isEnabled: body.isEnabled,
      version: body.version,
      category: body.category,
      baseUrl: body.baseUrl,
      auth: body.auth as unknown as ConnectorAuthV2,
      variables: body.variables as unknown as ConnectorTemplateRuntimeFieldsV2['variables'],
      endpoints: body.endpoints as unknown as ConnectorEndpointV2[],
      rateLimit: body.rateLimit as unknown as ConnectorTemplateRuntimeFieldsV2['rateLimit'],
      metadataSchema: body.metadataSchema as unknown as ConnectorTemplateRuntimeFieldsV2['metadataSchema'],
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
      name: body.name,
      description: body.description,
      authType: body.authType,
      isEnabled: body.isEnabled,
      version: body.version,
      category: body.category,
      baseUrl: body.baseUrl,
      authJson: body.auth as unknown as Record<string, unknown>,
      variablesJson: body.variables as unknown as Array<Record<string, unknown>> | undefined,
      endpointsJson: body.endpoints as unknown as Array<Record<string, unknown>>,
      rateLimitJson: body.rateLimit as unknown as Record<string, unknown> | undefined,
      metadataSchemaJson: body.metadataSchema as unknown as Record<string, unknown> | undefined,
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
