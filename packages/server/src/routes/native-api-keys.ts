import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { handleCommonError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { StandardErrorCode } from '@starships/protocol';
import type { Router as ExpressRouter } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';
import { NativeApiKeyService } from '../services/NativeApiKeyService';

const router: ExpressRouter = Router();

// Zod schemas for validation
const UuidSchema = z.string().uuid('Invalid UUID format');

const SaveApiKeySchema = z.object({
  toolName: z.string().min(1, 'Tool name is required').max(100, 'Tool name must be less than 100 characters'),
  apiKey: z.string().min(1, 'API key is required').max(500, 'API key must be less than 500 characters'),
});

// Helper function for Zod validation
const validateData = <T>(schema: z.ZodSchema<T>, data: unknown, res: any, context: string): T | null => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      const fieldName = firstError.path.join('.');

      sendError(res, 'VALIDATION_ERROR' as StandardErrorCode, firstError.message, 400, {
        field: fieldName,
        context,
        validationErrors: error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, `${context} validation error`, 500);
    }
    return null;
  }
};

// Helper function for authentication check
const checkAuth = (req: any, res: any): boolean => {
  const user = req.user;
  if (!user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED' as StandardErrorCode, 'User not authenticated', 401);
    return false;
  }
  return true;
};

/**
 * Get all native tool API keys for a starship
 */
router.get('/starships/:starshipId/native-api-keys', jwtAuthMiddleware, async (req, res) => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate starshipId parameter
    const paramValidation = validateData(z.object({ starshipId: UuidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const { starshipId } = paramValidation;
    const userId = req.user!.id;

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
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate starshipId parameter
    const paramValidation = validateData(z.object({ starshipId: UuidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(SaveApiKeySchema, req.body, res, 'API key data');
    if (!bodyValidation) return;

    const { starshipId } = paramValidation;
    const { toolName, apiKey } = bodyValidation;
    const userId = req.user!.id;

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
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate parameters
    const paramValidation = validateData(
      z.object({
        starshipId: UuidSchema,
        toolName: z.string().min(1, 'Tool name is required'),
      }),
      req.params,
      res,
      'parameters'
    );
    if (!paramValidation) return;

    const { starshipId, toolName } = paramValidation;
    const userId = req.user!.id;

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
