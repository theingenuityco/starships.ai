/**
 * Starship management routes for Aether Core
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { StarshipRepository, AgentRepository, Starship } from '@starships/models';
import { VisionFileService } from '@starships/models';
import { authMiddleware } from '../middleware/auth';

const router: Router = Router();

// Temporary in-memory repositories until we connect the full dependency injection
// TODO: Replace with proper dependency injection pattern
let starshipRepo: StarshipRepository;
let agentRepo: AgentRepository;

export function initializeStarshipRoutes(deps: {
  starshipRepository: StarshipRepository;
  agentRepository: AgentRepository;
}) {
  starshipRepo = deps.starshipRepository;
  agentRepo = deps.agentRepository;
}

// GET /starships - Get user's starships
router.get('/starships', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const starships = await starshipRepo.findByOwner(userId);
    res.json({ starships });
  } catch (error) {
    console.error('Error fetching starships:', error);
    res.status(500).json({ error: 'Failed to fetch starships' });
  }
});

// POST /starships - Create new starship
router.post('/starships', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, class: starshipClass } = req.body;

    console.log('[STARSHIP-CREATE] Starting starship creation for user:', userId);

    if (!name || !starshipClass) {
      res.status(400).json({ error: 'Name and class are required' });
      return;
    }

    console.log('[STARSHIP-CREATE] Generating unique slug...');
    // Generate unique slug for the starship
    const slug = await starshipRepo.generateUniqueSlug(name, userId);
    console.log('[STARSHIP-CREATE] Generated slug:', slug);
    
    console.log('[STARSHIP-CREATE] Creating starship in database...');
    // Create starship directly (bypassing codex system)
    const starship = await starshipRepo.create({
      ownerId: userId,
      name,
      class: starshipClass,
      slug,
      powerLevel: 85,
      activeExpeditions: 0,
      sibilInsights: 0,
      status: 'active'
    });
    console.log('[STARSHIP-CREATE] Starship created with ID:', starship.id);

    console.log('[STARSHIP-CREATE] Creating empty vision file...');
    // Create empty vision file for the new starship
    await VisionFileService.createEmptyVision(starship.id);
    console.log('[STARSHIP-CREATE] Vision file created successfully');

    console.log('[STARSHIP-CREATE] Starship creation completed successfully');
    res.status(201).json({ starship });
  } catch (error) {
    console.error('[STARSHIP-CREATE] Error creating starship:', error);
    res.status(500).json({ error: 'Failed to create starship' });
  }
});

// GET /starships/:idOrSlug - Get specific starship (supports both ID and slug)
router.get('/starships/:idOrSlug', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    const userId = req.user!.id;
    
    // Try to find by ID first, then by slug
    let starship = await starshipRepo.findById(idOrSlug);
    
    if (!starship) {
      // Try to find by slug
      starship = await starshipRepo.findBySlug(idOrSlug, userId);
    }

    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    // Check ownership
    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get deployed agents
    const agents = await starshipRepo.getDeployedAgents(starship.id);
    const availableSlots = await starshipRepo.getAvailableSlots(starship.id);

    res.json({ starship, agents, availableSlots });
  } catch (error) {
    console.error('Error fetching starship:', error);
    res.status(500).json({ error: 'Failed to fetch starship' });
  }
});

// POST /starships/:id/agents/:agentId/deploy - Deploy agent to starship
router.post('/starships/:id/agents/:agentId/deploy', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: starshipId, agentId } = req.params;
    
    // Verify starship ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Verify agent exists
    const agent = await agentRepo.findById(agentId);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Deploy agent
    await starshipRepo.deployAgent(starshipId, agentId);
    
    res.json({ message: 'Agent deployed successfully' });
  } catch (error) {
    console.error('Error deploying agent:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('No available agent slots')) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error.message.includes('already deployed')) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    
    res.status(500).json({ error: 'Failed to deploy agent' });
  }
});

// DELETE /starships/:id/agents/:agentId - Remove agent from starship
router.delete('/starships/:id/agents/:agentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: starshipId, agentId } = req.params;
    
    // Verify starship ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Remove agent
    const removed = await starshipRepo.removeAgent(starshipId, agentId);
    
    if (!removed) {
      res.status(404).json({ error: 'Agent not deployed on this starship' });
      return;
    }

    res.json({ message: 'Agent removed successfully' });
  } catch (error) {
    console.error('Error removing agent:', error);
    res.status(500).json({ error: 'Failed to remove agent' });
  }
});

// PUT /starships/:id - Update starship (name, status, class)
router.put('/starships/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = req.user!.id;
    const { name, status, class: starshipClass } = req.body;

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Validate allowed updates
    const allowedUpdates: Partial<Starship> = {};
    
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Name must be a non-empty string' });
        return;
      }
      allowedUpdates.name = name.trim();
    }

    if (status !== undefined) {
      if (!['active', 'docked', 'maintenance'].includes(status)) {
        res.status(400).json({ error: 'Status must be one of: active, docked, maintenance' });
        return;
      }
      allowedUpdates.status = status;
    }

    if (starshipClass !== undefined) {
      if (!['scout', 'cruiser'].includes(starshipClass)) {
        res.status(400).json({ error: 'Class must be one of: scout, cruiser' });
        return;
      }
      // Check if there are deployed agents that exceed new class limits
      if (starshipClass === 'scout') {
        const deployedAgents = await starshipRepo.getDeployedAgents(starshipId);
        if (deployedAgents.length > 3) {
          res.status(400).json({
            error: 'Cannot change to scout class: too many deployed agents (max 3 for scout)'
          });
          return;
        }
      }
      allowedUpdates.class = starshipClass;
      // Update maxAgents based on new class
      allowedUpdates.maxAgents = starshipClass === 'scout' ? 3 : 6;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      res.status(400).json({ error: 'No valid updates provided' });
      return;
    }

    const updatedStarship = await starshipRepo.update(starshipId, allowedUpdates);
    if (!updatedStarship) {
      res.status(500).json({ error: 'Failed to update starship' });
      return;
    }

    res.json({ starship: updatedStarship });
  } catch (error) {
    console.error('Error updating starship:', error);
    res.status(500).json({ error: 'Failed to update starship' });
  }
});

// DELETE /starships/:id - Delete starship
router.delete('/starships/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = req.user!.id;

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Check if starship has active expeditions (business rule)
    if (starship.activeExpeditions > 0) {
      res.status(400).json({
        error: 'Cannot delete starship with active expeditions. Complete or cancel expeditions first.'
      });
      return;
    }

    const deleted = await starshipRepo.delete(starshipId);
    if (!deleted) {
      res.status(500).json({ error: 'Failed to delete starship' });
      return;
    }

    res.json({ message: 'Starship deleted successfully' });
  } catch (error) {
    console.error('Error deleting starship:', error);
    res.status(500).json({ error: 'Failed to delete starship' });
  }
});

// PUT /starships/:id/status - Update starship status specifically
router.put('/starships/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = req.user!.id;
    const { status } = req.body;

    if (!status || !['active', 'docked', 'maintenance'].includes(status)) {
      res.status(400).json({ error: 'Status must be one of: active, docked, maintenance' });
      return;
    }

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Business rule: Can't set to maintenance if there are active expeditions
    if (status === 'maintenance' && starship.activeExpeditions > 0) {
      res.status(400).json({
        error: 'Cannot set starship to maintenance with active expeditions'
      });
      return;
    }

    const updatedStarship = await starshipRepo.update(starshipId, { status });
    if (!updatedStarship) {
      res.status(500).json({ error: 'Failed to update starship status' });
      return;
    }

    res.json({ starship: updatedStarship });
  } catch (error) {
    console.error('Error updating starship status:', error);
    res.status(500).json({ error: 'Failed to update starship status' });
  }
});

// GET /starships/:id/agents - Get detailed agent information for starship
router.get('/starships/:id/agents', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = req.user!.id;

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get deployed agents and available slots
    const deployedAgents = await starshipRepo.getDeployedAgents(starshipId);
    const availableSlots = await starshipRepo.getAvailableSlots(starshipId);

    res.json({
      starshipId,
      starshipName: starship.name,
      starshipClass: starship.class,
      maxAgents: starship.maxAgents,
      deployedAgents,
      availableSlots,
      deployedCount: deployedAgents.length
    });
  } catch (error) {
    console.error('Error fetching starship agents:', error);
    res.status(500).json({ error: 'Failed to fetch starship agents' });
  }
});


export default router;