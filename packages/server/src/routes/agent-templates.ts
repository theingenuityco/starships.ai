import { Router } from 'express';
import { RepositoryFactory } from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import { Request, Response } from 'express';

const router: Router = Router();

// Get all templates
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const templateService = RepositoryFactory.getAgentTemplateService();
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
    const templateService = RepositoryFactory.getAgentTemplateService();
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

    const templateService = RepositoryFactory.getAgentTemplateService();

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

export default router;
