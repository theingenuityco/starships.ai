import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { MemoryService } from '@/services/MemoryService';
import { handleError, sendError, sendSuccess, validateId } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';

const router: Router = Router();

// POST /memory/reset - Clear memory for agent and user (OpenAPI pattern)
router.post('/memory/reset', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const { agentId } = req.body;

    // Validate required fields
    if (!agentId || typeof agentId !== 'string') {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'agentId is required and must be a string', 400, {
        field: 'agentId',
        provided: typeof agentId,
      });
      return;
    }

    // Validate agentId format
    const { isValid, error } = validateId(agentId, 'agentId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    // Delegate to service layer
    const memoryService = new MemoryService();
    await memoryService.clearAgentSessionMemory(agentId, userId);

    sendSuccess(res, { message: 'Memory cleared successfully' }, 200);
  } catch (error) {
    if (!handleError(error, res, 'clearing memory')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to clear memory');
    }
  }
});

export default router;
