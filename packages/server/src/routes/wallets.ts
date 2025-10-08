import { Router } from 'express';
import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { StarshipService } from '@/services/StarshipService';
import { WalletService } from '@/services/WalletService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';

const router: Router = Router();

// Validation schemas
const IdSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');

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
 * GET /wallets/:starshipId
 * Returns wallet for a starship (camelCase fields)
 */
router.get('/wallets/:starshipId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const { starshipId } = paramValidation;
    const userId = req.user?.id || '';

    // Authorization: ensure user owns the starship
    const starshipService = new StarshipService();
    const hasAccess = await starshipService.hasAccess(userId, starshipId);
    if (!hasAccess) {
      sendError(res, 'FORBIDDEN', 'Access denied to this starship', 403);
      return;
    }

    // Fetch wallet
    const walletService = new WalletService();
    const wallet = await walletService.getByStarshipId(starshipId);
    if (!wallet) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Wallet not found', 404, { starshipId });
      return;
    }

    // Return wallet model directly (ApiResponse<WalletModel>)
    sendSuccess(res, wallet, 200);
  } catch (error) {
    handleError(error, res, 'fetching wallet');
  }
});

export default router;
