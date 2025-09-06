import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { handleCommonError, sendError, sendSuccess, validateUUID } from '@/utils/responseHelpers';
import type { StandardErrorCode } from '@starships/protocol';
import type { Router as ExpressRouter } from 'express';
import { Router } from 'express';
import { NativeApiKeyService } from '../services/NativeApiKeyService';

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

    // Delegate to service layer
    const apiKeyService = new NativeApiKeyService();
    const maskedKeys = await apiKeyService.getStarshipApiKeys(starshipId, userId);
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
      sendError(res, 'MISSING_REQUIRED_FIELD' as StandardErrorCode, 'Tool name and API key are required', 400, {
        required_fields: ['toolName', 'apiKey'],
        provided: { toolName: !!toolName, apiKey: !!apiKey },
      });
      return;
    }

    // Delegate to service layer
    const apiKeyService = new NativeApiKeyService();
    await apiKeyService.saveApiKey(starshipId, userId, toolName, apiKey);
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
router.delete('/starships/:starshipId/native-api-keys/:toolName', jwtAuthMiddleware, async (req, res) => {
  try {
    const { starshipId, toolName } = req.params;
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

    // Delegate to service layer
    const apiKeyService = new NativeApiKeyService();
    await apiKeyService.deleteApiKey(starshipId, userId, toolName);
    sendSuccess(res, { message: 'API key deleted successfully' });
  } catch (error) {
    if (!handleCommonError(error, res, 'deleting native API key')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to delete API key');
    }
  }
});

export default router;
