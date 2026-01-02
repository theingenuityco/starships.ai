/**
 * Health Check Route
 *
 * Simple health check endpoint for the expedition orchestration system.
 */

import { sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { getEnvConfig } from '@starships/env';
import { sendError } from '@/utils/responseHelpers';

const router: Router = Router();
const config = getEnvConfig();

// GET /health - Simple health check endpoint
router.get('/health', (req: Request, res: Response): void => {
  sendSuccess(res, {
    status: 'ok',
  });
});

// GET /debug-sentry - DEV/TEST ONLY: intentionally throw to validate Sentry reporting.
// Security: this must not be reachable in production, otherwise it can be abused to generate
// unbounded error noise and increase Sentry/log costs.
router.get('/debug-sentry', (req: Request, res: Response): void => {
  if (config.NODE_ENV === 'production') {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Endpoint not found', 404);
    return;
  }
  throw new Error('Test Sentry error from server!');
});

export default router;
