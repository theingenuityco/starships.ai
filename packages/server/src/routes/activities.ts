import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { RepositoryFactory } from '@starships/models';
import type { Request, Response } from 'express';
import type { CreateActivityRequest, Activity } from '@starships/protocol';

const router: Router = Router();

// Create activity (webhook endpoint for n8n)
router.post('/api/expeditions/:expeditionId/activities', async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const { type, description, agentId, metadata }: CreateActivityRequest = req.body;

    // Validate webhook key if not authenticated
    const webhookKey = req.headers['x-webhook-key'];
    const expectedKey = process.env.N8N_WEBHOOK_KEY || '[N8N-WEBHOOK-KEY]';
    
    if (!req.user && webhookKey !== expectedKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const activityRepo = RepositoryFactory.getActivityRepository();
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();

    // Verify expedition exists
    const expedition = await expeditionRepo.findById(expeditionId);
    if (!expedition) {
      res.status(404).json({ error: 'Expedition not found' });
      return;
    }

    // Create activity
    const activity = await activityRepo.create({
      expeditionId,
      type,
      description,
      agentId,
      timestamp: new Date().toISOString(),
      status: metadata?.progress === 100 ? 'completed' : 'in_progress',
      metadata
    });

    res.json({ activity });
  } catch (error) {
    console.error('Failed to create activity:', error);
    res.status(500).json({ 
      error: 'Failed to create activity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get expedition activities
router.get('/api/expeditions/:expeditionId/activities', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;

    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const activityRepo = RepositoryFactory.getActivityRepository();
    const starshipRepo = RepositoryFactory.getStarshipRepository();

    // Verify expedition exists and user has access
    const expedition = await expeditionRepo.findById(expeditionId);
    if (!expedition) {
      res.status(404).json({ error: 'Expedition not found' });
      return;
    }

    const starship = await starshipRepo.findById(expedition.starshipId);
    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get activities
    const activities = await activityRepo.findByExpeditionId(expeditionId);
    
    res.json({ activities });
  } catch (error) {
    console.error('Failed to get activities:', error);
    res.status(500).json({ 
      error: 'Failed to get activities',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update activity status (webhook endpoint for n8n)
router.patch('/api/activities/:activityId/status', async (req: Request, res: Response) => {
  try {
    const { activityId } = req.params;
    const { status } = req.body;

    // Validate webhook key if not authenticated
    const webhookKey = req.headers['x-webhook-key'];
    const expectedKey = process.env.N8N_WEBHOOK_KEY || '[N8N-WEBHOOK-KEY]';
    
    if (!req.user && webhookKey !== expectedKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const activityRepo = RepositoryFactory.getActivityRepository();

    // Verify activity exists
    const activity = await activityRepo.findById(activityId);
    if (!activity) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    // Update status
    await activityRepo.updateStatus(activityId, status);

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update activity status:', error);
    res.status(500).json({ 
      error: 'Failed to update activity status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;