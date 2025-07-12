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
    const createRequest = req.body as CreateAgentRequest;
    // Add user ID from auth context
    const agentData = {
      ...createRequest,
      authorId: req.user!.id, // Override with authenticated user ID
    };
    console.log(
      `[AGENTS] Creating agent with authorId: ${agentData.authorId} for user: ${req.user!.id}`
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
    const updates = req.body as UpdateAgentRequest;
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

export default router;
