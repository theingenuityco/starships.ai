import { Router } from 'express';
import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { StarshipService } from '@/services/StarshipService';
import { WalletRepository, LedgerRepository } from '@starships/models';
import { handleError, sendError, sendSuccess, createPaginationMeta } from '@/utils/responseHelpers';

const router: Router = Router();

const IdSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(['ASC', 'DESC']).optional(),
});

// helper for zod validation responses consistent with other routes
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
 * GET /ledger/:walletId
 * Returns immutable ledger entries for a wallet using keyset pagination (created_at DESC, id DESC)
 */
router.get('/ledger/:walletId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ walletId: IdSchema }), req.params, res, 'wallet parameter');
    if (!params) return;

    const query = validateData(QuerySchema, req.query, res, 'query parameters');
    if (!query) return;

    const { walletId } = params;
    const { page, limit, order } = query;
    const userId = req.user?.id || '';

    // Load wallet and verify access via starship
    const walletRepo = new WalletRepository();
    const wallet = await walletRepo.findById(walletId);
    if (!wallet) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Wallet not found', 404);
      return;
    }

    const starshipService = new StarshipService();
    const hasAccess = await starshipService.hasAccess(userId, wallet.starshipId);
    if (!hasAccess) {
      sendError(res, 'FORBIDDEN', 'Access denied to this wallet', 403);
      return;
    }

  const ledgerRepo = new LedgerRepository();
  // Filter to display only TOPUP, REFUND, ADJUSTMENT types in management billing history
  const visibleTypes: Array<'TOPUP' | 'USAGE' | 'REFUND' | 'ADJUSTMENT'> = ['TOPUP', 'REFUND', 'ADJUSTMENT'];
  const total = await ledgerRepo.countByWallet(wallet.id, visibleTypes);
  const offset = (page - 1) * limit;
  let rows = await ledgerRepo.listByWalletPage(wallet.id, limit, offset, (order ?? 'DESC') as 'ASC' | 'DESC', visibleTypes);
  // Extra safety: enforce filter on the API layer as well
  rows = rows.filter((r) => (visibleTypes as unknown as string[]).includes(r.type));

    const meta = createPaginationMeta(page, limit, total);
    sendSuccess(res, rows, 200, meta);
  } catch (error) {
    handleError(error, res, 'fetching ledger entries');
  }
});

export default router;
