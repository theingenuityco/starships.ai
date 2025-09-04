import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { StarshipRepository, NativeToolApiKeyRepository } from '@starships/models';
import type { StandardErrorCode } from '@starships/protocol';
import { sendSuccess, sendError, handleCommonError, validateUUID } from '@/utils/responseHelpers';

const router: ExpressRouter = Router();

/**
 * Get all native tool API keys for a starship
 */
router.get('/starships/:starshipId/native-api-keys', jwtAuthMiddleware, async (req, res) => {
  try {
    const { starshipId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED' as StandardErrorCode, 'User not authenticated', 401);
      return;
    }

    // Validate starshipId format
    const { isValid, error } = validateUUID(starshipId, 'starshipId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    // Verify user owns this starship
    const starshipRepo = new StarshipRepository();
    const starship = await starshipRepo.findById(starshipId);

    if (!starship || starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED' as StandardErrorCode, 'Access denied to this starship', 403);
      return;
    }

    // Get API keys (returns decrypted keys)
    const apiKeyRepo = new NativeToolApiKeyRepository();
    const apiKeys = await apiKeyRepo.getAllApiKeys(starshipId);

    // Return keys with masked values for security
    const maskedKeys: Record<string, string> = {};
    for (const [tool, key] of Object.entries(apiKeys)) {
      const keyStr = String(key || '');
      if (keyStr && keyStr.length > 8) {
        maskedKeys[tool] =
          `${keyStr.slice(0, 4)}${'*'.repeat(keyStr.length - 8)}${keyStr.slice(-4)}`;
      } else {
        maskedKeys[tool] = keyStr ? '*'.repeat(keyStr.length) : '';
      }
    }

    sendSuccess(res, maskedKeys);
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching native API keys')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to fetch API keys');
    }
  }
});

/**
 * Save or update a native tool API key
 */
router.post('/starships/:starshipId/native-api-keys', jwtAuthMiddleware, async (req, res) => {
  try {
    const { starshipId } = req.params;
    const { toolName, apiKey } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED' as StandardErrorCode, 'User not authenticated', 401);
      return;
    }

    // Validate starshipId format
    const { isValid, error } = validateUUID(starshipId, 'starshipId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    if (!toolName || !apiKey) {
      sendError(
        res,
        'MISSING_REQUIRED_FIELD' as StandardErrorCode,
        'Tool name and API key are required',
        400,
        {
          required_fields: ['toolName', 'apiKey'],
          provided: { toolName: !!toolName, apiKey: !!apiKey },
        }
      );
      return;
    }

    // Verify user owns this starship
    const starshipRepo = new StarshipRepository();
    const starship = await starshipRepo.findById(starshipId);

    if (!starship || starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED' as StandardErrorCode, 'Access denied to this starship', 403);
      return;
    }

    // Save the API key (it will be encrypted)
    const apiKeyRepo = new NativeToolApiKeyRepository();
    await apiKeyRepo.saveApiKey(starshipId, toolName, apiKey);

    // Save additional config if provided - commented out since GitHub was removed
    // if (config && Object.keys(config).length > 0) {
    //   await apiKeyRepo.saveToolConfig(starshipId, toolName, config);
    // }

    sendSuccess(res, { message: 'API key saved successfully' }, 201);
  } catch (error) {
    if (!handleCommonError(error, res, 'saving native API key')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to save API key');
    }
  }
});

/**
 * Delete a native tool API key
 */
router.delete(
  '/starships/:starshipId/native-api-keys/:toolName',
  jwtAuthMiddleware,
  async (req, res) => {
    try {
      const { starshipId, toolName } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        sendError(
          res,
          'AUTHENTICATION_REQUIRED' as StandardErrorCode,
          'User not authenticated',
          401
        );
        return;
      }

      // Validate starshipId format
      const { isValid, error } = validateUUID(starshipId, 'starshipId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }

      // Verify user owns this starship
      const starshipRepo = new StarshipRepository();
      const starship = await starshipRepo.findById(starshipId);

      if (!starship || starship.ownerId !== userId) {
        sendError(res, 'ACCESS_DENIED' as StandardErrorCode, 'Access denied to this starship', 403);
        return;
      }

      // Delete the API key
      const apiKeyRepo = new NativeToolApiKeyRepository();
      await apiKeyRepo.deleteApiKey(starshipId, toolName);

      sendSuccess(res, { message: 'API key deleted successfully' });
    } catch (error) {
      if (!handleCommonError(error, res, 'deleting native API key')) {
        sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to delete API key');
      }
    }
  }
);

export default router;
