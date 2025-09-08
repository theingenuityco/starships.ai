import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { ConversationService } from '@/services/ConversationService';
import { MemoryService } from '@/services/MemoryService';
import { StreamingService } from '@/services/StreamingService';
import { createPaginationMeta, handleCommonError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';

const router: Router = Router();

// Zod schemas for validation
const NanoidSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const ConversationSourceSchema = z.enum(['agent', 'user']);

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
 * POST /conversations/:conversationId/messages - Send message to agent (supports streaming)
 */
router.post('/conversations/:conversationId/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: NanoidSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    // Validate request body with streaming support
    const bodyValidation = validateData(
      z.object({
        agentId: z.string().min(1, 'agentId is required'),
        message: z.string().min(1, 'message is required'),
        stream: z.boolean().optional().default(false),
      }),
      req.body,
      res,
      'conversation message'
    );
    if (!bodyValidation) return;

    const { conversationId } = paramValidation;
    const { agentId, message, stream } = bodyValidation;
    const userId = req.user!.id;

    const conversationService = new ConversationService();

    if (stream) {
      // Handle streaming request - return streamId immediately, process in background
      const streamId = StreamingService.generateStreamId();

      // Return streamId immediately so client can connect to SSE endpoint
      sendSuccess(res, { streamId, status: 'streaming_started' }, 200);

      // Process message with streaming in background (don't await)
      conversationService
        .addMessageWithStreaming({
          conversationId,
          agentId,
          userId,
          message,
          streamId,
        })
        .catch((error) => {
          console.error('❌ [STREAMING] Background streaming failed:', error);
          // Error will be handled by the streaming service
        });
    } else {
      // Handle regular (non-streaming) request
      const result = await conversationService.addMessage({
        conversationId,
        agentId,
        userId,
        message,
      });

      sendSuccess(res, result);
    }
  } catch (error) {
    if (!handleCommonError(error, res, 'processing conversation message')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to process conversation message');
    }
  }
});

/**
 * DELETE /conversations/:conversationId/memory - Clear conversation memory
 */
router.delete('/conversations/:conversationId/memory', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: NanoidSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    const { conversationId } = paramValidation;

    // Verify conversation exists
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    // Clear conversation memory using service layer
    const memoryService = new MemoryService();
    await memoryService.clearConversationSessionMemory(conversationId);

    sendSuccess(res, { message: 'Conversation memory cleared successfully' }, 200);
  } catch (error) {
    if (!handleCommonError(error, res, 'clearing conversation memory')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to clear conversation memory');
    }
  }
});

/**
 * GET /conversations/:conversationId - Get conversation details with messages
 */
router.get('/conversations/:conversationId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: NanoidSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { conversationId } = paramValidation;
    const { page, limit } = paginationValidation;

    // Use service layer for consistent data access
    const conversationService = new ConversationService();
    const conversationWithMessages = await conversationService.getConversationWithMessages(conversationId, limit, (page - 1) * limit);

    if (!conversationWithMessages) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    const paginationMeta = createPaginationMeta(page, limit, conversationWithMessages.messages.length);
    sendSuccess(res, conversationWithMessages, 200, paginationMeta);
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching conversation details')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch conversation details');
    }
  }
});

/**
 * GET /starships/:starshipId/conversations - Get conversations by starship
 */
router.get('/starships/:starshipId/conversations', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate starshipId parameter
    const paramValidation = validateData(z.object({ starshipId: NanoidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { starshipId } = paramValidation;
    const { page, limit } = paginationValidation;

    // Use service layer to get conversations by starship
    const conversationService = new ConversationService();
    const allConversations = await conversationService.getConversationsByStarship(starshipId);

    // Apply pagination
    const offset = (page - 1) * limit;
    const conversations = allConversations.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, allConversations.length);
    sendSuccess(res, conversations, 200, paginationMeta);
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching starship conversations')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starship conversations');
    }
  }
});

/**
 * GET /users/:userId/conversations - Get conversations for user
 */
router.get('/users/:userId/conversations', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate userId parameter
    const paramValidation = validateData(z.object({ userId: NanoidSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { userId: targetUserId } = paramValidation;
    const { page, limit } = paginationValidation;
    const userId = req.user!.id;

    // Users can only access their own conversations
    if (targetUserId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied', 403);
      return;
    }

    // Use service layer to get conversations by user
    const conversationService = new ConversationService();
    const allConversations = await conversationService.getConversationsByUser(targetUserId);

    // Apply pagination
    const offset = (page - 1) * limit;
    const conversations = allConversations.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, allConversations.length);
    sendSuccess(res, conversations, 200, paginationMeta);
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching user conversations')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch user conversations');
    }
  }
});

/**
 * POST /conversations - Create new conversation
 */
router.post('/conversations', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        source: ConversationSourceSchema,
        metadata: z.object({}).passthrough().optional(),
        starshipId: NanoidSchema.optional(),
        userId: NanoidSchema.optional(),
      }),
      req.body,
      res,
      'conversation creation data'
    );
    if (!bodyValidation) return;

    const { metadata, starshipId, userId } = bodyValidation;

    const conversationService = new ConversationService();
    const conversation = await conversationService.createConversation({
      metadata,
      starshipId,
      userId,
    });

    sendSuccess(res, conversation, 201);
  } catch (error) {
    if (!handleCommonError(error, res, 'creating conversation')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create conversation');
    }
  }
});

/**
 * PATCH /conversations/:conversationId/status - Update conversation status
 */
router.patch('/conversations/:conversationId/status', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: NanoidSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        status: z.enum(['active', 'paused', 'completed', 'archived']),
      }),
      req.body,
      res,
      'conversation status update'
    );
    if (!bodyValidation) return;

    const { conversationId } = paramValidation;
    const { status } = bodyValidation;

    // Use service layer to update conversation status
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    // Update status using appropriate method
    switch (status) {
      case 'completed':
        await conversationService.completeConversation(conversationId);
        break;
      case 'archived':
        await conversationService.archiveConversation(conversationId);
        break;
      default:
        await conversationService.updateConversationStatus(conversationId, status);
        break;
    }

    const updatedConversation = await conversationService.getConversationById(conversationId);
    sendSuccess(res, updatedConversation, 200);
  } catch (error) {
    if (!handleCommonError(error, res, 'updating conversation status')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update conversation status');
    }
  }
});

/**
 * DELETE /conversations/:conversationId - Delete conversation
 */
router.delete('/conversations/:conversationId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: NanoidSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    const { conversationId } = paramValidation;

    // Verify conversation exists
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    const deleted = await conversationService.deleteConversation(conversationId);

    if (deleted) {
      sendSuccess(res, { message: 'Conversation deleted successfully' }, 200);
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete conversation');
    }
  } catch (error) {
    if (!handleCommonError(error, res, 'deleting conversation')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete conversation');
    }
  }
});

export default router;
