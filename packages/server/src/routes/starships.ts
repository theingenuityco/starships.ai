/**
 * Starship management routes for Aether Core
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { StarshipService } from '@/services/StarshipService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { StarshipModel } from '@starships/protocol';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';

const router: Router = Router();

// Zod schemas for validation
const IdSchema = z.string().regex(/^[a-z0-9]{10,30}$/i, 'Invalid ID format');

// Helper function for Zod validation
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

// Helper function for authentication check
const checkAuth = (req: Request, res: Response): boolean => {
  const user = (req as any).user;
  if (!user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return false;
  }
  return true;
};

// POST /starships - Create new starship (OpenAPI pattern)
router.post('/starships', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.id;
    const { name, maxAgents = 3 } = req.body;

    console.log('[STARSHIP-CREATE] Starting starship creation for user:', userId);

    // Validate required fields
    if (!name) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'Missing required fields', 400, {
        required_fields: ['name'],
        provided: { name: !!name },
      });
      return;
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'Name must be a non-empty string', 400, {
        field: 'name',
      });
      return;
    }

    const starshipService = new StarshipService();

    console.log('[STARSHIP-CREATE] Generating unique slug...');
    const slug = await starshipService.generateUniqueSlug(name.trim(), userId);
    console.log('[STARSHIP-CREATE] Generated slug:', slug);

    console.log('[STARSHIP-CREATE] Creating starship in database...');
    const starship = await starshipService.createStarship({
      ownerId: userId,
      name: name.trim(),
      maxAgents,
      slug,
    });
    console.log('[STARSHIP-CREATE] Starship created with ID:', starship.id);

    sendSuccess(
      res,
      {
        starship,
        message: 'Starship created successfully',
      },
      201
    );
  } catch (error) {
    handleError(error, res, 'creating starship');
  }
});

// GET /starships/:id - Get specific starship (supports both ID and slug) (OpenAPI pattern)
router.get('/starships/:idOrSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { idOrSlug } = req.params;
    const userId = (req as any).user!.id;

    const starshipService = new StarshipService();
    // Try to find by ID first, then by slug
    const starship = await starshipService.getStarship(idOrSlug, userId);

    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: idOrSlug,
      });
      return;
    }

    // Check ownership
    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Return just the starship model
    // Note: For detailed agent info and available slots, use GET /starships/:id/agents endpoint
    sendSuccess(res, starship);
  } catch (error) {
    handleError(error, res, 'fetching starship');
  }
});

// POST /starships/:id/agents/:agentId - Deploy agent to starship (OpenAPI pattern)
router.post('/starships/:id/agents/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, agentId } = req.params;

    // Validate IDs
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
        agentId: IdSchema,
      }),
      { id: starshipId, agentId },
      res,
      'starship and agent parameters'
    );
    if (!paramValidation) return;

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== (req as any).user!.id) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Deploy agent (service will verify agent exists)
    await starshipService.deployAgent(starshipId, agentId);

    sendSuccess(res, { message: 'Agent deployed successfully' }, 201);
  } catch (error) {
    console.error('Error deploying agent:', error);

    if (error instanceof Error) {
      if (error.message.includes('No available agent slots')) {
        sendError(res, 'OPERATION_NOT_ALLOWED', error.message, 400);
        return;
      }
      if (error.message.includes('already deployed')) {
        sendError(res, 'RESOURCE_CONFLICT', error.message, 409);
        return;
      }
    }

    handleError(error, res, 'deploying agent');
  }
});

// DELETE /starships/:id/agents/:agentId - Remove agent from starship (OpenAPI pattern)
router.delete('/starships/:id/agents/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, agentId } = req.params;

    // Validate IDs
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
        agentId: IdSchema,
      }),
      { id: starshipId, agentId },
      res,
      'starship and agent parameters'
    );
    if (!paramValidation) return;

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== (req as any).user!.id) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Remove agent
    const removed = await starshipService.removeAgent(starshipId, agentId);
    if (!removed) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not deployed on this starship', 404, {
        resource: 'deployed_agent',
        starshipId,
        agentId,
      });
      return;
    }

    // Return 204 No Content for successful deletion
    res.status(204).send();
  } catch (error) {
    handleError(error, res, 'removing agent');
  }
});

// PUT /starships/:id - Update starship (name, status, maxAgents) (OpenAPI pattern)
router.put('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;
    const { name, status, maxAgents } = req.body;

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Validate allowed updates
    const allowedUpdates: Partial<StarshipModel> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        sendError(res, 'VALIDATION_ERROR', 'Name must be a non-empty string', 400, {
          field: 'name',
        });
        return;
      }
      allowedUpdates.name = name.trim();
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        sendError(res, 'INVALID_INPUT', 'Invalid status value', 400, {
          field: 'status',
          allowed_values: ['active', 'inactive'],
          provided: status,
        });
        return;
      }
      allowedUpdates.status = status;
    }

    if (maxAgents !== undefined) {
      if (typeof maxAgents !== 'number' || maxAgents < 1 || maxAgents > 50) {
        sendError(res, 'VALIDATION_ERROR', 'maxAgents must be a number between 1 and 50', 400, {
          field: 'maxAgents',
        });
        return;
      }

      // Check if there are deployed agents that exceed new maxAgents limits
      const deployedAgents = await starshipService.getDeployedAgents(starshipId);
      if (deployedAgents.length > maxAgents) {
        sendError(res, 'OPERATION_NOT_ALLOWED', 'Cannot reduce maxAgents below current deployed agent count', 400, {
          message: 'Current deployed agents exceed the new maxAgents limit',
          current_deployed: deployedAgents.length,
          new_max_agents: maxAgents,
        });
        return;
      }

      allowedUpdates.maxAgents = maxAgents;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'No valid updates provided', 400, {
        message: 'At least one valid field must be provided for update',
        allowed_fields: ['name', 'status', 'maxAgents'],
      });
      return;
    }

    const updatedStarship = await starshipService.updateStarship(starshipId, allowedUpdates);
    if (!updatedStarship) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update starship in database');
      return;
    }

    sendSuccess(res, updatedStarship);
  } catch (error) {
    handleError(error, res, 'updating starship');
  }
});

// DELETE /starships/:id - Cancel subscription first, then delete starship (OpenAPI pattern)
router.delete('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;

    console.log(`[STARSHIPS] Delete request for starship ${starshipId} by user ${userId}`);

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Delete starship directly - no subscription logic needed
    console.log(`[STARSHIPS] Deleting starship ${starshipId}`);
    const deleted = await starshipService.deleteStarship(starshipId);

    if (!deleted) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete starship', 500);
      return;
    }

    console.log(`[STARSHIPS] Successfully deleted starship ${starshipId}`);

    // Return success
    sendSuccess(res, {
      message: 'Starship deleted successfully',
      starshipId,
    });
  } catch (error) {
    handleError(error, res, 'deleting starship');
  }
});

// GET /starships/:id/agents - Get detailed agent information for starship (OpenAPI pattern)
router.get('/starships/:id/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const userId = (req as any).user!.id;

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Get deployed agents and available slots
    const deployedAgents = await starshipService.getDeployedAgents(starshipId);
    const availableSlots = await starshipService.getAvailableSlots(starshipId);

    sendSuccess(res, {
      starshipId,
      starshipName: starship.name,
      maxAgents: starship.maxAgents,
      deployedAgents,
      availableSlots,
      deployedCount: deployedAgents.length,
    });
  } catch (error) {
    handleError(error, res, 'fetching starship agents');
  }
});

export default router;
