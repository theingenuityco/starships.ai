/**
 * Environment variable management routes
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { EnvironmentService } from '@/services/EnvironmentService';
import { StarshipService } from '@/services/StarshipService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema, EnvironmentKeySchema } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const router: Router = Router();

// Validation schemas

const CreateEnvironmentVariableSchema = z.object({
  key: EnvironmentKeySchema,
  value: z.string().min(1, 'Value is required').max(10000, 'Value too large'),
  description: z.string().max(500, 'Description too long').optional(),
});

const UpdateEnvironmentVariableSchema = z.object({
  value: z.string().min(1).max(10000).optional(),
  description: z.string().max(500).optional(),
});


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

// PUT /starships/:id/environment/:envId - Update environment variable
router.put('/starships/:id/environment/:envId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, envId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate parameters
    const paramValidation = validateData(
      z.object({ id: IdSchema, envId: IdSchema }),
      req.params,
      res,
      'starship and environment variable parameters'
    );
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(UpdateEnvironmentVariableSchema, req.body, res, 'environment variable update');
    if (!bodyValidation) return;

    // Verify access
    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const environmentService = new EnvironmentService();
    const environment = await environmentService.updateEnvironmentVariableById(starshipId, envId, bodyValidation, userId);

    sendSuccess(res, { environment });
  } catch (error) {
    handleError(error, res, 'updating environment variable');
  }
});

// DELETE /starships/:id/environment/:envId - Delete environment variable
router.delete('/starships/:id/environment/:envId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, envId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate parameters
    const paramValidation = validateData(
      z.object({ id: IdSchema, envId: IdSchema }),
      req.params,
      res,
      'starship and environment variable parameters'
    );
    if (!paramValidation) return;

    // Verify access
    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const environmentService = new EnvironmentService();
    const deleted = await environmentService.deleteEnvironmentVariableById(starshipId, envId);

    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Environment variable not found', 404, {
        envId,
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
