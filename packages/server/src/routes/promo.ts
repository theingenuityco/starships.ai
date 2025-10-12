import { Router } from 'express';
import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { PromoService } from '@/services/PromoService';

const router: Router = Router();

// Validation schemas
const IdSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');
const RedeemSchema = z.object({
  code: z.string().min(1, 'Promo code is required').max(128),
  starshipId: IdSchema,
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
 * POST /promo/redeem
 * Redeem a dashboard-managed promo code for wallet credits
 */
router.post('/promo/redeem', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id || '';
    const body = validateData(RedeemSchema, req.body, res, 'promo redeem');
    if (!body) return;

    const promoService = new PromoService();
    const result = await promoService.redeem(userId, body);

    sendSuccess(res, result, 200);
  } catch (error) {
    // Map known promo errors to standard codes
    const msg = (error as Error)?.message;
    if (msg === 'PROMO_CODE_INVALID') {
      return sendError(res, 'PROMO_CODE_INVALID', 'Promo code is invalid', 400);
    }
    if (msg === 'PROMO_CODE_EXPIRED') {
      return sendError(res, 'PROMO_CODE_EXPIRED', 'Promo code is expired or inactive', 410);
    }
    if (msg === 'PROMO_CODE_EXHAUSTED') {
      return sendError(res, 'PROMO_CODE_EXHAUSTED', 'This promo code has reached its redemption limit', 410);
    }
    if (msg === 'ALREADY_USED') {
      return sendError(res, 'RESOURCE_CONFLICT', 'You have already redeemed this promo code', 409);
    }
    if (msg === 'FORBIDDEN') {
      return sendError(res, 'FORBIDDEN', 'Access denied to this starship', 403);
    }
    if (msg === 'UNSUPPORTED_COUPON') {
      return sendError(res, 'INVALID_INPUT', "This promo can't be applied as wallet credit", 400);
    }
    handleError(error, res, 'redeeming promo');
  }
});

export default router;
