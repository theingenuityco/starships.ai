import { Request, Response, NextFunction } from 'express';
import { StarshipRepository } from '@starships/models';

export interface StarshipRequest extends Request {
  starship?: any;
}

// ⚠️ UPDATED: Use dependency injection pattern
let starshipRepository: StarshipRepository;

export function initializeStarshipAccessMiddleware(deps: {
  starshipRepository: StarshipRepository;
}) {
  starshipRepository = deps.starshipRepository;
}

export async function checkStarshipAccess(
  req: StarshipRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    // Check subscription status
    if (starship.status === 'disabled') {
      res.status(403).json({ 
        error: 'Subscription ended. Please reactivate to continue.' 
      });
      return;
    }

    if (starship.status === 'restricted') {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        res.status(402).json({ 
          error: 'Payment required. Please update your payment method.',
          billingPortalUrl: `/api/starships/${starshipId}/billing-portal`,
        });
        return;
      }
    }

    req.starship = starship;
    next();

  } catch (error) {
    console.error('Access check error:', error);
    res.status(500).json({ error: 'Failed to verify access' });
  }
}