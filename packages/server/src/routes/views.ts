import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, SlugSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { ViewRepository } from '@starships/models';
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

export default router;

