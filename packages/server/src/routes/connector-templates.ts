import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import type {
  AdminConnectorTemplateListResponse,
  AdminConnectorTemplateImportResponse,
  AdminConnectorTemplateResponse,
  AuthUser,
  ConnectorAuthV2,
  ConnectorEndpointV2,
  ConnectorTemplateAdminModel,
  ConnectorTemplateModel,
  ConnectorTemplateRuntimeFieldsV2,
  CreateConnectorTemplateRequest,
  ImportExportContainerV1,
  ConnectorTemplateExportPayloadV1,
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

const AuthTypeSchema = z.enum(['oauth2', 'api_key', 'basic', 'platform_jwt', 'none']);

// Loose-but-validated: require `auth.type`, allow additional keys for forward-compat.
const AuthObjectSchema = z.object({ type: AuthTypeSchema }).passthrough();

const UpdateConnectorTemplateSchema = z
  .object({
    name: TemplateTextSchema.max(255).optional(),
    description: TemplateTextSchema.max(1024).optional(),
    isEnabled: z.boolean().optional(),
    version: z.string().trim().min(1).max(20).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    baseUrl: z.string().trim().min(1).max(2048).optional(),
    auth: AuthObjectSchema.optional(),
    variables: z.array(z.record(z.string(), z.unknown())).optional(),
    endpoints: z.array(z.record(z.string(), z.unknown())).optional(),
    rateLimit: z.record(z.string(), z.unknown()).optional(),
    metadataSchema: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.description !== undefined ||
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
  isEnabled: z.boolean().optional(),
  version: z.string().trim().min(1).max(20).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  baseUrl: z.string().trim().min(1).max(2048),
  auth: AuthObjectSchema,
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
    auth: { type: ((entity.authJson as unknown as { type?: string })?.type || 'none') as z.infer<typeof AuthTypeSchema> },
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

/**
 * GET /admin/connector-templates/:id/export
 * Export a connector template as a JSON container (instance admin only).
 */
router.get('/admin/connector-templates/:id/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: TemplateIdOrProviderSchema }), req.params, res, 'connector template id');
    if (!params) return;

    const repo = new ConnectorTemplateRepository();
    const template = (await repo.findById(params.id)) ?? (await repo.findByProvider(params.id));
    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: params.id });
      return;
    }

    const safeAuth = (template.authJson && typeof template.authJson === 'object' && !Array.isArray(template.authJson)
      ? template.authJson
      : { type: 'none' }) as unknown as ConnectorAuthV2;
    const safeVariables = (Array.isArray(template.variablesJson)
      ? template.variablesJson
      : undefined) as unknown as ConnectorTemplateRuntimeFieldsV2['variables'];
    const safeEndpoints = (Array.isArray(template.endpointsJson) ? template.endpointsJson : []) as unknown as ConnectorEndpointV2[];
    const safeRateLimit =
      template.rateLimitJson && typeof template.rateLimitJson === 'object' && !Array.isArray(template.rateLimitJson)
        ? (template.rateLimitJson as unknown as ConnectorTemplateRuntimeFieldsV2['rateLimit'])
        : undefined;
    const safeMetadataSchema =
      template.metadataSchemaJson && typeof template.metadataSchemaJson === 'object' && !Array.isArray(template.metadataSchemaJson)
        ? (template.metadataSchemaJson as unknown as ConnectorTemplateRuntimeFieldsV2['metadataSchema'])
        : undefined;

    const payload: ConnectorTemplateExportPayloadV1 = {
      connectorTemplate: {
        // Stable ids are useful for templates; allow explicit id/slug to be preserved on re-import.
        id: template.id,
        slug: template.slug,
        provider: template.provider,
        name: template.name,
        description: template.description,
        isEnabled: Boolean(template.isEnabled),
        version: template.version,
        category: template.category,
        baseUrl: template.baseUrl,
        auth: safeAuth,
        variables: safeVariables,
        endpoints: safeEndpoints,
        rateLimit: safeRateLimit,
        metadataSchema: safeMetadataSchema,
      },
    };

    const container: ImportExportContainerV1<'connector_template'> = {
      schemaVersion: '1',
      kind: 'connector_template',
      exportedAt: new Date().toISOString(),
      metadata: {
        fromProvider: template.provider,
        fromSlug: template.slug,
        fromId: template.id,
      },
      source: {
        app: 'starships.ai',
        version: process.env.npm_package_version,
      },
      payload,
    };

    sendSuccess(res, container);
  } catch (error) {
    handleError(error, res, 'exporting connector template');
  }
});

/**
 * POST /admin/connector-templates/import
 * Import (upsert) a connector template from an export container (instance admin only).
 */
router.post('/admin/connector-templates/import', async (req: Request, res: Response): Promise<void> => {
  try {
    const ContainerSchema = z.object({
      schemaVersion: z.literal('1'),
      kind: z.literal('connector_template'),
      exportedAt: z.string().min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
      source: z
        .object({
          app: z.string().optional(),
          version: z.string().optional(),
        })
        .optional(),
      payload: z.object({
        connectorTemplate: z.object({
          id: z.string().trim().min(1).optional(),
          slug: z.string().trim().min(1).optional(),
          provider: z.string().trim().min(1),
          name: z.string().trim().min(1),
          description: z.string().trim().min(1),
          isEnabled: z.boolean().optional(),
          version: z.string().trim().min(1).optional(),
          category: z.string().trim().min(1).optional(),
          baseUrl: z.string().trim().min(1),
          auth: AuthObjectSchema,
          variables: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
          endpoints: z.array(z.record(z.string(), z.unknown())),
          rateLimit: z.record(z.string(), z.unknown()).nullable().optional(),
          metadataSchema: z.record(z.string(), z.unknown()).nullable().optional(),
        }),
      }),
    });

    const body = validateData(ContainerSchema, req.body, res, 'connector template import container');
    if (!body) return;

    const warnings: string[] = [];
    // Zod schema intentionally validates a safe-but-loose JSON shape; cast through unknown to satisfy TS.
    const ctRaw = body.payload.connectorTemplate as unknown as CreateConnectorTemplateRequest;
    const ctRawNullable = ctRaw as unknown as {
      variables?: unknown;
      rateLimit?: unknown;
      metadataSchema?: unknown;
    };
    // Normalize nulls (common when JSONB columns are null) into undefined for optional fields.
    const ct: CreateConnectorTemplateRequest = {
      ...ctRaw,
      variables: ctRawNullable.variables === null ? undefined : ctRaw.variables,
      rateLimit: ctRawNullable.rateLimit === null ? undefined : ctRaw.rateLimit,
      metadataSchema: ctRawNullable.metadataSchema === null ? undefined : ctRaw.metadataSchema,
    };

    const repo = new ConnectorTemplateRepository();

    // Prefer explicit id match, then provider match (provider is effectively unique at the template level).
    const existing = (ct.id ? await repo.findById(ct.id) : null) ?? (await repo.findByProvider(ct.provider));

    let saved: ConnectorTemplateEntity;
    let created = false;

    if (existing) {
      if (ct.slug && ct.slug !== existing.slug) {
        warnings.push(`Imported slug "${ct.slug}" ignored; existing slug is "${existing.slug}".`);
      }
      if (ct.id && ct.id !== existing.id) {
        warnings.push(`Imported id "${ct.id}" ignored; updating existing template id "${existing.id}".`);
      }

      const updated =
        (await repo.update(existing.id, {
          name: ct.name,
          description: ct.description,
          // Persist a denormalized auth_type column for DB filtering/legacy reasons, derived from auth_json.type.
          authType: ct.auth.type,
          isEnabled: ct.isEnabled,
          version: ct.version,
          category: ct.category,
          baseUrl: ct.baseUrl,
          authJson: ct.auth as unknown as ConnectorAuthV2,
          variablesJson: ct.variables as unknown as ConnectorTemplateRuntimeFieldsV2['variables'],
          endpointsJson: ct.endpoints as unknown as ConnectorEndpointV2[],
          rateLimitJson: ct.rateLimit as unknown as ConnectorTemplateRuntimeFieldsV2['rateLimit'],
          metadataSchemaJson: ct.metadataSchema as unknown as ConnectorTemplateRuntimeFieldsV2['metadataSchema'],
        })) ?? undefined;

      if (!updated) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: existing.id });
        return;
      }
      saved = updated;
    } else {
      created = true;
      saved = await repo.create(ct);
    }

    const payload: AdminConnectorTemplateImportResponse = {
      connector: toAdminModel(saved),
      created,
      warnings: warnings.length ? warnings : undefined,
    };

    sendSuccess(res, payload, created ? 201 : 200);
  } catch (error) {
    handleError(error, res, 'importing connector template');
  }
});

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
      // Persist a denormalized auth_type column for DB filtering/legacy reasons, derived from auth_json.type.
      authType: body.auth ? body.auth.type : undefined,
      isEnabled: body.isEnabled,
      version: body.version,
      category: body.category,
      baseUrl: body.baseUrl,
      authJson: body.auth as unknown as ConnectorAuthV2,
      variablesJson: body.variables as unknown as ConnectorTemplateRuntimeFieldsV2['variables'],
      endpointsJson: body.endpoints as unknown as ConnectorEndpointV2[],
      rateLimitJson: body.rateLimit as unknown as ConnectorTemplateRuntimeFieldsV2['rateLimit'],
      metadataSchemaJson: body.metadataSchema as unknown as ConnectorTemplateRuntimeFieldsV2['metadataSchema'],
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
