/**
 * Starship management routes for Aether Core
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { StarshipService } from '@/services/StarshipService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import type { StarshipModel, AuthUser } from '@starships/protocol';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const router: Router = Router();

function requireAuthUser(req: Request, res: Response): AuthUser | null {
  const user = req.user as AuthUser | null | undefined;
  if (!user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return user;
}

// POST /starships - Create new starship
router.post('/starships', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'Name must be a non-empty string', 400, { field: 'name' });
      return;
    }

    const starshipService = new StarshipService();
    const starship = await starshipService.createStarship({
      ownerId: userId,
      name: name.trim(),
      shipClass: 'scout',
    });

    sendSuccess(res, starship, 201);
  } catch (error) {
    handleError(error, res, 'creating starship');
  }
});

// GET /starships/:idOrSlug - Get a specific starship (by id or slug)
router.get('/starships/:idOrSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { idOrSlug } = req.params;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(idOrSlug, userId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { resource: 'starship', id: idOrSlug });
      return;
    }

    if (!(await starshipService.hasCollaboratorAccess(userId, starship.id))) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    sendSuccess(res, starship);
  } catch (error) {
    handleError(error, res, 'fetching starship');
  }
});

// PUT /starships/:id - Update starship
router.put('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;
    const { name, status, maxAgents, description, websiteUrl } = req.body;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { resource: 'starship', id: starshipId });
      return;
    }
    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    const allowedUpdates: Partial<StarshipModel> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        sendError(res, 'VALIDATION_ERROR', 'Name must be a non-empty string', 400, { field: 'name' });
        return;
      }
      const nextName = name.trim();
      if (nextName !== starship.name) allowedUpdates.name = nextName;
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        sendError(res, 'INVALID_INPUT', 'Invalid status value', 400, { field: 'status', allowed_values: ['active', 'inactive'], provided: status });
        return;
      }
      allowedUpdates.status = status;
    }

    if (maxAgents !== undefined) {
      if (typeof maxAgents !== 'number' || maxAgents < 1 || maxAgents > 50) {
        sendError(res, 'VALIDATION_ERROR', 'maxAgents must be a number between 1 and 50', 400, { field: 'maxAgents' });
        return;
      }
      const registered = await starshipService.getDeployedAgents(starshipId);
      if (registered.length > maxAgents) {
        sendError(res, 'OPERATION_NOT_ALLOWED', 'Cannot reduce maxAgents below current registered agent count', 400, {
          current_registered: registered.length,
          new_max_agents: maxAgents,
        });
        return;
      }
      allowedUpdates.maxAgents = maxAgents;
    }

    if (description !== undefined) {
      if (description === null) {
        allowedUpdates.description = '';
      } else if (typeof description !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'description must be a string', 400, { field: 'description' });
        return;
      } else {
        const trimmed = description.trim();
        if (trimmed.length > 2000) {
          sendError(res, 'VALIDATION_ERROR', 'description must be 2000 characters or less', 400, { field: 'description' });
          return;
        }
        allowedUpdates.description = trimmed;
      }
    }

    if (websiteUrl !== undefined) {
      if (websiteUrl === null || (typeof websiteUrl === 'string' && websiteUrl.trim().length === 0)) {
        allowedUpdates.websiteUrl = '';
      } else if (typeof websiteUrl !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be a string', 400, { field: 'websiteUrl' });
        return;
      } else {
        const trimmed = websiteUrl.trim();
        if (trimmed.length > 2048) {
          sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be 2048 characters or less', 400, { field: 'websiteUrl' });
          return;
        }
        try {
          const u = new URL(trimmed);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            sendError(res, 'VALIDATION_ERROR', 'websiteUrl must start with http:// or https://', 400, { field: 'websiteUrl' });
            return;
          }
        } catch {
          sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be a valid URL', 400, { field: 'websiteUrl' });
          return;
        }
        allowedUpdates.websiteUrl = trimmed;
      }
    }

    if (Object.keys(allowedUpdates).length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'No valid updates provided', 400, {
        allowed_fields: ['name', 'description', 'websiteUrl', 'status', 'maxAgents'],
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

// DELETE /starships/:id - Delete starship
router.delete('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { resource: 'starship', id: starshipId });
      return;
    }
    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    const deleted = await starshipService.deleteStarship(starshipId);
    if (!deleted) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete starship', 500);
      return;
    }

    sendSuccess(res, { message: 'Starship deleted successfully', starshipId });
  } catch (error) {
    handleError(error, res, 'deleting starship');
  }
});

// GET /starships/:id/agents - Registered agents for a starship (collaborator access)
router.get('/starships/:id/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const starshipService = new StarshipService();
    const agents = await starshipService.getDeployedAgents(starshipId);
    sendSuccess(res, agents);
  } catch (error) {
    handleError(error, res, 'fetching starship agents');
  }
});

export default router;
