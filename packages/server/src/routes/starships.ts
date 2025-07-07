/**
 * Starship management routes for Aether Core
 */

import { Router } from 'express';
import type { StarshipRepository, AgentRepository, CodexRepository } from '@starships/models';
import { AetherCoreService } from '@starships/models';
import { authMiddleware } from '../middleware/auth';

const router: Router = Router();

// Temporary in-memory repositories until we connect the full dependency injection
// TODO: Replace with proper dependency injection pattern
let starshipRepo: StarshipRepository;
let agentRepo: AgentRepository; 
let codexRepo: CodexRepository;

export function initializeStarshipRoutes(deps: {
  starshipRepository: StarshipRepository;
  agentRepository: AgentRepository;
  codexRepository: CodexRepository;
}) {
  starshipRepo = deps.starshipRepository;
  agentRepo = deps.agentRepository;
  codexRepo = deps.codexRepository;
}

// GET /starships - Get user's starships
router.get('/starships', authMiddleware, async (req, res) => {
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
router.post('/starships', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name, class: starshipClass } = req.body;

    if (!name || !starshipClass) {
      res.status(400).json({ error: 'Name and class are required' });
      return;
    }

    // Use AetherCoreService for initialization (includes codex creation)
    const result = await AetherCoreService.initializeStarship(userId, {
      name,
      class: starshipClass
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating starship:', error);
    res.status(500).json({ error: 'Failed to create starship' });
  }
});

// GET /starships/:id - Get specific starship
router.get('/starships/:id', authMiddleware, async (req, res) => {
  try {
    const starshipId = req.params.id;
    const starship = await starshipRepo.findById(starshipId);
    
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    // Check ownership
    if (starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get deployed agents
    const agents = await starshipRepo.getDeployedAgents(starshipId);
    const availableSlots = await starshipRepo.getAvailableSlots(starshipId);

    res.json({ starship, agents, availableSlots });
  } catch (error) {
    console.error('Error fetching starship:', error);
    res.status(500).json({ error: 'Failed to fetch starship' });
  }
});

// POST /starships/:id/agents/:agentId/deploy - Deploy agent to starship
router.post('/starships/:id/agents/:agentId/deploy', authMiddleware, async (req, res) => {
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
router.delete('/starships/:id/agents/:agentId', authMiddleware, async (req, res) => {
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

// GET /starships/:id/codex - Get active codex
router.get('/starships/:id/codex', authMiddleware, async (req, res) => {
  try {
    const starshipId = req.params.id;
    
    // Verify starship ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const codex = await AetherCoreService.getActiveCodex(starshipId);
    res.json({ codex });
  } catch (error) {
    console.error('Error fetching codex:', error);
    res.status(500).json({ error: 'Failed to fetch codex' });
  }
});

// NEW: POST /starships/:id/codex/mutate - Update codex with versioning
router.post('/starships/:id/codex/mutate', authMiddleware, async (req, res) => {
  try {
    const starshipId = req.params.id;
    const { mutations } = req.body;
    
    // Verify starship ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Reject goal mutations - goals functionality removed
    if (mutations.goals) {
      res.status(400).json({
        error: 'Goal mutations no longer supported. Goals functionality has been removed from Vision Chamber.'
      });
      return;
    }

    // Apply mutations via AetherCoreService (vision and constraints only)
    const updatedCodex = await AetherCoreService.mutateCodex(
      starshipId,
      mutations,
      req.user!.id
    );

    res.json({ codex: updatedCodex });
  } catch (error) {
    console.error('Error mutating codex:', error);
    res.status(500).json({ error: 'Failed to update codex' });
  }
});

// NEW: GET /starships/:id/projection/:lens - Get lens-specific projection
router.get('/starships/:id/projection/:lens', authMiddleware, async (req, res) => {
  try {
    const { id: starshipId, lens } = req.params;
    
    // Verify starship ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!['telos', 'ethos', 'full'].includes(lens)) {
      res.status(400).json({ error: 'Invalid lens. Must be telos, ethos, or full' });
      return;
    }

    const projection = await AetherCoreService.getProjection(
      starshipId,
      lens as 'telos' | 'ethos' | 'full'
    );

    // Ensure no legacy goal data is returned
    if (projection && 'goals' in projection) {
      delete (projection as any).goals;
    }

    res.json({ projection });
  } catch (error) {
    console.error('Error fetching projection:', error);
    res.status(500).json({ error: 'Failed to fetch projection' });
  }
});

export default router; 