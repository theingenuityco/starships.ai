import { Request, Response, NextFunction } from 'express';
import { StarshipRepository } from '@starships/models';
import { logger } from '@/utils/logger';

export interface StarshipRequest extends Request {
  starship?: any;
}

// ⚠️ UPDATED: Use dependency injection pattern
let starshipRepository: StarshipRepository;

export function initializeStarshipAccessMiddleware(deps: { starshipRepository: StarshipRepository }) {
  starshipRepository = deps.starshipRepository;
}

export async function checkStarshipAccess(req: StarshipRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const starshipId = req.params.starshipId || req.params.id;
    const userId = req.user?.id;

    if (!starshipId || !userId) {
      res.status(400).json({ error: 'Missing starship ID or user ID' });
      return;
    }

    const starship = await starshipRepository.findById(starshipId);

    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    req.starship = starship;
    next();
  } catch (error) {
    logger.error('[STARSHIP-ACCESS] Access check failed', {
      starshipId: req.params.starshipId,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: 'starship_access_check'
    });
    res.status(500).json({ error: 'Failed to verify access' });
  }
}
