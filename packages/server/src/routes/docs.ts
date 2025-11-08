import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';

const router: Router = Router();

// ----------------------------------------------------------------------------
// Zod schemas
// ----------------------------------------------------------------------------

const DocsQuerySchema = z
  .object({
    query: z.string().optional(),
  })
  .strict();

// ----------------------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------------------

router.get('/docs', (req: Request, res: Response): void => {
  const data = validateData(DocsQuerySchema, req.query, res, 'docs query');
  if (!data) return;
  try {
    sendSuccess(res, { query: data.query ?? '' });
  } catch (error) {
    console.error('[DOCS] Error handling docs route:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to handle docs request', 500);
  }
});

export default router;
