import { Router } from 'express';
import { RepositoryFactory, Neo4jAgentTemplateRepository } from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import { Request, Response } from 'express';
import { getConnection } from '@starships/models';

const router: Router = Router();

// Get all templates
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const templateService = await RepositoryFactory.getAgentTemplateService();
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
    const templateService = await RepositoryFactory.getAgentTemplateService();
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
    const { agentName } = req.body;

    if (!agentName || !agentName.trim()) {
      res.status(400).json({ error: 'Agent name is required' });
      return;
    }

    const templateService = await RepositoryFactory.getAgentTemplateService();

    // Check if template exists first
    const template = await templateService.getTemplateById(templateId);

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Create agent from template
    const agent = await templateService.createAgentFromTemplate(
      templateId,
      agentName.trim(),
      req.user!.id
    );

    // Log the creation for audit purposes
    console.log(
      `[TEMPLATE] Agent "${agent.name}" created from template "${template.name}" by user ${req.user!.id}`
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
    const templateService = await RepositoryFactory.getAgentTemplateService();

    // Check if agent exists and is public
    console.log('[TEMPLATE] Getting agent repository...');
    const agentRepository = await RepositoryFactory.getAgentRepository();
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
