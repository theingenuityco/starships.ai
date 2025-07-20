import { Router } from 'express';
import { AgentService } from '../services/AgentService';
import type {
  Agent,
  AgentConfig,
  CreateAgentRequest,
  UpdateAgentRequest,
} from '@starships/protocol';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

const router: Router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { category, authorId, tags, isPublic } = req.query;

    let agents;
    if (category) {
      agents = await AgentService.getAgentsByCategory(category as string);
    } else if (authorId) {
      agents = await AgentService.getAgentsByAuthor(authorId as string);
    } else if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      agents = await AgentService.getAgentsByTags(tagArray as string[]);
    } else if (isPublic === 'true') {
      const limit = Math.floor(parseInt(req.query.limit as string) || 50);
      const offset = Math.floor(parseInt(req.query.offset as string) || 0);
      agents = await AgentService.getPublicAgents(limit, offset);
    } else {
      // Default: get user's agents + public agents
      console.log(`[AGENTS] Loading agents for user: ${req.user!.id}`);

      let userAgents: Agent[] = [];
      let publicAgents: Agent[] = [];

      try {
        console.log(`[AGENTS] Fetching user agents for: ${req.user!.id}`);
        userAgents = await AgentService.getAgentsByAuthor(req.user!.id);
        console.log(`[AGENTS] Found ${userAgents.length} user agents`);
      } catch (userError: any) {
        console.error(`[AGENTS] Failed to get user agents:`, userError);
        // Continue with empty user agents array
      }

      try {
        console.log(`[AGENTS] Fetching public agents`);
        publicAgents = await AgentService.getPublicAgents(50, 0);
        console.log(`[AGENTS] Found ${publicAgents.length} public agents`);
      } catch (publicError: any) {
        console.error(`[AGENTS] Failed to get public agents:`, publicError);
        // Continue with empty public agents array
      }

      // Combine and deduplicate
      const allAgents = [...userAgents];
      for (const publicAgent of publicAgents) {
        if (!allAgents.find((a) => a.id === publicAgent.id)) {
          allAgents.push(publicAgent);
        }
      }
      agents = allAgents;
      console.log(`[AGENTS] Total agents returned: ${agents.length}`);
    }

    res.json(agents);
  } catch (error) {
    console.error('Error loading agents:', error);
    res.status(500).json({ error: 'Failed to load agents' });
  }
});

// ADD: Public agents endpoint
router.get('/public', authMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = Math.floor(parseInt(req.query.limit as string) || 50);
    const offset = Math.floor(parseInt(req.query.offset as string) || 0);
    const agents = await AgentService.getPublicAgents(limit, offset);
    res.json(agents);
  } catch (error) {
    console.error('Error loading public agents:', error);
    res.status(500).json({ error: 'Failed to load public agents' });
  }
});

// ADD: Search endpoint
router.get('/search', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }
    const agents = await AgentService.searchAgents(query);
    res.json(agents);
  } catch (error) {
    console.error('Error searching agents:', error);
    res.status(500).json({ error: 'Failed to search agents' });
  }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const agent = await AgentService.getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
    } else {
      res.json(agent);
    }
  } catch (error) {
    console.error('Error getting agent:', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const createRequest = req.body as CreateAgentRequest & { starshipId: string };
    
    // Validate required starshipId field
    if (!createRequest.starshipId) {
      res.status(400).json({
        error: 'starshipId is required',
        details: 'All agents must be assigned to a starship. Please provide a valid starshipId.'
      });
      return;
    }
    
    // TODO: Add validation to ensure starshipId references valid, accessible starship
    // This would require access to StarshipRepository here
    // For now, we'll assume the starshipId is valid and let the database handle referential integrity
    
    // Add user ID from auth context
    const agentData = {
      ...createRequest,
      authorId: req.user!.id, // Override with authenticated user ID
      starshipId: createRequest.starshipId,
    };
    console.log(
      `[AGENTS] Creating agent with authorId: ${agentData.authorId}, starshipId: ${agentData.starshipId} for user: ${req.user!.id}`
    );
    const agent = await AgentService.createAgent(agentData);
    console.log(`[AGENTS] Agent created successfully: ${agent.id}, authorId: ${agent.authorId}`);
    res.status(201).json(agent);
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const updates = req.body as UpdateAgentRequest & { starshipId?: string };
    
    // If starshipId is being updated, validate it exists
    if (updates.starshipId !== undefined) {
      // TODO: Add validation to ensure starshipId references valid, accessible starship
      // This would require access to StarshipRepository here
      console.log(`[AGENTS] Updating agent ${req.params.id} with new starshipId: ${updates.starshipId}`);
    }
    
    const agent = await AgentService.updateAgent(req.params.id, updates);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
    } else {
      res.json(agent);
    }
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const deleted = await AgentService.deleteAgent(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Agent not found' });
    } else {
      res.json({ message: 'Agent deleted successfully' });
    }
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// Analytics endpoints
router.get('/:id/analytics', authMiddleware, async (req: Request, res: Response) => {
  try {
    const analytics = await AgentService.getAgentAnalytics(req.params.id);
    if (!analytics) {
      res.status(404).json({ error: 'Agent not found' });
    } else {
      res.json(analytics);
    }
  } catch (error) {
    console.error('Error getting agent analytics:', error);
    res.status(500).json({ error: 'Failed to get agent analytics' });
  }
});

// Rating endpoint
router.post('/:id/rate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { rating } = req.body;
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Rating must be a number between 1 and 5' });
      return;
    }

    const result = await AgentService.rateAgent(req.params.id, req.user!.id, rating);
    if (!result) {
      res.status(404).json({ error: 'Agent not found' });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error('Error rating agent:', error);
    res.status(500).json({ error: 'Failed to rate agent' });
  }
});

// Usage tracking endpoint (called internally)
router.post('/:id/track-usage', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await AgentService.trackUsage(req.params.id, req.user!.id);
    if (!result) {
      res.status(404).json({ error: 'Agent not found' });
    } else {
      res.json({ message: 'Usage tracked successfully' });
    }
  } catch (error) {
    console.error('Error tracking usage:', error);
    res.status(500).json({ error: 'Failed to track usage' });
  }
});

// NEW: Get agents by starship ID
router.get('/by-starship/:starshipId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { starshipId } = req.params;
    
    // TODO: Add validation to ensure starshipId references valid, accessible starship
    // For now, we'll fetch agents by starshipId without additional validation
    
    // This would use AgentRepository.findByStarshipId(starshipId) when implemented
    // For now, we'll return an empty array or implement basic functionality
    const agents: any[] = []; // Placeholder
    
    res.json(agents);
  } catch (error) {
    console.error('Error getting agents by starship:', error);
    res.status(500).json({ error: 'Failed to get agents by starship' });
  }
});

// NEW: Update agent starship assignment
router.put('/:id/starship', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: agentId } = req.params;
    const { starshipId } = req.body;
    
    if (!starshipId) {
      res.status(400).json({
        error: 'Missing required field',
        details: 'starshipId is required to update agent starship assignment',
        field: 'starshipId'
      });
      return;
    }

    // Validate starshipId format (basic UUID check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(starshipId)) {
      res.status(400).json({
        error: 'Invalid starshipId format',
        details: 'starshipId must be a valid UUID',
        provided: starshipId
      });
      return;
    }
    
    // TODO: Add validation to ensure starshipId references valid, accessible starship
    // TODO: Add validation to ensure user owns the agent and/or has access to the starship
    
    console.log(`[AGENTS] Updating agent ${agentId} starship assignment to: ${starshipId}`);
    
    const agent = await AgentService.updateAgent(agentId, { starshipId } as UpdateAgentRequest);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
    } else {
      res.json({ message: 'Agent starship assignment updated successfully', agent });
    }
  } catch (error) {
    console.error('Error updating agent starship assignment:', error);
    res.status(500).json({ error: 'Failed to update agent starship assignment' });
  }
});

export default router;
