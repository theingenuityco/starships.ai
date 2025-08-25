import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { RepositoryFactory } from '@starships/models';

const router: ExpressRouter = Router();

/**
 * Get all native tool API keys for a starship
 */
router.get('/starships/:starshipId/native-api-keys', authMiddleware, async (req, res) => {
  try {
    const { starshipId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Verify user owns this starship
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(starshipId);

    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get API keys (returns decrypted keys)
    const apiKeyRepo = RepositoryFactory.getNativeToolApiKeyRepository();
    const apiKeys = await apiKeyRepo.getAllApiKeys(starshipId);

    // Return keys with masked values for security
    const maskedKeys: Record<string, string> = {};
    for (const [tool, key] of Object.entries(apiKeys)) {
      const keyStr = String(key || '');
      if (keyStr && keyStr.length > 8) {
        maskedKeys[tool] = `${keyStr.slice(0, 4)}${'*'.repeat(keyStr.length - 8)}${keyStr.slice(-4)}`;
      } else {
        maskedKeys[tool] = keyStr ? '*'.repeat(keyStr.length) : '';
      }
    }

    res.json(maskedKeys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

/**
 * Save or update a native tool API key
 */
router.post('/starships/:starshipId/native-api-keys', authMiddleware, async (req, res) => {
  try {
    const { starshipId } = req.params;
    const { toolName, apiKey, config } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!toolName || !apiKey) {
      res.status(400).json({ error: 'Tool name and API key are required' });
      return;
    }

    // Verify user owns this starship
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(starshipId);

    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Save the API key (it will be encrypted)
    const apiKeyRepo = RepositoryFactory.getNativeToolApiKeyRepository();
    await apiKeyRepo.saveApiKey(starshipId, toolName, apiKey);
    
    // Save additional config if provided - commented out since GitHub was removed
    // if (config && Object.keys(config).length > 0) {
    //   await apiKeyRepo.saveToolConfig(starshipId, toolName, config);
    // }

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving API key:', error);
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

/**
 * Delete a native tool API key
 */
router.delete('/starships/:starshipId/native-api-keys/:toolName', authMiddleware, async (req, res) => {
  try {
    const { starshipId, toolName } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Verify user owns this starship
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(starshipId);

    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Delete the API key
    const apiKeyRepo = RepositoryFactory.getNativeToolApiKeyRepository();
    await apiKeyRepo.deleteApiKey(starshipId, toolName);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export default router;