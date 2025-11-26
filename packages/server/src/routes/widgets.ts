import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, SlugSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { WidgetRepository } from '@starships/models';
import { sendError, sendSuccess, handleError } from '../utils/responseHelpers';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';

const router: Router = Router();

// Zod schemas for validation
const CreateWidgetSchema = z.object({
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
  description: z
    .string()
    .min(0)
    .max(1000, 'Description must be less than 1000 characters')
    .refine(noXSS, { message: XSS_ERROR_MESSAGE }),
  widgetType: z
    .string()
    .min(1, 'Widget type is required')
    .max(100, 'Widget type must be less than 100 characters')
    .refine(noXSS, { message: XSS_ERROR_MESSAGE }),
  props: z.record(z.string(), z.unknown()), // Component props with values (required)
  starshipId: IdSchema,
});

const UpdateWidgetSchema = z.object({
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
  props: z.record(z.string(), z.unknown()).optional(), // Props to merge
});

/**
 * GET /api/v1/starships/:starshipId/widgets
 * List all widgets for a starship
 */
router.get('/starships/:starshipId/widgets', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { starshipId } = req.params;
    const userId = req.user!.id;

    // Verify access
    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const widgetRepo = new WidgetRepository();
    const widgets = await widgetRepo.findByStarshipId(starshipId);

    return sendSuccess(res, widgets);
  } catch (error) {
    return handleError(error, res, 'fetch widgets');
  }
});

/**
 * GET /api/v1/widgets/:id
 * Get widget by ID
 */
router.get('/widgets/:id', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const validated = validateData(IdSchema, req.params.id, res, 'validate widget ID');
  if (!validated) return;

  try {
    const widgetRepo = new WidgetRepository();
    const widget = await widgetRepo.findById(validated);

    if (!widget) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'Widget not found', 404);
    }

    return sendSuccess(res, widget);
  } catch (error) {
    return handleError(error, res, 'fetch widget');
  }
});

/**
 * GET /api/v1/widgets/slug/:slug
 * Get widget by slug (requires starshipId query param)
 */
router.get('/widgets/slug/:slug', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const slugValidated = validateData(SlugSchema, req.params.slug, res, 'validate slug');
  if (!slugValidated) return;

  const { starshipId } = req.query;
  if (!starshipId || typeof starshipId !== 'string') {
    return sendError(res, 'VALIDATION_ERROR', 'starshipId query parameter is required', 400);
  }

  try {
    const widgetRepo = new WidgetRepository();
    const widget = await widgetRepo.findBySlug(slugValidated, starshipId);

    if (!widget) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'Widget not found', 404);
    }

    return sendSuccess(res, widget);
  } catch (error) {
    return handleError(error, res, 'fetch widget by slug');
  }
});

/**
 * POST /api/v1/widgets
 * Create a new widget
 */
router.post('/widgets', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const validated = validateData(CreateWidgetSchema, req.body, res, 'validate widget creation data');
  if (!validated) return;

  const userId = req.user!.id;

  // Verify access to starship
  if (!(await verifyStarshipAccess(validated.starshipId, userId, res))) return;

  try {
    const widgetRepo = new WidgetRepository();
    const widget = await widgetRepo.create(validated);

    return sendSuccess(res, widget, 201);
  } catch (error) {
    return handleError(error, res, 'create widget');
  }
});

/**
 * PUT /api/v1/widgets/:id
 * Update an existing widget
 */
router.put('/widgets/:id', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const idValidated = validateData(IdSchema, req.params.id, res, 'validate widget ID');
  if (!idValidated) return;

  const dataValidated = validateData(UpdateWidgetSchema, req.body, res, 'validate widget update data');
  if (!dataValidated) return;

  try {
    const widgetRepo = new WidgetRepository();
    const widget = await widgetRepo.update(idValidated, dataValidated);

    return sendSuccess(res, widget);
  } catch (error) {
    return handleError(error, res, 'update widget');
  }
});

/**
 * DELETE /api/v1/widgets/:id
 * Delete a widget
 */
router.delete('/widgets/:id', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const validated = validateData(IdSchema, req.params.id, res, 'validate widget ID');
  if (!validated) return;

  try {
    const widgetRepo = new WidgetRepository();
    const deleted = await widgetRepo.delete(validated);

    if (!deleted) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'Widget not found', 404);
    }

    return sendSuccess(res, { success: true });
  } catch (error) {
    return handleError(error, res, 'delete widget');
  }
});

export default router;
