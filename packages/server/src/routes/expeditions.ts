/**
 * Expedition management routes
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  ExpeditionRepository,
  StarshipRepository,
  AgentRepository,
  RepositoryFactory,
} from '@starships/models';
import {
  EnhancedValidationError as ValidationError,
  EnhancedConstraintViolationError as ConstraintViolationError,
  EnhancedNotFoundError as NotFoundError,
} from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import type { CreateExpeditionRequest } from '@starships/protocol';

const router: Router = Router();

// Initialize repositories
let expeditionRepo: ExpeditionRepository;
let starshipRepo: StarshipRepository;
let agentRepo: AgentRepository;

export function initializeExpeditionRoutes(factory: typeof RepositoryFactory) {
  expeditionRepo = factory.getExpeditionRepository();
  starshipRepo = factory.getStarshipRepository();
  agentRepo = factory.getAgentRepository();
}

/**
 * Error handling helper
 */
const handleError = (error: any, res: Response, context: string): void => {
  console.error(`[EXPEDITIONS] ${context}:`, error);

  if (error instanceof ValidationError) {
    res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      field: error.field,
    });
    return;
  }

  if (error instanceof ConstraintViolationError) {
    const statusCode = error.constraintType === 'unique' ? 409 : 400;
    res.status(statusCode).json({
      error: 'Constraint Violation',
      message: error.message,
      constraintType: error.constraintType,
    });
    return;
  }

  if (error instanceof NotFoundError) {
    res.status(404).json({
      error: 'Not Found',
      message: error.message,
      entityType: error.entityType,
      entityId: error.entityId,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(500).json({
    error: 'Internal Server Error',
    message: `${context}: ${message}`,
  });
};

// POST /api/starships/:starshipId/expeditions - Create expedition
router.post('/starships/:starshipId/expeditions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { starshipId } = req.params;
    const { name, description, agentIds } = req.body as CreateExpeditionRequest;
    const userId = req.user!.id;

    // Verify starship ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Create expedition
    const expedition = await expeditionRepo.create({
      name,
      description,
      starshipId,
      status: 'active',
    });

    // Assign agents if provided
    if (agentIds && agentIds.length > 0) {
      // Verify all agents belong to the starship
      const starshipAgents = await agentRepo.findByStarshipId(starshipId);
      const starshipAgentIds = new Set(starshipAgents.map(a => a.id));
      
      const validAgentIds = agentIds.filter(id => starshipAgentIds.has(id));
      
      if (validAgentIds.length > 0) {
        await expeditionRepo.assignAgents(expedition.id, validAgentIds);
      }
    }

    // Get assigned agents
    const agents = await expeditionRepo.getAssignedAgents(expedition.id);

    res.status(201).json({
      expedition,
      agents,
      starship,
    });
  } catch (error) {
    handleError(error, res, 'Failed to create expedition');
  }
});

// GET /api/starships/:starshipId/expeditions - List expeditions
router.get('/starships/:starshipId/expeditions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { starshipId } = req.params;
    const userId = req.user!.id;

    // Verify starship ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get expeditions
    const expeditions = await expeditionRepo.findByStarship(starshipId);

    res.json({
      expeditions,
      total: expeditions.length,
    });
  } catch (error) {
    handleError(error, res, 'Failed to list expeditions');
  }
});

// GET /api/expeditions/:id - Get expedition details
router.get('/expeditions/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Get expedition
    const expedition = await expeditionRepo.findById(id);
    if (!expedition) {
      throw new NotFoundError('Expedition not found', 'Expedition', id);
    }

    // Verify access through starship ownership
    const starship = await starshipRepo.findById(expedition.starshipId);
    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get assigned agents
    const agents = await expeditionRepo.getAssignedAgents(expedition.id);

    res.json({
      expedition,
      agents,
      starship,
    });
  } catch (error) {
    handleError(error, res, 'Failed to get expedition');
  }
});

// DELETE /api/expeditions/:id - Delete expedition
router.delete('/expeditions/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Get expedition
    const expedition = await expeditionRepo.findById(id);
    if (!expedition) {
      throw new NotFoundError('Expedition not found', 'Expedition', id);
    }

    // Verify access through starship ownership
    const starship = await starshipRepo.findById(expedition.starshipId);
    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Delete expedition (will also remove agent assignments due to DETACH DELETE)
    const deleted = await expeditionRepo.delete(id);

    if (!deleted) {
      throw new Error('Failed to delete expedition');
    }

    res.json({ message: 'Expedition deleted successfully' });
  } catch (error) {
    handleError(error, res, 'Failed to delete expedition');
  }
});

export default router;