import { Router } from 'express';
import type { Request, Response } from 'express';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { sendSuccess, sendError, handleCommonError, validateUUID } from '@/utils/responseHelpers';
import getStore from '@/store';

const router: Router = Router();

// POST /memory/reset - Clear memory for agent and user (OpenAPI pattern)
router.post(
  '/memory/reset',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { agentId } = req.body;

      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      // Validate required fields
      if (!agentId || typeof agentId !== 'string') {
        sendError(res, 'MISSING_REQUIRED_FIELD', 'agentId is required and must be a string', 400, {
          field: 'agentId',
          provided: typeof agentId,
        });
        return;
      }

      // Validate agentId format
      const { isValid, error } = validateUUID(agentId, 'agentId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }

      const store = getStore();
      const key = store.makeKey(agentId, userId);
      await store.clear(key);

      sendSuccess(res, { message: 'Memory cleared successfully' }, 200);
    } catch (error) {
      if (!handleCommonError(error, res, 'clearing memory')) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to clear memory');
      }
    }
  }
);

export default router;
