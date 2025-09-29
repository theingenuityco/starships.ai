import { Router } from 'express';
import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { UsageService } from '@/services/UsageService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';

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

export default router;
