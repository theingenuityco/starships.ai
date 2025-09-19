import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { MessageService } from '@/services/MessageService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';

const router: Router = Router();

// Zod schemas for validation
const NanoidSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');
// const PaginationSchema = z.object({
//   page: z.coerce.number().int().min(1).default(1),
//   limit: z.coerce.number().int().min(1).max(200).default(50),
// });

const CreateMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1, 'Content is required').max(50000, 'Content too long'),
  starshipId: NanoidSchema,
  agentId: NanoidSchema.optional(),
  memoryId: NanoidSchema.optional(),
  conversationId: NanoidSchema.optional(),
  parentMessageId: NanoidSchema.optional(),
  threadDepth: z.number().min(0).max(100).optional(),
  processingStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  messageType: z.enum(['user_input', 'agent_response', 'system_message', 'workflow_output', 'tool_result']).optional(),
  importance: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  metadata: z.object({}).passthrough().optional(),
  hasAttachments: z.boolean().optional(),
  tokenCount: z.number().min(0).optional(),
  processingTimeMs: z.number().min(0).optional(),
  tool_call_id: z.string().optional(), // Reference to the tool call that generated this result
});

const UpdateMessageSchema = CreateMessageSchema.partial().omit({ starshipId: true });

// Helper function for authentication check
const checkAuth = (req: Request, res: Response): boolean => {
  const user = req.user;
  if (!user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return false;
  }
  return true;
};

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

/**
 * GET /messages/:messageId - Get message by ID
 */
router.get('/messages/:messageId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate messageId parameter
    const paramValidation = validateData(z.object({ messageId: NanoidSchema }), req.params, res, 'message parameter');
    if (!paramValidation) return;

    const { messageId } = paramValidation;

    // Delegate to service layer
    const messageService = new MessageService();
    const message = await messageService.getMessage(messageId);

    if (!message) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Message not found', 404, {
        resource: 'message',
        id: messageId,
      });
      return;
    }

    sendSuccess(res, message, 200);
  } catch (error) {
    handleError(error, res, 'fetching message');
  }
});

/**
 * PUT /messages/:messageId - Update message
 */
router.put('/messages/:messageId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate messageId parameter
    const paramValidation = validateData(z.object({ messageId: NanoidSchema }), req.params, res, 'message parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(UpdateMessageSchema, req.body, res, 'message update data');
    if (!bodyValidation) return;

    const { messageId } = paramValidation;

    // Delegate to service layer
    const messageService = new MessageService();
    const updatedMessage = await messageService.updateMessage(messageId, bodyValidation);

    if (!updatedMessage) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Message not found', 404, {
        resource: 'message',
        id: messageId,
      });
      return;
    }

    sendSuccess(res, updatedMessage, 200);
  } catch (error) {
    handleError(error, res, 'updating message');
  }
});

/**
 * DELETE /messages/:messageId - Delete message
 */
router.delete('/messages/:messageId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate messageId parameter
    const paramValidation = validateData(z.object({ messageId: NanoidSchema }), req.params, res, 'message parameter');
    if (!paramValidation) return;

    const { messageId } = paramValidation;

    // Delegate to service layer
    const messageService = new MessageService();
    const deleted = await messageService.deleteMessage(messageId);

    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Message not found', 404, {
        resource: 'message',
        id: messageId,
      });
      return;
    }

    sendSuccess(res, { message: 'Message deleted successfully' }, 200);
  } catch (error) {
    handleError(error, res, 'deleting message');
  }
});

export default router;
