import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { MemoryService } from '@/services/MemoryService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';

const router: Router = Router();

// Zod schemas for validation
const IdSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');

const ResetMemorySchema = z.object({
  agentId: IdSchema,
});

// Helper function for Zod validation
const validateData = <T>(schema: z.ZodSchema<T>, data: unknown, res: Response, context: string): T | null => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      const fieldName = firstError.path.join('.');

      sendError(res, 'VALIDATION_ERROR', firstError.message, 400, {
        field: fieldName,
        context,
        validationErrors: error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', `${context} validation error`, 500);
    }
    return null;
  }
};

// POST /memory/reset - Clear memory for agent and user (OpenAPI pattern)
router.post('/memory/reset', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate request body
    const bodyValidation = validateData(ResetMemorySchema, req.body, res, 'memory reset data');
    if (!bodyValidation) return;

    const { agentId } = bodyValidation;

    // Delegate to service layer
    const memoryService = new MemoryService();
    await memoryService.clearAgentSessionMemory(agentId, userId);

    sendSuccess(res, { message: 'Memory cleared successfully' }, 200);
  } catch (error) {
    handleError(error, res, 'clearing memory');
  }
});

export default router;
