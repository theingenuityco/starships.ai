import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { SetupService } from '@/services/SetupService';
import { EnvSetupService } from '@/services/EnvSetupService';
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

const SetupEnvSchema = z.object({
  values: z.record(z.string(), z.string()),
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

// GET /setup/env — return all env var definitions with current state (only during setup)
router.get('/setup/env', rateLimiters.public, async (req: Request, res: Response): Promise<void> => {
  try {
    const setupService = new SetupService();
    const { setupRequired } = await setupService.getStatus();
    if (!setupRequired) {
      res.status(403).json({ error: { message: 'Setup is already complete.' } });
      return;
    }

    const envService = new EnvSetupService();
    const groups = envService.getEnvState();
    sendSuccess(res, { groups });
  } catch (error) {
    handleError(error, res, 'get setup env state');
  }
});

// POST /setup/env — write env values to .env file (only during setup)
router.post('/setup/env', rateLimiters.auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const setupService = new SetupService();
    const { setupRequired } = await setupService.getStatus();
    if (!setupRequired) {
      res.status(403).json({ error: { message: 'Setup is already complete.' } });
      return;
    }

    const body = validateData(SetupEnvSchema, req.body, res, 'env configuration data');
    if (!body) return;

    const envService = new EnvSetupService();
    const { restartRequired } = envService.writeEnvFile(body.values);
    sendSuccess(res, { ok: true, restartRequired });
  } catch (error) {
    handleError(error, res, 'write setup env');
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
