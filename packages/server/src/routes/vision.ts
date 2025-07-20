import { Router } from 'express';
import type { Request, Response } from 'express';
import { VisionRepository } from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import type { StarshipRepository } from '@starships/models';

const router: Router = Router();

// Repository dependency injection (following starships.ts pattern)
let starshipRepo: StarshipRepository;
let visionRepo: VisionRepository;

export function initializeVisionRoutes(deps: {
  starshipRepository: StarshipRepository;
  visionRepository: VisionRepository;
}) {
  starshipRepo = deps.starshipRepository;
  visionRepo = deps.visionRepository;
}

// GET /api/starships/:id/vision
router.get('/starships/:id/vision', authMiddleware, async (req, res) => {
  try {
    const starshipId = req.params.id;
    
    // Verify ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Get vision from database, create empty if doesn't exist
    let vision = await visionRepo.findByStarship(starshipId);
    if (!vision) {
      vision = await visionRepo.create({
        starshipId,
        statement: '',
        confidence: 0.5,
        refinementCount: 0,
        lastRefined: new Date().toISOString(),
        isActive: true
      });
    }
    
    res.json({ vision: vision.statement });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read vision' });
  }
});

// POST /api/starships/:id/vision
router.post('/starships/:id/vision', authMiddleware, async (req, res) => {
  try {
    const starshipId = req.params.id;
    const { vision } = req.body;
    
    // Verify ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Update existing vision or create new one
    let existingVision = await visionRepo.findByStarship(starshipId);
    if (existingVision) {
      await visionRepo.updateStatement(starshipId, vision);
    } else {
      await visionRepo.create({
        starshipId,
        statement: vision,
        confidence: 0.5,
        refinementCount: 1,
        lastRefined: new Date().toISOString(),
        isActive: true
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save vision' });
  }
});

export default router;