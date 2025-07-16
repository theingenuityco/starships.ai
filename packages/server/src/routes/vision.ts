import { Router } from 'express';
import type { Request, Response } from 'express';
import { VisionFileService } from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import type { StarshipRepository } from '@starships/models';

const router: Router = Router();

// Repository dependency injection (following starships.ts pattern)
let starshipRepo: StarshipRepository;

export function initializeVisionRoutes(deps: {
  starshipRepository: StarshipRepository;
}) {
  starshipRepo = deps.starshipRepository;
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
    
    // Create empty file if doesn't exist
    await VisionFileService.createEmptyVision(starshipId);
    
    const vision = await VisionFileService.readVision(starshipId) || '';
    res.json({ vision });
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
    
    await VisionFileService.writeVision(starshipId, vision);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save vision' });
  }
});

export default router;