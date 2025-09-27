/**
 * Environment variable management routes
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { EnvironmentService } from '@/services/EnvironmentService';
import { StarshipService } from '@/services/StarshipService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';

const router: Router = Router();

// Validation schemas
const IdSchema = z.string().regex(/^[a-z0-9]{10,30}$/i, 'Invalid ID format');
const EnvironmentKeySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Environment key must be uppercase letters, numbers, and underscores only');

const CreateEnvironmentVariableSchema = z.object({
  key: EnvironmentKeySchema,
  value: z.string().min(1, 'Value is required').max(10000, 'Value too large'),
  description: z.string().max(500, 'Description too long').optional(),
});

const UpdateEnvironmentVariableSchema = z.object({
  value: z.string().min(1).max(10000).optional(),
  description: z.string().max(500).optional(),
});

// Helper function for validation
const validateData = <T>(schema: z.ZodSchema<T>, data: unknown, res: Response, context: string): T | null => {
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
};

// Helper to verify starship ownership
const verifyStarshipAccess = async (starshipId: string, userId: string, res: Response): Promise<boolean> => {
  const starshipService = new StarshipService();
  const starship = await starshipService.getStarship(starshipId);

  if (!starship) {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
      resource: 'starship',
      id: starshipId,
    });
    return false;
  }

  if (starship.ownerId !== userId) {
    sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
    return false;
  }

  return true;
};

// GET /starships/:id/environment - List environment variables
router.get('/starships/:id/environment', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Verify access
    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const environmentService = new EnvironmentService();
    const variables = await environmentService.getEnvironmentVariables(starshipId);

    sendSuccess(res, { starshipId, variables });
  } catch (error) {
    handleError(error, res, 'fetching environment variables');
  }
});

// POST /starships/:id/environment - Create environment variable
router.post('/starships/:id/environment', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(CreateEnvironmentVariableSchema, req.body, res, 'environment variable creation');
    if (!bodyValidation) return;

    // Verify access
    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const environmentService = new EnvironmentService();
    const environment = await environmentService.createEnvironmentVariable(starshipId, bodyValidation, userId);

    sendSuccess(res, { environment }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      sendError(res, 'RESOURCE_CONFLICT', 'Environment variable already exists', 409, {
        key: req.body.key,
      });
      return;
    }
    handleError(error, res, 'creating environment variable');
  }
});

// PUT /starships/:id/environment/:key - Update environment variable
router.put('/starships/:id/environment/:key', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, key } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate parameters
    const paramValidation = validateData(
      z.object({ id: IdSchema, key: EnvironmentKeySchema }),
      req.params,
      res,
      'starship and key parameters'
    );
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(UpdateEnvironmentVariableSchema, req.body, res, 'environment variable update');
    if (!bodyValidation) return;

    // Verify access
    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const environmentService = new EnvironmentService();
    const environment = await environmentService.updateEnvironmentVariable(starshipId, key, bodyValidation, userId);

    sendSuccess(res, { environment });
  } catch (error) {
    handleError(error, res, 'updating environment variable');
  }
});

// DELETE /starships/:id/environment/:key - Delete environment variable
router.delete('/starships/:id/environment/:key', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, key } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate parameters
    const paramValidation = validateData(
      z.object({ id: IdSchema, key: EnvironmentKeySchema }),
      req.params,
      res,
      'starship and key parameters'
    );
    if (!paramValidation) return;

    // Verify access
    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const environmentService = new EnvironmentService();
    const deleted = await environmentService.deleteEnvironmentVariable(starshipId, key);

    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Environment variable not found', 404, {
        key,
        starshipId,
      });
      return;
    }

    res.status(204).send();
  } catch (error) {
    handleError(error, res, 'deleting environment variable');
  }
});

export default router;
