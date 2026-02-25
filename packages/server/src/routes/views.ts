import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, SlugSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { ViewRepository, WidgetRepository } from '@starships/models';
import { sendError, sendSuccess, handleError } from '../utils/responseHelpers';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';

const router: Router = Router();

const emptyStringToUndefined = (v: unknown) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v);

const ViewGridItemSchema = z.object({
  id: IdSchema.optional(),
  widgetId: IdSchema,
  col: z.coerce.number().int().min(0),
  row: z.coerce.number().int().min(0),
  colSpan: z.coerce.number().int().min(1).max(12).optional(),
  rowSpan: z.coerce.number().int().min(1).max(200).optional(),
});

const ViewLayoutSchema = z
  .object({
    cols: z.coerce.number().int().min(1).max(12),
    items: z.array(ViewGridItemSchema).default([]),
  })
  .superRefine((layout, ctx) => {
    // Keep items within column bounds and with non-negative spans.
    for (let i = 0; i < layout.items.length; i++) {
      const it = layout.items[i];
      if (it.col >= layout.cols) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Item col must be < cols (${layout.cols})`,
          path: ['items', i, 'col'],
        });
      }
      const colSpan = it.colSpan ?? 1;
      if (it.col + colSpan > layout.cols) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Item col + colSpan must be <= cols (${layout.cols})`,
          path: ['items', i, 'colSpan'],
        });
      }
    }
  });

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
  layout: ViewLayoutSchema.optional(),
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
  layout: ViewLayoutSchema.optional(),
});

const AttachWidgetToViewSchema = z.object({
  widgetId: IdSchema,
  col: z.coerce.number().int().min(0).optional(),
  row: z.coerce.number().int().min(0).optional(),
  colSpan: z.coerce.number().int().min(1).max(12).optional(),
  rowSpan: z.coerce.number().int().min(1).max(200).optional(),
});

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
    const view = await viewRepo.create(validated);
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

    const view = await viewRepo.update(idValidated, dataValidated);
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
 * POST /api/v1/views/:id/widgets
 * Attach a widget to a view (idempotent by widgetId).
 */
router.post('/views/:id/widgets', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const viewId = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!viewId) return;

  const body = validateData(AttachWidgetToViewSchema, req.body, res, 'validate attach widget body');
  if (!body) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();
    const widgetRepo = new WidgetRepository();

    const view = await viewRepo.findById(viewId);
    if (!view) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    }

    if (!(await verifyStarshipAccess(view.starshipId, userId, res))) return;

    const widget = await widgetRepo.findById(body.widgetId);
    if (!widget) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'Widget not found', 404);
    }
    if (String(widget.starshipId) !== String(view.starshipId)) {
      return sendError(res, 'VALIDATION_ERROR', 'Widget must belong to the same starship as the view', 400, {
        widgetId: body.widgetId,
        widgetStarshipId: widget.starshipId,
        viewStarshipId: view.starshipId,
      });
    }

    const layout = view.layout ?? { cols: 3, items: [] };
    const existingItems = Array.isArray(layout.items) ? layout.items : [];

    // Idempotent attach: if already present, return the view unchanged.
    if (existingItems.some((it) => String(it.widgetId) === String(body.widgetId))) {
      return sendSuccess(res, view);
    }

    const maxRow = existingItems.reduce((m, it) => Math.max(m, Number(it.row ?? 0)), 0);
    const col = body.col ?? 0;
    const row = body.row ?? (existingItems.length ? maxRow + 1 : 0);
    const colSpan = body.colSpan ?? 1;
    const rowSpan = body.rowSpan;

    if (col >= layout.cols) {
      return sendError(res, 'VALIDATION_ERROR', `col must be < cols (${layout.cols})`, 400, { col, cols: layout.cols });
    }
    if (col + colSpan > layout.cols) {
      return sendError(res, 'VALIDATION_ERROR', `col + colSpan must be <= cols (${layout.cols})`, 400, {
        col,
        colSpan,
        cols: layout.cols,
      });
    }

    const nextItems = [
      ...existingItems,
      {
        widgetId: String(body.widgetId),
        col,
        row,
        ...(body.colSpan !== undefined ? { colSpan: body.colSpan } : null),
        ...(rowSpan !== undefined ? { rowSpan } : null),
      },
    ];

    const updated = await viewRepo.update(viewId, { layout: { cols: layout.cols, items: nextItems } });
    return sendSuccess(res, updated);
  } catch (error) {
    return handleError(error, res, 'attach widget to view');
  }
});

/**
 * DELETE /api/v1/views/:id/widgets/:widgetId
 * Detach a widget from a view (removes all occurrences by widgetId).
 */
router.delete('/views/:id/widgets/:widgetId', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const viewId = validateData(IdSchema, req.params.id, res, 'validate view ID');
  if (!viewId) return;
  const widgetId = validateData(IdSchema, req.params.widgetId, res, 'validate widget ID');
  if (!widgetId) return;

  try {
    const userId = req.user!.id;
    const viewRepo = new ViewRepository();
    const view = await viewRepo.findById(viewId);

    if (!view) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'View not found', 404);
    }

    if (!(await verifyStarshipAccess(view.starshipId, userId, res))) return;

    const layout = view.layout ?? { cols: 3, items: [] };
    const existingItems = Array.isArray(layout.items) ? layout.items : [];
    const nextItems = existingItems.filter((it) => String(it.widgetId) !== String(widgetId));

    // Idempotent detach: if nothing changed, return the view unchanged.
    if (nextItems.length === existingItems.length) {
      return sendSuccess(res, view);
    }

    const updated = await viewRepo.update(viewId, { layout: { cols: layout.cols, items: nextItems } });
    return sendSuccess(res, updated);
  } catch (error) {
    return handleError(error, res, 'detach widget from view');
  }
});

export default router;

