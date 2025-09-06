import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { AgentService } from '@/services';
import { ConversationService } from '@/services/ConversationService';
import getStore from '@/store';
import { createPaginationMeta, handleCommonError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { MessageRepository } from '@starships/models';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';

const router: Router = Router();

// Zod schemas for validation
const UuidSchema = z.string().uuid('Invalid UUID format');
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
 * POST /conversations/:conversationId/messages - Send message to agent
 */
router.post('/conversations/:conversationId/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: UuidSchema }), req.params, res, 'conversation parameter');
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

    // Execute agent chat (using the same agent service that expects sessionId for backward compatibility)
    const response = await AgentService.executeChat({
      source: 'user',
      agentId,
      userId,
      message,
      conversationId: conversationId,
      stream: false,
    });

    // Update conversation metrics
    await Promise.all([
      conversationService.updateConversationActivity(conversationId),
      conversationService.incrementMessageCount(conversationId),
    ]);

    sendSuccess(res, {
      reply: response.content,
      usage: response.usage,
    });
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
    const paramValidation = validateData(z.object({ conversationId: UuidSchema }), req.params, res, 'conversation parameter');
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

    // Clear conversation memory
    const store = getStore();
    await store.clear(conversationId);

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
    const paramValidation = validateData(z.object({ conversationId: UuidSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { conversationId } = paramValidation;
    const { page, limit } = paginationValidation;

    // Get conversation details
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    // Fetch conversation messages with pagination
    const offset = (page - 1) * limit;
    const messageRepository = new MessageRepository();
    const messages = await messageRepository.findByConversationId(conversationId, limit, offset);

    const paginationMeta = createPaginationMeta(page, limit, messages.length);

    sendSuccess(
      res,
      {
        ...conversation,
        messages,
      },
      200,
      paginationMeta
    );
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
    const paramValidation = validateData(z.object({ starshipId: UuidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { starshipId } = paramValidation;
    const { page, limit } = paginationValidation;

    // For now, return empty array since conversations don't have direct starship relationships
    // In the future, you might implement starship-conversation relationships
    const conversations: any[] = [];
    const total = 0;

    // Create pagination metadata
    const paginationMeta = createPaginationMeta(page, limit, total);
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
    const paramValidation = validateData(z.object({ userId: UuidSchema }), req.params, res, 'user parameter');
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

    // For now, return empty array since conversations don't have direct user relationships
    // In the future, you might implement user-conversation relationships
    const conversations: any[] = [];
    const total = 0;

    const paginationMeta = createPaginationMeta(page, limit, total);
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
      }),
      req.body,
      res,
      'conversation creation data'
    );
    if (!bodyValidation) return;

    const { metadata } = bodyValidation;

    const conversationService = new ConversationService();
    const conversation = await conversationService.createConversation({ metadata });

    sendSuccess(res, conversation, 201);
  } catch (error) {
    if (!handleCommonError(error, res, 'creating conversation')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create conversation');
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
    const paramValidation = validateData(z.object({ conversationId: UuidSchema }), req.params, res, 'conversation parameter');
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
