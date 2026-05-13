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
  AdminConnectorTemplateActionsListResponse,
  AdminConnectorTemplateActionResponse,
  AuthUser,
  ConnectorAuthV2,
  ConnectorEndpointV2,
  ConnectorTemplateAdminModel,
  ConnectorTemplateModel,
  ConnectorTemplateRuntimeFieldsV2,
  ImportExportContainerV1,
  ConnectorTemplateExportPayloadV1,
} from '@starships/protocol';
import {
  ConnectorTemplateActionRepository,
  ConnectorTemplateEntity,
  ConnectorTemplateRepository,
} from '@starships/models';

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

function toTemplateSummary(entity: ConnectorTemplateEntity): ConnectorTemplateModel {
  return {
    id: entity.id,
    slug: entity.slug,
    provider: entity.provider,
    name: entity.name,
    description: entity.description,
    demoVideoUrl: entity.demoVideoUrl ?? undefined,
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
    demoVideoUrl: entity.demoVideoUrl ?? undefined,
    baseUrl: entity.baseUrl,
    auth: entity.authJson as unknown as ConnectorAuthV2,
    variables: entity.variablesJson as unknown as ConnectorTemplateRuntimeFieldsV2['variables'],
    rateLimit: entity.rateLimitJson as unknown as ConnectorTemplateRuntimeFieldsV2['rateLimit'],
    metadataSchema: entity.metadataSchemaJson as unknown as ConnectorTemplateRuntimeFieldsV2['metadataSchema'],
  };
}

async function loadTemplateByIdOrProvider(idOrProvider: string): Promise<ConnectorTemplateEntity | null> {
  const repo = new ConnectorTemplateRepository();
  return (await repo.findById(idOrProvider)) ?? (await repo.findByProvider(idOrProvider));
}

// ============================================================================
// ADMIN CONNECTOR TEMPLATES (INSTANCE ADMIN ONLY)
// ============================================================================

/**
 * GET /admin/connector-templates/:id/legacy-endpoints
 * Read-only visibility into legacy connector_templates.endpoints_json.
 *
 * This is intentionally NOT part of the main template model contract; it exists only
 * for transparent admin display and debugging. Runtime execution must use actions.
 */
router.get('/admin/connector-templates/:id/legacy-endpoints', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: TemplateIdOrProviderSchema }), req.params, res, 'connector template id');
    if (!params) return;

    const template = await loadTemplateByIdOrProvider(params.id);
    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: params.id });
      return;
    }

    const repo = new ConnectorTemplateRepository();
    const legacy = await repo.getLegacyEndpointsJsonByTemplateId(template.id);
    sendSuccess(res, { LEGACY_endpoints: legacy });
  } catch (error) {
    handleError(error, res, 'fetching legacy connector template endpoints_json');
  }
});

/**
 * GET /admin/connector-templates/:id/export
 * Export a connector template as a JSON container (instance admin only).
 */
router.get('/admin/connector-templates/:id/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: TemplateIdOrProviderSchema }), req.params, res, 'connector template id');
    if (!params) return;

    const template = await loadTemplateByIdOrProvider(params.id);
    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: params.id });
      return;
    }

    const actionRepo = new ConnectorTemplateActionRepository();
    const safeAuth = (template.authJson && typeof template.authJson === 'object' && !Array.isArray(template.authJson)
      ? template.authJson
      : { type: 'none' }) as unknown as ConnectorAuthV2;
    const safeVariables = (Array.isArray(template.variablesJson)
      ? template.variablesJson
      : undefined) as unknown as ConnectorTemplateRuntimeFieldsV2['variables'];
    const actions = (await actionRepo.listActionsByTemplateId(template.id)) as unknown as ConnectorEndpointV2[];
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
        rateLimit: safeRateLimit,
        metadataSchema: safeMetadataSchema,
        demoVideoUrl: template.demoVideoUrl ?? undefined,
      },
      actions,
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
 * Disabled: connector templates are now managed via bundle-service files.
 */
router.post('/admin/connector-templates/import', (_req: Request, res: Response): void => {
  res.status(405).json({ error: 'Connector templates are now managed via bundle-service files. Use the migration script to import templates.' });
});

// GET /admin/connector-templates - List connector templates (summaries)
router.get('/admin/connector-templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const repo = new ConnectorTemplateRepository();
    const templates = await repo.list();

    const payload: AdminConnectorTemplateListResponse = {
      connectors: templates.map(toTemplateSummary),
      total: templates.length,
    };

    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'listing connector templates');
  }
});

// POST /admin/connector-templates - Disabled: templates are now managed via bundle-service files.
router.post('/admin/connector-templates', (_req: Request, res: Response): void => {
  res.status(405).json({ error: 'Connector templates are now managed via bundle-service files. Use the migration script to add or update templates.' });
});

// GET /admin/connector-templates/:id - Get a connector template (admin view)
router.get('/admin/connector-templates/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: TemplateIdOrProviderSchema }), req.params, res, 'connector template id');
    if (!params) return;

    const template = await loadTemplateByIdOrProvider(params.id);
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

// PUT /admin/connector-templates/:id - Disabled: templates are now managed via bundle-service files.
router.put('/admin/connector-templates/:id', (_req: Request, res: Response): void => {
  res.status(405).json({ error: 'Connector templates are now managed via bundle-service files. Use the migration script to add or update templates.' });
});

// ============================================================================
// ADMIN CONNECTOR TEMPLATE ACTIONS (INSTANCE ADMIN ONLY)
// ============================================================================

const ActionsListQuerySchema = z
  .object({
    q: z.string().optional(),
    limit: z.coerce.number().min(1).max(200).optional(),
    offset: z.coerce.number().min(0).max(1_000_000).optional(),
  })
  .strict();

// GET /admin/connector-templates/:id/actions - list action rows (paged)
router.get('/admin/connector-templates/:id/actions', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: TemplateIdOrProviderSchema }), req.params, res, 'connector template id');
    if (!params) return;

    const query = validateData(ActionsListQuerySchema, req.query, res, 'actions list query');
    if (!query) return;

    const template = await loadTemplateByIdOrProvider(params.id);
    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: params.id });
      return;
    }

    const actionRepo = new ConnectorTemplateActionRepository();
    const total = await actionRepo.countActionRowsByTemplateId({
      templateId: template.id,
      q: query.q,
    });
    const rows = await actionRepo.listActionRowsByTemplateId({
      templateId: template.id,
      limit: query.limit,
      offset: query.offset,
      q: query.q,
    });

    // Keep response lightweight: return row summaries.
    const actions = rows.map((r) => ({
      templateId: r.template_id,
      actionName: r.action_name,
      ordinal: r.ordinal,
      method: r.method,
      path: r.path,
      description: r.description ?? undefined,
      baseUrlOverride: r.base_url_override ?? undefined,
      timeoutMs: r.timeout_ms ?? undefined,
      requestStyle: r.request_style ?? undefined,
      updatedAt: r.updated_at,
    }));

    const payload: AdminConnectorTemplateActionsListResponse = {
      actions: actions as unknown as AdminConnectorTemplateActionsListResponse['actions'],
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      total,
      q: query.q ?? undefined,
    };
    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'listing connector template actions');
  }
});

// GET /admin/connector-templates/:id/actions/:actionName - fetch a full endpoint
router.get('/admin/connector-templates/:id/actions/:actionName', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(
      z.object({ id: TemplateIdOrProviderSchema, actionName: z.string().trim().min(1).max(255) }),
      req.params,
      res,
      'connector template action params'
    );
    if (!params) return;

    const template = await loadTemplateByIdOrProvider(params.id);
    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { id: params.id });
      return;
    }

    const actionRepo = new ConnectorTemplateActionRepository();
    const action = await actionRepo.findAction(template.id, params.actionName);
    if (!action) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template action not found', 404, { id: template.id, actionName: params.actionName });
      return;
    }

    const payload: AdminConnectorTemplateActionResponse = { action };
    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'fetching connector template action');
  }
});

// PUT /admin/connector-templates/:id/actions/:actionName - Disabled
router.put('/admin/connector-templates/:id/actions/:actionName', (_req: Request, res: Response): void => {
  res.status(405).json({ error: 'Connector templates are now managed via bundle-service files. Use the migration script to update templates.' });
});

// DELETE /admin/connector-templates/:id/actions/:actionName - Disabled
router.delete('/admin/connector-templates/:id/actions/:actionName', (_req: Request, res: Response): void => {
  res.status(405).json({ error: 'Connector templates are now managed via bundle-service files. Use the migration script to update templates.' });
});

// PUT /admin/connector-templates/:id/actions - Disabled (bulk replace)
router.put('/admin/connector-templates/:id/actions', (_req: Request, res: Response): void => {
  res.status(405).json({ error: 'Connector templates are now managed via bundle-service files. Use the migration script to update templates.' });
});

// DELETE /admin/connector-templates/:id - Disabled
router.delete('/admin/connector-templates/:id', (_req: Request, res: Response): void => {
  res.status(405).json({ error: 'Connector templates are now managed via bundle-service files. Use the migration script to update templates.' });
});

export default router;
