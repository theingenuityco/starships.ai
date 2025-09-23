import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { ConversationService } from '@/services/ConversationService';
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

      // Determine a reliable baseline:
      // - client hint (query.baselineLength) if provided
      // - server truth (current messages count)
      const clientBase = Number((req.query as any).baselineLength ?? 0) || 0;

      // Fetch existing messages first to compute server-side count
      const conversationService = new ConversationService();
      const conversationMessages = await conversationService.getConversationMessages(conversationId);
      const serverCount = conversationMessages.length;

      // Use the larger of client hint and server truth to avoid undercounting
      const baseLength = Math.max(clientBase, serverCount);

      // Establish SSE connection with normalized baseline
      streamingService.addConnection(conversationId, res, { baseLength });

      // Send only messages the client may be missing based on their baselineLength hint
      const startIndexForSend = Math.min(Math.max(clientBase, 0), serverCount);
      const messagesToSend = conversationMessages.slice(startIndexForSend);

      if (messagesToSend.length > 0) {
        for (const message of messagesToSend) {
          await streamingService.broadcastMessage(conversationId, message);
        }
      }

      // Connection stays open for live updates via StreamingService
      return;
    } else {
      // Regular JSON response mode
      // Validate pagination parameters
      const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
      if (!paginationValidation) return;

      // Validate query parameters for ordering
      const orderValidation = validateData(
        z.object({
          orderBy: z.enum(['createdAt']).optional(),
          orderDirection: z.enum(['asc', 'desc']).optional(),
        }),
        req.query,
        res,
        'order parameters'
      );
      if (!orderValidation) return;

      // Delegate to service layer
      const conversationService = new ConversationService();
      const messages = await conversationService.getConversationMessages(
        conversationId,
        orderValidation.orderBy,
        orderValidation.orderDirection
      );

      // Verify conversation exists
      const conversation = await conversationService.getConversationById(conversationId);
      if (!conversation) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
          resource: 'conversation',
          id: conversationId,
        });
        return;
      }

      // Get conversation agents to determine participants
      const agents = await conversationService.getConversationAgents(conversationId);
      const participants = agents.map((agent) => agent.id);

      // Structure response to match client expectations
      const responseData = {
        conversationId,
        messages,
        total: messages.length,
        participants,
        startedAt: conversation.createdAt,
        lastActivityAt: conversation.updatedAt || conversation.createdAt,
        agents, // Include full agent information for client
      };

      sendSuccess(res, responseData, 200);
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
        content: z.string().min(1, 'content is required'),
        // baselineLength is no longer used on POST (streaming happens over GET SSE)
        baselineLength: z.coerce.number().int().min(0).optional(),
      }),
      req.body,
      res,
      'conversation message'
    );
    if (!bodyValidation) return;

    const { conversationId } = paramValidation;
    const { content } = bodyValidation;

    // Fire-and-forget processing; live updates go over GET SSE channel (/conversations/:id/messages?stream=true)
    const conversationService = new ConversationService();
    conversationService
      .addConversationMessage(
        {
          conversationId,
          content,
          role: 'user',
          messageType: 'user_input',
        },
        { authorization: req.headers.authorization as string | undefined }
      )
      .catch((error) => {
        console.error('[ROUTE] Conversation processing failed:', error);
      });

    // Acknowledge request; client should be listening on GET SSE channel for updates
    sendSuccess(res, { status: 'accepted', streaming: true, conversationId }, 202);
  } catch (error) {
    handleError(error, res, 'processing conversation message');
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

    const { conversationId } = paramValidation;

    // Use service layer for consistent data access
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);

    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    sendSuccess(res, conversation, 200);
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
 * POST /conversations - Create new conversation
 */
router.post('/conversations', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const bodyValidation = validateData(
      z.object({
        title: z.string().min(1).max(100).optional(),
        starshipId: NanoidSchema.optional(),
        agentId: NanoidSchema.optional(),
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
