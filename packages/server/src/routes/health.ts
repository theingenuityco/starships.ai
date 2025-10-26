/**
 * Health Check Route
 *
 * Simple health check endpoint for the expedition orchestration system.
 */

import { sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';

const router: Router = Router();

// GET /health - Simple health check endpoint
router.get('/health', (req: Request, res: Response): void => {
  sendSuccess(res, {
    status: 'ok',
  });
});

export default router;
