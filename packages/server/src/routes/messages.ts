import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { MessageService } from '@/services/MessageService';
import { ConversationService } from '@/services/ConversationService';
import { verifyResourceAccess } from '@/middleware/verify-starship-access';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';

const router: Router = Router();

// Zod schemas for validation

const CreateMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1, 'Content is required').max(50000, 'Content too long'),
  starshipId: IdSchema,
  agentId: IdSchema.optional(),
  memoryId: IdSchema.optional(),
  conversationId: IdSchema.optional(),
  parentMessageId: IdSchema.optional(),
  linkedConversationId: IdSchema.optional(),
  threadDepth: z.number().min(0).max(100).optional(),
  processingStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  messageType: z
    .enum(['user_input', 'agent_response', 'system_notification', 'system_instruction', 'workflow_output', 'error', 'tool_result'])
    .optional(),
  importance: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  metadata: z.object({}).passthrough().optional(),
  hasAttachments: z.boolean().optional(),
  tokenCount: z.number().min(0).optional(),
  processingTimeMs: z.number().min(0).optional(),
  toolCallId: z.string().optional(), // Reference to the tool call that generated this result
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

/**
 * POST /messages - Create a message (no agent processing)
 *
 * NOTE:
 * This endpoint ONLY persists a message. It does not trigger ConversationService processing
 * (unlike POST /conversations/:conversationId/messages).
 *
 * Used for inserting hidden system context (e.g. thread context seed) into a conversation history.
 */
router.post('/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidation = validateData(CreateMessageSchema, req.body, res, 'create message');
    if (!bodyValidation) return;

    const conversationId = typeof bodyValidation.conversationId === 'string' ? bodyValidation.conversationId : '';
    if (!conversationId) {
      sendError(res, 'VALIDATION_ERROR', 'conversationId is required', 400, { field: 'conversationId' });
      return;
    }

    // Verify conversation exists + access
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { resource: 'conversation', id: conversationId });
      return;
    }

    const authUserId = req.user?.id as string;
    if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) return;

    // Safety: ensure starshipId matches the conversation's starship
    if (String(bodyValidation.starshipId) !== String(conversation.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'starshipId does not match conversation', 400, {
        starshipId: bodyValidation.starshipId,
        conversationStarshipId: conversation.starshipId,
      });
      return;
    }

    const messageService = new MessageService();
    const created = await messageService.createMessage({
      ...(bodyValidation as any),
      conversationId,
      // Attribute to the caller for auditing (even for system messages).
      userId: authUserId,
    });

    sendSuccess(res, created, 201);
  } catch (error) {
    handleError(error, res, 'creating message');
  }
});

/**
 * GET /messages/:messageId - Get message by ID
 */
router.get('/messages/:messageId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate messageId parameter
    const paramValidation = validateData(z.object({ messageId: IdSchema }), req.params, res, 'message parameter');
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
    const paramValidation = validateData(z.object({ messageId: IdSchema }), req.params, res, 'message parameter');
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
    const paramValidation = validateData(z.object({ messageId: IdSchema }), req.params, res, 'message parameter');
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
