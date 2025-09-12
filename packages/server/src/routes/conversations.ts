import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { MessageService } from '@/services';
import { ConversationService } from '@/services/ConversationService';
import { MemoryService } from '@/services/MemoryService';
import { StreamingService } from '@/services/StreamingService';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
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
 * GET /conversations/:conversationId/messages - Get conversation messages (supports streaming for live updates)
 */
router.get('/conversations/:conversationId/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: NanoidSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    const { conversationId } = paramValidation;

    // Check if streaming is requested
    const wantsStreaming = req.get('Accept')?.includes('text/event-stream') || req.query.stream === 'true';

    if (wantsStreaming) {
      // Add connection to streaming service - it will handle SSE headers and setup
      const streamingService = new StreamingService();
      streamingService.addConnection(conversationId, res);

      // Send existing messages after connection is established
      const messageService = new MessageService();
      const conversationData = await messageService.getConversation({
        conversationId,
        limit: 1000, // Get all existing messages
        offset: 0,
        orderBy: 'timestamp',
        orderDirection: 'desc', // Consistent with API mode
      });

      if (conversationData && conversationData.messages.length > 0) {
        // Send existing messages via StreamingService
        for (const message of conversationData.messages) {
          await streamingService.broadcastMessage(conversationId);
        }
      }

      // Connection stays open for live updates via StreamingService
      return;
    } else {
      // Regular JSON response mode
      // Validate pagination parameters
      const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
      if (!paginationValidation) return;

      const { page, limit } = paginationValidation;

      // Validate query parameters for ordering
      const orderValidation = validateData(
        z.object({
          orderBy: z.enum(['timestamp', 'created_at']).optional(),
          orderDirection: z.enum(['asc', 'desc']).optional(),
        }),
        req.query,
        res,
        'order parameters'
      );
      if (!orderValidation) return;

      // Delegate to service layer
      const messageService = new MessageService();
      const conversationData = await messageService.getConversation({
        conversationId,
        limit,
        offset: (page - 1) * limit,
        orderBy: orderValidation.orderBy,
        orderDirection: orderValidation.orderDirection,
      });

      if (!conversationData) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
          resource: 'conversation',
          id: conversationId,
        });
        return;
      }

      const paginationMeta = createPaginationMeta(page, limit, conversationData.total);
      sendSuccess(res, conversationData, 200, paginationMeta);
    }
  } catch (error) {
    handleError(error, res, 'fetching conversation messages');
  }
});

/**
 * POST /conversations/:conversationId/messages - Send message to agent (supports unified streaming)
 */
router.post('/conversations/:conversationId/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: NanoidSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        agentId: z.string().min(1, 'agentId is required'),
        message: z.string().min(1, 'message is required'),
      }),
      req.body,
      res,
      'conversation message'
    );
    if (!bodyValidation) return;

    const { conversationId } = paramValidation;
    const { agentId, message } = bodyValidation;
    const userId = req.user!.id;

    // Detect streaming request via Accept header
    const wantsStreaming = req.get('Accept')?.includes('text/event-stream');

    const conversationService = new ConversationService();

    if (wantsStreaming) {
      // Add connection to streaming service - it will handle SSE headers and setup
      // This automatically sends connection confirmation via sendEvent('connection', ...)
      const streamingService = new StreamingService();
      streamingService.addConnection(conversationId, res);

      // Process conversation with streaming (async - don't await)
      // Using conversationId as stream identifier - much simpler!
      conversationService
        .addMessage({
          conversationId,
          agentId,
          userId,
          message,
        })
        .catch((error: any) => {
          console.error('❌ [UNIFIED STREAMING] Processing failed:', error);
          // Error will be handled by the streaming service and conversation service
        });

      // Return early to keep connection open (similar to GET endpoint)
      return;
    } else {
      // Handle regular JSON response
      const result = await conversationService.addMessage({
        conversationId,
        agentId,
        userId,
        message,
      });

      sendSuccess(res, result);
    }
  } catch (error) {
    handleError(error, res, 'processing conversation message');
  }
});

/**
 * DELETE /conversations/:conversationId/memory - Clear conversation memory
 */
router.delete('/conversations/:conversationId/memory', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
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
    handleError(error, res, 'clearing conversation memory');
  }
});

/**
 * GET /conversations/:conversationId - Get conversation details with messages
 */
router.get('/conversations/:conversationId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
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
    handleError(error, res, 'fetching conversation details');
  }
});

/**
 * GET /starships/:starshipId/conversations - Get conversations by starship
 */
router.get('/starships/:starshipId/conversations', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
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
    handleError(error, res, 'fetching starship conversations');
  }
});

/**
 * GET /users/:userId/conversations - Get conversations for user
 */
router.get('/users/:userId/conversations', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
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
    handleError(error, res, 'fetching user conversations');
  }
});

/**
 * POST /conversations - Create new conversation
 */
router.post('/conversations', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const bodyValidation = validateData(
      z.object({
        starshipId: NanoidSchema.optional(),
      }),
      req.body,
      res,
      'conversation creation data'
    );
    if (!bodyValidation) return;

    const conversationService = new ConversationService();
    const conversation = await conversationService.createConversation(req.body);

    sendSuccess(res, conversation, 201);
  } catch (error) {
    handleError(error, res, 'creating conversation');
  }
});

/**
 * PATCH /conversations/:conversationId/status - Update conversation status
 */
router.patch('/conversations/:conversationId/status', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
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
    handleError(error, res, 'updating conversation status');
  }
});

/**
 * DELETE /conversations/:conversationId - Delete conversation
 */
router.delete('/conversations/:conversationId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
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
    handleError(error, res, 'deleting conversation');
  }
});

export default router;
