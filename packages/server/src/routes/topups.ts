import { Router } from 'express';
import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { rateLimiters } from '@/middleware/rateLimiter';
import { StarshipService } from '@/services/StarshipService';
import { TopupService } from '@/services/TopupService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';

const router: Router = Router();

// Validation schemas
const IdSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');
const AmountSchema = z.number().positive('Amount must be positive').min(1, 'Minimum amount is $1').max(1000, 'Maximum amount is $1000');

// Helper for zod validation
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
 * POST /wallets/:starshipId/topup
 * Creates a Stripe checkout session for wallet topup
 */
router.post('/wallets/:starshipId/topup', rateLimiters.financial, jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const bodyValidation = validateData(
      z.object({
        amount_usd: AmountSchema,
        walletId: IdSchema,
      }),
      req.body,
      res,
      'topup request'
    );
    if (!bodyValidation) return;

    const { starshipId } = paramValidation;
    const { amount_usd, walletId } = bodyValidation;
    const userId = req.user?.id || '';

    // Authorization: ensure user owns the starship
    const starshipService = new StarshipService();
    const hasAccess = await starshipService.hasAccess(userId, starshipId);
    if (!hasAccess) {
      sendError(res, 'FORBIDDEN', 'Access denied to this starship', 403);
      return;
    }

    // Create topup and Stripe checkout session
    const topupService = new TopupService();
    const result = await topupService.createTopup({
      starshipId,
      amountUsd: amount_usd,
      walletId,
    });

    // Return checkout URL for frontend redirect
    sendSuccess(res, { checkoutUrl: result.checkoutUrl }, 201);
  } catch (error) {
    handleError(error, res, 'creating topup');
  }
});

export default router;
