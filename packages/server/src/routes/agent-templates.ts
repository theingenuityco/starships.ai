import { Router } from 'express';
import { RepositoryFactory } from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import { Request, Response } from 'express';
import { getConnection } from '@starships/models';
import { AgentTemplateService } from '../services/AgentTemplateService';

const router: Router = Router();

// Helper function to get AgentTemplateService instance
function getAgentTemplateService(): AgentTemplateService | null {
  try {
    const connection = getConnection();
    return new AgentTemplateService(connection);
  } catch (error) {
    console.error('Failed to get AgentTemplateService:', error);
    return null;
  }
}

// Get all templates
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const templateService = getAgentTemplateService();
    if (!templateService) {
      res.status(503).json({ error: 'Template service not available' });
      return;
    }
    const templates = await templateService.getAllTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error loading templates:', error);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

// Get template by ID
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const templateService = getAgentTemplateService();
    if (!templateService) {
      res.status(503).json({ error: 'Template service not available' });
      return;
    }
    const template = await templateService.getTemplateById(req.params.id);

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json(template);
  } catch (error) {
    console.error('Error loading template:', error);
    res.status(500).json({ error: 'Failed to load template' });
  }
});

// Create agent from template
router.post('/:templateId/create-agent', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { agentName, starshipId } = req.body;

    if (!agentName || !agentName.trim()) {
      res.status(400).json({ error: 'Agent name is required' });
      return;
    }

    const templateService = getAgentTemplateService();
    if (!templateService) {
      res.status(503).json({ error: 'Template service not available' });
      return;
    }

    // Check if template exists first
    const template = await templateService.getTemplateById(templateId);

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Determine the target starship ID
    let targetStarshipId = starshipId;

    // If no starshipId provided, get user's first active starship as fallback
    if (!targetStarshipId) {
      try {
        const starshipRepository = await RepositoryFactory.getStarshipRepository();
        const userStarships = await starshipRepository.findByOwner(req.user!.id);

        // Find the first active starship
        const activeStarship = userStarships.find((ship) => ship.status === 'active');

        if (!activeStarship) {
          res.status(400).json({
            error: 'No starship specified and no active starships found',
            details: 'Please provide a starshipId or create an active starship first',
            code: 'NO_STARSHIP_AVAILABLE',
          });
          return;
        }

        targetStarshipId = activeStarship.id;
        console.log(
          `[TEMPLATE] Using fallback starship "${activeStarship.name}" (${targetStarshipId}) for agent creation`
        );
      } catch (starshipError) {
        console.error('[TEMPLATE] Error finding user starships:', starshipError);
        res.status(500).json({
          error: 'Failed to determine target starship',
          details: 'Could not retrieve user starships to create agent',
        });
        return;
      }
    } else {
      // Validate provided starshipId exists and belongs to user
      try {
        const starshipRepository = await RepositoryFactory.getStarshipRepository();
        const starship = await starshipRepository.findById(targetStarshipId);

        if (!starship) {
          res.status(404).json({
            error: 'Starship not found',
            details: `No starship found with ID: ${targetStarshipId}`,
            code: 'STARSHIP_NOT_FOUND',
          });
          return;
        }

        if (starship.ownerId !== req.user!.id) {
          res.status(403).json({
            error: 'Access denied',
            details: 'You do not have permission to create agents on this starship',
            code: 'STARSHIP_ACCESS_DENIED',
          });
          return;
        }

        console.log(
          `[TEMPLATE] Using specified starship "${starship.name}" (${targetStarshipId}) for agent creation`
        );
      } catch (starshipError) {
        console.error('[TEMPLATE] Error validating starship:', starshipError);
        res.status(500).json({
          error: 'Failed to validate starship',
          details: 'Could not verify starship ownership and existence',
        });
        return;
      }
    }

    // Create agent from template with validated starship ID
    const agent = await templateService.createAgentFromTemplate(
      templateId,
      agentName.trim(),
      req.user!.id,
      targetStarshipId
    );

    // Log the creation for audit purposes
    console.log(
      `[TEMPLATE] Agent "${agent.name}" created from template "${template.name}" by user ${req.user!.id} on starship ${targetStarshipId}`
    );

    res.status(201).json(agent);
  } catch (error) {
    console.error('Error creating agent from template:', error);
    res.status(500).json({ error: 'Failed to create agent from template' });
  }
});

// Convert a public agent to a template
router.post('/convert-from-agent/:agentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    console.log('[TEMPLATE] Convert agent to template request received:', req.params);
    const { agentId } = req.params;

    if (!agentId) {
      console.log('[TEMPLATE] Error: Agent ID is required');
      res.status(400).json({ error: 'Agent ID is required' });
      return;
    }

    console.log('[TEMPLATE] Getting template service...');
    const templateService = getAgentTemplateService();
    if (!templateService) {
      res.status(503).json({ error: 'Template service not available' });
      return;
    }

    // Check if agent exists and is public
    console.log('[TEMPLATE] Getting agent repository...');
    const agentRepository = RepositoryFactory.getAgentRepository();
    console.log('[TEMPLATE] Finding agent by ID:', agentId);
    const agent = await agentRepository.findById(agentId);

    if (!agent) {
      console.log('[TEMPLATE] Error: Agent not found:', agentId);
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    console.log('[TEMPLATE] Agent found:', agent.id, agent.name, 'isPublic:', agent.isPublic);

    if (!agent.isPublic) {
      console.log('[TEMPLATE] Error: Agent is not public');
      res.status(400).json({ error: 'Only public agents can be converted to templates' });
      return;
    }

    // Check if user is the author of the agent
    console.log('[TEMPLATE] Checking author:', agent.authorId, 'vs user:', req.user!.id);
    if (agent.authorId !== req.user!.id) {
      console.log('[TEMPLATE] Error: User is not the author of the agent');
      res.status(403).json({ error: 'You can only convert your own agents to templates' });
      return;
    }

    // Create template from agent using any type to bypass TypeScript error
    console.log('[TEMPLATE] Creating template from agent using type assertion...');
    const template = await (templateService as any).createTemplateFromAgent(agentId);

    if (!template) {
      console.log('[TEMPLATE] Error: Failed to create template');
      res.status(500).json({ error: 'Failed to convert agent to template' });
      return;
    }

    // Log the conversion for audit purposes
    console.log(`[TEMPLATE] Agent "${agent.name}" converted to template by user ${req.user!.id}`);
    console.log('[TEMPLATE] Template created:', template.id, template.name);

    res.status(201).json(template);
  } catch (error) {
    console.error('Error converting agent to template:', error);
    res.status(500).json({ error: 'Failed to convert agent to template', details: String(error) });
  }
});

export default router;
