import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { SetupService } from '@/services/SetupService';
import { handleError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { EmailSchema, PasswordSchema } from '@/schemas/common';
import { rateLimiters } from '@/middleware/rateLimiter';

const router: Router = Router();

const SetupInitSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: z.string().trim().optional(),
});

// GET /setup/status — is first-time setup still required?
router.get('/setup/status', rateLimiters.public, async (req: Request, res: Response): Promise<void> => {
  try {
    const service = new SetupService();
    const result = await service.getStatus();
    sendSuccess(res, result);
  } catch (error) {
    handleError(error, res, 'get setup status');
  }
});

// POST /setup/init — create the first admin user (locked after first admin exists)
router.post('/setup/init', rateLimiters.auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = validateData(SetupInitSchema, req.body, res, 'setup initialization data');
    if (!body) return;

    const service = new SetupService();
    const result = await service.initializeInstance(body);
    sendSuccess(res, result, 201);
  } catch (error) {
    handleError(error, res, 'instance setup initialization');
  }
});

export default router;
