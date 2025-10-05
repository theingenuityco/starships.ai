import { Router } from 'express';
import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { UsageService } from '@/services/UsageService';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '@/utils/responseHelpers';

const router: Router = Router();

const NanoidSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');

/**
 * Query schemas for starship usage endpoints
 */
const UsageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'day must be in YYYY-MM-DD format')
    .optional(),
  model: z.string().min(1).max(255).optional(),
  order: z.enum(['ASC', 'DESC']).optional(),
});

const DailyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  order: z.enum(['ASC', 'DESC']).optional(),
});

function validateData<T>(schema: z.ZodSchema<T>, data: unknown, res: Response, context: string): T | null {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      const fieldName = firstError.path.join('.');

      sendError(res, 'VALIDATION_ERROR', firstError.message, 400, {
        field: fieldName,
        context,
        validationErrors: error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', `${context} validation error`, 500);
    }
    return null;
  }
}

/**
 * GET /conversations/:conversationId/usage/totals
 * Returns aggregate usage totals for a conversation
 */
router.get('/conversations/:conversationId/usage/totals', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ conversationId: NanoidSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;
    const { conversationId } = paramValidation;

    const usageService = new UsageService();
    const totals = await usageService.getTotalsByConversation(conversationId);

    sendSuccess(res, totals, 200);
  } catch (error) {
    handleError(error, res, 'fetching conversation usage totals');
  }
});

/**
 * GET /starships/:starshipId/usage/totals
 * Returns aggregate usage totals for a starship
 */
router.get('/starships/:starshipId/usage/totals', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ starshipId: NanoidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;
    const { starshipId } = paramValidation;

    const usageService = new UsageService();
    const totals = await usageService.getTotalsByStarship(starshipId);

    sendSuccess(res, totals, 200);
  } catch (error) {
    handleError(error, res, 'fetching starship usage totals');
  }
});

/**
 * GET /starships/:starshipId/usage/totals-with-count
 * Returns aggregate usage totals for a starship including request count
 */
router.get('/starships/:starshipId/usage/totals-with-count', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ starshipId: NanoidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;
    const { starshipId } = paramValidation;

    const usageService = new UsageService();
    const totalsWithCount = await usageService.getTotalsByStarshipWithCount(starshipId);

    sendSuccess(res, totalsWithCount, 200);
  } catch (error) {
    handleError(error, res, 'fetching starship usage totals with count');
  }
});

/**
 * GET /starships/:starshipId/usage
 * Returns paginated usage records for a starship
 * Supports filters: by day (YYYY-MM-DD) and by model, and sort order
 */
router.get('/starships/:starshipId/usage', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ starshipId: NanoidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;
    const { starshipId } = paramValidation;

    const queryValidation = validateData(UsageListQuerySchema, req.query, res, 'pagination/filter parameters');
    if (!queryValidation) return;

    const { page, limit, day, model, order } = queryValidation;

    const usageService = new UsageService();

    // Get total count for pagination
    const total = await usageService.countByStarship(starshipId, { day, model });

    // Page to offset conversion
    const offset = (page - 1) * limit;

    // Fetch page of records
    const data = await usageService.listByStarship(starshipId, {
      limit,
      offset,
      day,
      model,
      order: order ?? 'DESC',
    });

    const meta = createPaginationMeta(page, limit, total);
    sendSuccess(res, data, 200, meta);
  } catch (error) {
    handleError(error, res, 'fetching starship usage list');
  }
});

/**
 * GET /starships/:starshipId/usage/daily
 * Returns daily aggregated usage for a starship (paginated)
 */
router.get('/starships/:starshipId/usage/daily', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ starshipId: NanoidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;
    const { starshipId } = paramValidation;

    const queryValidation = validateData(DailyListQuerySchema, req.query, res, 'pagination parameters');
    if (!queryValidation) return;
    const { page, limit, order } = queryValidation;

    const usageService = new UsageService();

    const total = await usageService.countDailyByStarship(starshipId);
    const offset = (page - 1) * limit;

    const data = await usageService.listDailyByStarship(starshipId, {
      limit,
      offset,
      order: order ?? 'DESC',
    });

    const meta = createPaginationMeta(page, limit, total);
    sendSuccess(res, data, 200, meta);
  } catch (error) {
    handleError(error, res, 'fetching starship daily usage list');
  }
});

/**
 * GET /starships/:starshipId/usage/daily-model
 * Returns daily+model aggregated usage for a starship (paginated)
 */
router.get('/starships/:starshipId/usage/daily-model', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ starshipId: NanoidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;
    const { starshipId } = paramValidation;

    const queryValidation = validateData(DailyListQuerySchema, req.query, res, 'pagination parameters');
    if (!queryValidation) return;
    const { page, limit, order } = queryValidation;

    const usageService = new UsageService();

    const total = await usageService.countDailyModelByStarship(starshipId);
    const offset = (page - 1) * limit;

    const data = await usageService.listDailyModelByStarship(starshipId, {
      limit,
      offset,
      order: order ?? 'DESC',
    });

    const meta = createPaginationMeta(page, limit, total);
    sendSuccess(res, data, 200, meta);
  } catch (error) {
    handleError(error, res, 'fetching starship daily+model usage list');
  }
});

export default router;
