import { Router } from 'express';
import { UserService } from '../services/UserService';
import type { Request, Response } from 'express';
import { jwtAuthMiddleware } from '../middleware/jwt-auth';
import { sendSuccess, sendError, handleCommonError, validateUUID } from '../utils/responseHelpers';

const router: Router = Router();

// GET /users/:id - Get user by ID (OpenAPI pattern)
router.get('/users/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate ID format
    const { isValid, error } = validateUUID(id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const user = await UserService.getUserById(id);

    if (!user) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404, {
        resource: 'user',
        id: id,
      });
      return;
    }

    sendSuccess(res, user);
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching user')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch user');
    }
  }
});

export default router;
