import { Router } from 'express';
import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { UsageService } from '@/services/UsageService';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '@/utils/responseHelpers';

const router: Router = Router();

const NanoidSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');

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
 * GET /users/:userId/usage/totals
 * Returns aggregate usage totals across all owned starships for a user
 */
router.get('/users/:userId/usage/totals', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ userId: NanoidSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;
    const { userId } = paramValidation;

    // Authorization: Users can only view their own usage
    if (req.user?.id !== userId) {
      sendError(res, 'ACCESS_DENIED', 'You can only access your own usage', 403);
      return;
    }

    const usageService = new UsageService();
    const totals = await usageService.getTotalsByUser(userId);

    sendSuccess(res, totals, 200);
  } catch (error) {
    handleError(error, res, 'fetching user usage totals');
  }
});

/**
 * GET /users/:userId/usage
 * Returns paginated usage records for a user across all owned starships
 * Supports filters: by day (YYYY-MM-DD) and by model, and sort order
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

router.get('/users/:userId/usage', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ userId: NanoidSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;
    const { userId } = paramValidation;

    // Authorization: Users can only view their own usage
    if (req.user?.id !== userId) {
      sendError(res, 'ACCESS_DENIED', 'You can only access your own usage', 403);
      return;
    }

    const queryValidation = validateData(UsageListQuerySchema, req.query, res, 'pagination/filter parameters');
    if (!queryValidation) return;

    const { page, limit, day, model, order } = queryValidation;

    const usageService = new UsageService();

    // Get total count for pagination
    const total = await usageService.countByUser(userId, { day, model });

    // Page to offset conversion
    const offset = (page - 1) * limit;

    // Fetch page of records
    const data = await usageService.listByUser(userId, {
      limit,
      offset,
      day,
      model,
      order: order ?? 'DESC',
    });

    const meta = createPaginationMeta(page, limit, total);
    sendSuccess(res, data, 200, meta);
  } catch (error) {
    handleError(error, res, 'fetching user usage list');
  }
});

/**
 * GET /users/:userId/usage/daily
 * Returns daily aggregated usage for a user (paginated)
 */
const DailyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  order: z.enum(['ASC', 'DESC']).optional(),
});

router.get('/users/:userId/usage/daily', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ userId: NanoidSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;
    const { userId } = paramValidation;

    // Authorization: Users can only view their own usage
    if (req.user?.id !== userId) {
      sendError(res, 'ACCESS_DENIED', 'You can only access your own usage', 403);
      return;
    }

    const queryValidation = validateData(DailyListQuerySchema, req.query, res, 'pagination parameters');
    if (!queryValidation) return;
    const { page, limit, order } = queryValidation;

    const usageService = new UsageService();

    const total = await usageService.countDailyByUser(userId);
    const offset = (page - 1) * limit;

    const data = await usageService.listDailyByUser(userId, {
      limit,
      offset,
      order: order ?? 'DESC',
    });

    const meta = createPaginationMeta(page, limit, total);
    sendSuccess(res, data, 200, meta);
  } catch (error) {
    handleError(error, res, 'fetching user daily usage list');
  }
});

/**
 * GET /users/:userId/usage/daily-model
 * Returns daily+model aggregated usage for a user (paginated)
 */
router.get('/users/:userId/usage/daily-model', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ userId: NanoidSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;
    const { userId } = paramValidation;

    // Authorization: Users can only view their own usage
    if (req.user?.id !== userId) {
      sendError(res, 'ACCESS_DENIED', 'You can only access your own usage', 403);
      return;
    }

    const queryValidation = validateData(DailyListQuerySchema, req.query, res, 'pagination parameters');
    if (!queryValidation) return;
    const { page, limit, order } = queryValidation;

    const usageService = new UsageService();

    const total = await usageService.countDailyModelByUser(userId);
    const offset = (page - 1) * limit;

    const data = await usageService.listDailyModelByUser(userId, {
      limit,
      offset,
      order: order ?? 'DESC',
    });

    const meta = createPaginationMeta(page, limit, total);
    sendSuccess(res, data, 200, meta);
  } catch (error) {
    handleError(error, res, 'fetching user daily+model usage list');
  }
});

export default router;
