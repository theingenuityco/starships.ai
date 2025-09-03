import { Router } from "express";
import { UserService } from "../services/UserService";
import type { Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import {
  sendSuccess,
  sendError,
  handleCommonError,
  validateUUID,
} from '../utils/responseHelpers';

const router: Router = Router();

// POST /users/sync - Sync Kinde user to local database (OpenAPI pattern)
router.post("/users/sync", async (req: Request, res: Response): Promise<void> => {
  try {
    const { kindeId, email, name, avatar } = req.body;
    
    // Validate required fields
    if (!kindeId || typeof kindeId !== 'string') {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'kindeId is required and must be a string', 400, {
        field: 'kindeId',
        provided: typeof kindeId,
      });
      return;
    }
    
    if (!email || typeof email !== 'string') {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'email is required and must be a string', 400, {
        field: 'email',
        provided: typeof email,
      });
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      sendError(res, "VALIDATION_ERROR", 'Please provide a valid email address', 400, {
        field: 'email',
        constraint: 'email_format',
      });
      return;
    }
    
    const user = await UserService.syncUser({
      kindeId,
      email,
      name,
      avatar
    });
    
    sendSuccess(res, user, 201);

  } catch (error) {
    if (!handleCommonError(error, res, 'syncing user')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to sync user');
    }
  }
});

// GET /users/:id - Get user by ID (OpenAPI pattern)
router.get("/users/:id", authMiddleware, async (req: Request, res: Response): Promise<void> => {
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

// GET /users/kinde/:kindeId - Get user by Kinde ID (OpenAPI pattern)
router.get("/users/kinde/:kindeId", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { kindeId } = req.params;

    // Validate kindeId is provided and is string
    if (!kindeId || typeof kindeId !== 'string') {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'kindeId is required and must be a string', 400, {
        field: 'kindeId',
        provided: typeof kindeId,
      });
      return;
    }
    
    const user = await UserService.getUserByKindeId(kindeId);
    
    if (!user) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404, {
        resource: 'user',
        kindeId: kindeId,
      });
      return;
    }
    
    sendSuccess(res, user);

  } catch (error) {
    if (!handleCommonError(error, res, 'fetching user by Kinde ID')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch user');
    }
  }
});

export default router; 