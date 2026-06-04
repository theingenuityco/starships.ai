import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, SlugSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { ViewRepository } from '@starships/models';
import { AppError } from '@starships/errors';
import { sendError, sendSuccess, handleError } from '../utils/responseHelpers';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { ViewStreamBus } from '@/services/ViewStreamBus';
import { buildAutopilotExecutionBundle } from '@/services/autopilot-execution-bundle';
import { connectorActionExecutor } from '@/services/ConnectorActionExecutor';
import { getEnvConfig } from '@starships/env';
import { ToolRepository, ViewWidgetRepository } from '@starships/models';
import { applyPatch } from 'fast-json-patch';
import type { ViewPatchOp, ViewRuntimeConfig } from '@starships/protocol';

const router: Router = Router();

const emptyStringToUndefined = (v: unknown) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v);

const WidgetInstanceNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    id: IdSchema.optional(),
    type: z.string().min(1).max(200),
    props: z.record(z.string(), z.unknown()).default({}),
    children: z.array(WidgetInstanceNodeSchema).optional(),
    bindings: z.record(z.string(), z.unknown()).optional(),
    handlers: z.record(z.string(), z.unknown()).optional(),
    permissions: z.record(z.string(), z.unknown()).optional(),
  })
);

const RuntimeConfigSchema = z.record(z.string(), z.unknown()).default({});

const ViewNodeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((val) => /^[a-z0-9_-]+$/i.test(val), { message: 'Invalid node id' });

const ViewWidgetUpsertSchema = z
  .object({
    type: z.string().min(1).max(200).optional(),
    props: z.record(z.string(), z.unknown()).optional(),
    bindings: z.record(z.string(), z.unknown()).nullable().optional(),
    handlers: z.record(z.string(), z.unknown()).nullable().optional(),
    permissions: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

const ViewPatchOpSchema = z.object({
  op: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']),
  path: z.string().min(1),
  from: z.string().optional(),
  value: z.unknown().optional(),
});

const PatchViewRootSchema = z
  .object({
    patch: z.array(ViewPatchOpSchema).min(1),
  })
  .strict();

const SearchViewsQuerySchema = z.object({
  name: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .min(1)
      .max(100, 'name must be less than 100 characters')
      .optional()
      .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE })
  ),
  slug: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .min(1)
      .max(100, 'slug must be less than 100 characters')
      .optional()
      .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE })
  ),
  limit: z.coerce.number().int().min(0).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

const CreateViewSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .refine(noXSS, { message: XSS_ERROR_MESSAGE }),
  slug: z
    .string()
    .min(1)
    .max(100, 'Slug must be less than 100 characters')
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  description: z.string().min(0).max(1000, 'Description must be less than 1000 characters').refine(noXSS, { message: XSS_ERROR_MESSAGE }),
  starshipId: IdSchema,
  root: WidgetInstanceNodeSchema.optional(),
  runtimeConfig: RuntimeConfigSchema.optional(),
});

const UpdateViewSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100, 'Name must be less than 100 characters')
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  description: z
    .string()
    .max(1000)
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  root: WidgetInstanceNodeSchema.optional(),
  runtimeConfig: RuntimeConfigSchema.optional(),
  version: z.coerce.number().int().min(1).optional(),
});

const ViewRuntimeActionRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run_workflow'),
    workflowSlug: z.string().min(1).max(200),
    args: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('set_state'),
    path: z.string().min(1).max(500),
    value: z.unknown(),
    persist: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('patch_props'),
    instanceId: IdSchema,
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('patch_root'),
    patch: z.array(z.record(z.string(), z.unknown())),
  }),
]);

const RunViewQueryBodySchema = z
  .object({
    state: z.record(z.string(), z.unknown()).optional(),
  })
  .default({});

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;
function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return obj;
  const parts = String(path).split('.').filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
function templateString(input: string, state: Record<string, unknown>): string {
  if (!input || typeof input !== 'string') return '';
  if (!input.includes('{{')) return input;
  return input.replace(TEMPLATE_RE, (_m, token) => {
    const t = String(token || '').trim();
    if (!t) return '';
    const path = t.startsWith('state.') ? t.slice('state.'.length) : t === 'state' ? '' : t;
    const v = path ? getAtPath(state ?? {}, path) : state;
    return v === null || v === undefined ? '' : String(v);
  });
}
function templateDeep(input: unknown, state: Record<string, unknown>): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return templateString(input, state);
  if (Array.isArray(input)) return input.map((v) => templateDeep(v, state));
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) out[k] = templateDeep(v, state);
    return out;
  }
  return input;
}

// Workflow-tool / view-action execution removed with the DAG engine. Retained as a
// throwing stub so the view-action route compiles; these actions are no longer supported.
async function executeToolBlueprint(_args: {
  blueprint: unknown;
  toolConfig: Record<string, unknown>;
  toolArgs: Record<string, unknown>;
  runnerConfig: Record<string, unknown>;
  eventCallback?: (evt: unknown) => void | Promise<void>;
}): Promise<unknown> {
  throw new AppError('Workflow tool / view-action execution has been removed.', 'NOT_IMPLEMENTED', 501);
}

/**
 * GET /api/v1/starships/:starshipId/views
 * List all views for a starship (optionally filtered by name/slug)
 */
router.get('/starships/:starshipId/views', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { starshipId } = req.params;
    const userId = req.user!.id;

    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const q = validateData(SearchViewsQuerySchema, req.query, res, 'views search query');
    if (!q) return;

    const viewRepo = new ViewRepository();
    const views = await viewRepo.search({
      starshipId,
      ...(q.name ? { name: q.name } : null),
      ...(q.slug ? { slug: q.slug } : null),
      ...(typeof q.limit === 'number' ? { limit: q.limit } : null),
      ...(typeof q.offset === 'number' ? { offset: q.offset } : null),
    });

    return sendSuccess(res, views);
  } catch (error) {
    return handleError(error, res, 'fetch views');
  }
});

/**
 * GET /api/v1/views/slug/:slug
 * Get view by slug (requires starshipId query param)
 */
router.get('/views/slug/:slug', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const slugValidated = validateData(SlugSchema, req.params.slug, res, 'validate slug');
  if (!slugValidated) return;

  const { starshipId } = req.query;
  if (!starshipId || typeof starshipId !== 'string') {
    return sendError(res, 'VALIDATION_ERROR', 'starshipId query parameter is required', 400);
  }

  try {
    const userId = req.user!.id;
    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const viewRepo = new ViewRepository();
    const view = await viewRepo.findBySlug(slugValidated, starshipId);

    if (!view) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    }

    return sendSuccess(res, view);
  } catch (error) {
    return handleError(error, res, 'fetch view by slug');
  }
});

/**
 * GET /api/v1/views/:id
 * Get view by ID (requires access to the owning starship)
 */
router.get('/views/:id', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const idValidated = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!idValidated) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();
    const view = await viewRepo.findById(idValidated);

    if (!view) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    }

    if (!(await verifyStarshipAccess(view.starshipId, userId, res))) return;

    return sendSuccess(res, view);
  } catch (error) {
    return handleError(error, res, 'fetch view');
  }
});

/**
 * GET /api/v1/views/:id/widgets
 * List persisted view widget nodes (view_widgets rows)
 */
router.get('/views/:id/widgets', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const idValidated = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!idValidated) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();
    const view = await viewRepo.findById(idValidated);
    if (!view) return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    if (!(await verifyStarshipAccess(view.starshipId, userId, res))) return;

    const viewWidgetRepo = new ViewWidgetRepository();
    const widgets = await viewWidgetRepo.listByView(view.id);
    return sendSuccess(res, widgets);
  } catch (error) {
    return handleError(error, res, 'list view widgets');
  }
});

/**
 * PATCH /api/v1/views/:id/widgets/:nodeId
 * Upsert a single view widget node (merges props on update)
 */
router.patch('/views/:id/widgets/:nodeId', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const viewId = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!viewId) return;
  const nodeId = validateData(ViewNodeIdSchema, req.params.nodeId, res, 'validate nodeId');
  if (!nodeId) return;

  const body = validateData(ViewWidgetUpsertSchema, req.body, res, 'validate view widget update body');
  if (!body) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();
    const view = await viewRepo.findById(viewId);
    if (!view) return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    if (!(await verifyStarshipAccess(view.starshipId, userId, res))) return;

    const viewWidgetRepo = new ViewWidgetRepository();
    const updated = await viewWidgetRepo.upsertOne(viewId, nodeId, body);

    // Bump view version (best-effort; not required for correctness today).
    try {
      await viewRepo.update(viewId, { version: (view.version || 1) + 1 });
    } catch {
      /* ignore */
    }

    // Live update open view streams by overlaying updated props.
    try {
      const bus = ViewStreamBus.getInstance();
      const at = new Date().toISOString();
      await bus.publish(viewId, {
        type: 'state',
        data: { viewId, at, patch: [{ path: `_props.${nodeId}`, value: updated.props }] },
      });
    } catch {
      /* best-effort */
    }

    return sendSuccess(res, updated);
  } catch (error) {
    return handleError(error, res, 'update view widget');
  }
});

/**
 * PATCH /api/v1/views/:id/root
 * Apply JSON Patch ops to the persisted structure-only view root.
 *
 * Note: this endpoint only mutates structure (node ids + children arrays).
 * Widget content lives in view_widgets and is edited separately.
 */
router.patch('/views/:id/root', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const viewId = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!viewId) return;

  const body = validateData(PatchViewRootSchema, req.body, res, 'validate view root patch body');
  if (!body) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();
    const view = await viewRepo.findById(viewId);
    if (!view) return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    if (!(await verifyStarshipAccess(view.starshipId, userId, res))) return;

    const persistedRoot = await viewRepo.getPersistedRootById(viewId);
    if (!persistedRoot || typeof persistedRoot !== 'object') {
      return sendError(res, 'VALIDATION_ERROR', 'Persisted view root is missing', 400);
    }

    // Apply RFC6902 patch to the persisted root
    const patched = applyPatch(structuredClone(persistedRoot), body.patch as unknown as ViewPatchOp[], true, false).newDocument;

    const updatedView = await viewRepo.updateStructureRoot(viewId, patched);

    // (Optional) live update open streams by publishing a patch_root event.
    // For now, we rely on structure changes being reflected on refresh/reconnect.
    return sendSuccess(res, updatedView);
  } catch (error) {
    return handleError(error, res, 'patch view root');
  }
});

/**
 * POST /api/v1/views/:id/queries/:queryId/run
 * Execute a view query on the server (v1: connector_action only).
 */
router.post('/views/:id/queries/:queryId/run', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const viewId = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!viewId) return;
  const queryId = validateData(z.string().min(1).max(200), req.params.queryId, res, 'validate queryId');
  if (!queryId) return;
  const body = validateData(RunViewQueryBodySchema, req.body, res, 'validate run query body');
  if (!body) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();
    const view = await viewRepo.findById(viewId);
    if (!view) return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    if (!(await verifyStarshipAccess(view.starshipId, userId, res))) return;

    const rcUnknown = isRecord(view) ? (view as Record<string, unknown>).runtimeConfig : undefined;
    const rc: ViewRuntimeConfig | null = isRecord(rcUnknown) ? (rcUnknown as unknown as ViewRuntimeConfig) : null;
    const queriesUnknown = rc && isRecord(rc.queries) ? (rc.queries as unknown as Record<string, unknown>) : {};
    const specUnknown = queriesUnknown[queryId];
    if (!isRecord(specUnknown)) return sendError(res, 'RESOURCE_NOT_FOUND', 'Query not found', 404, { queryId });
    const kind = typeof specUnknown.kind === 'string' ? specUnknown.kind : '';
    if (kind !== 'connector_action') {
      return sendError(res, 'VALIDATION_ERROR', 'Only connector_action queries are server-executable', 400, { kind });
    }

    // View-level permission enforcement: optional connector allowlist.
    const allowedConnectors =
      rc && rc.permissions && Array.isArray((rc.permissions as { connectors?: unknown }).connectors)
        ? ((rc.permissions as { connectors: unknown[] }).connectors.map(String) as string[])
        : null;

    const connector = typeof specUnknown.connector === 'string' ? specUnknown.connector.trim() : '';
    const action = typeof specUnknown.action === 'string' ? specUnknown.action.trim() : '';
    if (!connector || !action) {
      return sendError(res, 'VALIDATION_ERROR', 'connector and action are required for connector_action queries', 400);
    }
    if (allowedConnectors && allowedConnectors.length > 0 && !allowedConnectors.includes(connector)) {
      return sendError(res, 'ACCESS_DENIED', 'Connector not permitted for this view', 403, { connector });
    }

    const state = isRecord(body.state) ? (body.state as Record<string, unknown>) : {};
    const argsTemplate = isRecord(specUnknown.argsTemplate) ? (specUnknown.argsTemplate as Record<string, unknown>) : {};
    const args = (templateDeep(argsTemplate, state) as Record<string, unknown>) ?? {};

    const env = getEnvConfig();
    const runtimeEnv: Record<string, unknown> = {
      STARSHIP_ID: view.starshipId,
      VIEW_ID: viewId,
      SERVER_URL: env.SERVER_URL,
    };

    // Connector actions execute server-side via the in-process executor (no runner needed).
    const envelope = await connectorActionExecutor.execute({
      connector,
      action,
      args,
      starshipId: view.starshipId,
      authUserId: userId,
      runtimeEnv,
    });

    return sendSuccess(res, envelope.body);
  } catch (error) {
    return handleError(error, res, 'run view query');
  }
});

/**
 * GET /api/v1/views/:id/stream
 *
 * Streams view runtime events over SSE (Redis Streams).
 */
router.get('/views/:id/stream', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const idValidated = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!idValidated) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();
    const view = await viewRepo.findById(idValidated);
    if (!view) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    }
    if (!(await verifyStarshipAccess(view.starshipId, userId, res))) return;

    const wantsStreaming = req.get('Accept')?.includes('text/event-stream') || req.query.stream === 'true';
    if (!wantsStreaming) {
      return sendError(res, 'VALIDATION_ERROR', 'Streaming required (set Accept: text/event-stream or ?stream=true)', 400);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    try {
      res.socket?.setNoDelay(true);
    } catch {
      /* ignore */
    }
    try {
      const maybe = res as unknown as { flushHeaders?: () => void };
      if (typeof maybe.flushHeaders === 'function') maybe.flushHeaders();
    } catch {
      /* ignore */
    }
    try {
      res.write(':ok\n\n');
    } catch {
      /* ignore */
    }

    const bus = ViewStreamBus.getInstance();
    const redisReader = bus.createReaderClient();
    try {
      await redisReader.connect();
    } catch {
      /* best-effort */
    }

    let closed = false;
    res.on('close', () => {
      closed = true;
      try {
        redisReader.disconnect();
      } catch {
        /* ignore */
      }
    });

    const qpCursorRaw = typeof req.query.cursor === 'string' ? String(req.query.cursor) : '';
    const qpCursor = qpCursorRaw && qpCursorRaw.trim() ? qpCursorRaw.trim() : '';
    const lastEventIdHeaderRaw = typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : undefined;
    const lastEventIdHeader = lastEventIdHeaderRaw && lastEventIdHeaderRaw.trim() ? lastEventIdHeaderRaw.trim() : undefined;

    let lastId: string | null = null;
    try {
      lastId = await bus.getLastId(idValidated);
    } catch {
      /* ignore */
    }

    const snapshotCursor: string = lastId || qpCursor || lastEventIdHeader || '0-0';
    let cursor: string = snapshotCursor;

    const at = new Date().toISOString();
    res.write(`id: ${snapshotCursor}\n`);
    res.write(`event: snapshot\n`);
    res.write(
      `data: ${JSON.stringify({
        viewId: idValidated,
        at,
        root: (view as any).root,
        state: {},
      })}\n\n`
    );

    while (!closed && !res.writableEnded && !res.destroyed) {
      const batch = await bus.read(idValidated, cursor, { blockMs: 25_000, count: 200 }, redisReader);
      if (!batch || batch.length === 0) continue;
      for (const item of batch) {
        cursor = item.id;
        try {
          res.write(`id: ${item.id}\n`);
          res.write(`event: ${item.evt.type}\n`);
          res.write(`data: ${JSON.stringify(item.evt.data)}\n\n`);
        } catch {
          closed = true;
          break;
        }
      }
    }
  } catch (error) {
    return handleError(error, res, 'stream view');
  }
});

/**
 * POST /api/v1/views
 * Create a new view
 */
router.post('/views', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const validated = validateData(CreateViewSchema, req.body, res, 'validate view creation data');
  if (!validated) return;

  const userId = req.user!.id;
  if (!(await verifyStarshipAccess(validated.starshipId, userId, res))) return;

  try {
    const viewRepo = new ViewRepository();
    const view = await viewRepo.create({
      ...validated,
      root: (validated as any).root,
      runtimeConfig: (validated as any).runtimeConfig,
    } as any);
    return sendSuccess(res, view, 201);
  } catch (error) {
    return handleError(error, res, 'create view');
  }
});

/**
 * PUT /api/v1/views/:id
 * Update an existing view
 */
router.put('/views/:id', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const idValidated = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!idValidated) return;

  const dataValidated = validateData(UpdateViewSchema, req.body, res, 'validate view update data');
  if (!dataValidated) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();
    const existing = await viewRepo.findById(idValidated);
    if (!existing) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    }

    if (!(await verifyStarshipAccess(existing.starshipId, userId, res))) return;

    const view = await viewRepo.update(
      idValidated,
      {
        ...dataValidated,
        root: (dataValidated as any).root,
        runtimeConfig: (dataValidated as any).runtimeConfig,
      } as any
    );
    return sendSuccess(res, view);
  } catch (error) {
    return handleError(error, res, 'update view');
  }
});

/**
 * DELETE /api/v1/views/:id
 * Delete a view
 */
router.delete('/views/:id', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const idValidated = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!idValidated) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();
    const existing = await viewRepo.findById(idValidated);

    if (!existing) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    }

    if (!(await verifyStarshipAccess(existing.starshipId, userId, res))) return;

    const deleted = await viewRepo.delete(idValidated);
    if (!deleted) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    }

    return sendSuccess(res, { success: true });
  } catch (error) {
    return handleError(error, res, 'delete view');
  }
});

/**
 * POST /api/v1/views/:id/actions
 * Runtime → server action requests (e.g. run workflow).
 */
router.post('/views/:id/actions', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const viewId = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!viewId) return;

  const body = validateData(ViewRuntimeActionRequestSchema, req.body, res, 'validate view action body');
  if (!body) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();

    const view = await viewRepo.findById(viewId);
    if (!view) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    }

    if (!(await verifyStarshipAccess(view.starshipId, userId, res))) return;

    const bus = ViewStreamBus.getInstance();
    const at = new Date().toISOString();

    // Basic permission enforcement (view-level allowlist).
    const allowedWorkflows = Array.isArray((view as any)?.runtimeConfig?.permissions?.workflows)
      ? ((view as any).runtimeConfig.permissions.workflows as string[]).map(String)
      : null;

    if (body.type === 'set_state') {
      await bus.publish(viewId, {
        type: 'state',
        data: { viewId, at, patch: [{ path: body.path, value: body.value }] },
      });
      return sendSuccess(res, { ok: true });
    }

    if (body.type === 'patch_props') {
      await bus.publish(viewId, {
        type: 'state',
        data: { viewId, at, patch: [{ path: `_props.${String(body.instanceId)}`, value: body.patch }] },
      });
      return sendSuccess(res, { ok: true });
    }

    if (body.type === 'patch_root') {
      await bus.publish(viewId, {
        type: 'patch',
        data: { viewId, at, patch: body.patch as any },
      });
      return sendSuccess(res, { ok: true });
    }

    if (body.type === 'run_workflow') {
      const workflowSlug = String(body.workflowSlug || '').trim();
      if (!workflowSlug) {
        return sendError(res, 'VALIDATION_ERROR', 'workflowSlug is required', 400);
      }
      if (allowedWorkflows && allowedWorkflows.length > 0 && !allowedWorkflows.includes(workflowSlug)) {
        return sendError(res, 'ACCESS_DENIED', 'Workflow not permitted for this view', 403, { workflowSlug });
      }

      const toolRepo = new ToolRepository();
      const tool = await toolRepo.findBySlugAndStarship(workflowSlug, view.starshipId);
      if (!tool || tool.status === 'draft') {
        return sendError(res, 'RESOURCE_NOT_FOUND', 'Workflow tool not found or not executable', 404, { workflowSlug });
      }

      const runtimeEnv: Record<string, unknown> = {
        STARSHIP_ID: view.starshipId,
        VIEW_ID: viewId,
      };
      const { engineConfig } = await buildAutopilotExecutionBundle({
        starshipId: view.starshipId,
        authUserId: userId,
        runtimeEnv,
      });

      // Stream autopilot ui_action events into the view stream.
      const eventCallback = async (evt: unknown): Promise<void> => {
        try {
          if (!evt || typeof evt !== 'object') return;
          if (!('type' in evt) || !('data' in evt)) return;
          const t = (evt as any).type;
          if (t !== 'ui_action') return;
          const d = (evt as any).data;
          const action = typeof d?.action === 'string' ? d.action.trim() : '';
          const payload = d?.payload && typeof d.payload === 'object' && !Array.isArray(d.payload) ? (d.payload as Record<string, unknown>) : {};
          const atEvt = new Date().toISOString();

          if (action === 'runtime.set_state') {
            const path = typeof payload.path === 'string' ? payload.path : '';
            if (!path) return;
            await bus.publish(viewId, { type: 'state', data: { viewId, at: atEvt, patch: [{ path, value: payload.value }] } });
            return;
          }

          if (action === 'view.patch_props') {
            const instanceId = typeof payload.instanceId === 'string' ? payload.instanceId : '';
            const patch = payload.patch && typeof payload.patch === 'object' && !Array.isArray(payload.patch) ? (payload.patch as Record<string, unknown>) : null;
            if (!instanceId || !patch) return;
            await bus.publish(viewId, {
              type: 'state',
              data: { viewId, at: atEvt, patch: [{ path: `_props.${instanceId}`, value: patch }] },
            });
            return;
          }

          if (action === 'view.patch_root') {
            const patch = Array.isArray(payload.patch) ? payload.patch : null;
            if (!patch) return;
            await bus.publish(viewId, { type: 'patch', data: { viewId, at: atEvt, patch: patch as any } });
            return;
          }

          if (action === 'toast') {
            const message = typeof payload.message === 'string' ? payload.message : '';
            if (!message) return;
            const level = typeof payload.level === 'string' ? payload.level : undefined;
            await bus.publish(viewId, { type: 'toast', data: { viewId, at: atEvt, message, ...(level ? { level: level as any } : null) } });
            return;
          }
        } catch {
          /* ignore */
        }
      };

      await bus.publish(viewId, { type: 'toast', data: { viewId, at, level: 'info', message: `Running workflow: ${workflowSlug}` } });

      const result = await executeToolBlueprint({
        blueprint: tool.blueprint,
        toolConfig: (tool.configuration || {}) as Record<string, unknown>,
        toolArgs: (body.args || {}) as Record<string, unknown>,
        runnerConfig: engineConfig,
        eventCallback,
      });

      await bus.publish(viewId, { type: 'toast', data: { viewId, at: new Date().toISOString(), level: 'success', message: `Workflow completed: ${workflowSlug}` } });
      return sendSuccess(res, { ok: true, result });
    }

    return sendError(res, 'VALIDATION_ERROR', 'Unsupported action type', 400);
  } catch (error) {
    return handleError(error, res, 'run view action');
  }
});

export default router;

