import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { createSessionService } from '@/services/SessionService';
import getStore from '@/store';
import { createPaginationMeta, handleCommonError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { AgentRepository, MemoryRepository, MessageRepository } from '@starships/models';
import { Request, Response, Router } from 'express';
import { z, ZodError } from 'zod';

const router: Router = Router();
const sessionService = createSessionService();

// Zod schemas for validation
const UuidSchema = z.string().uuid('Invalid UUID format');
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const SessionSourceSchema = z.enum(['agent', 'user']);

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
 * POST /sessions/:sessionId/messages - Send message to agent
 */
router.post('/sessions/:sessionId/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate sessionId parameter
    const paramValidation = validateData(z.object({ sessionId: UuidSchema }), req.params, res, 'session parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        agentId: z.string().min(1, 'agentId is required'),
        message: z.string().min(1, 'message is required'),
      }),
      req.body,
      res,
      'message data'
    );
    if (!bodyValidation) return;

    const { sessionId } = paramValidation;
    const { agentId, message } = bodyValidation;
    const userId = (req as any).user!.id;

    // Verify session exists
    const session = await sessionService.getSessionById(sessionId);
    if (!session) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Session not found', 404, {
        resource: 'session',
        id: sessionId,
      });
      return;
    }

    // Process chat request
    const chatRequest = {
      source: 'agent' as const,
      agentId,
      userId,
      message,
      conversationId: sessionId,
      stream: false,
    };

    const { AgentService } = await import('../services/AgentService');
    const result = await AgentService.executeChat(chatRequest);

    // Update session metrics
    await Promise.all([sessionService.updateSessionActivity(sessionId), sessionService.incrementMessageCount(sessionId)]);

    // Track agent usage (non-blocking)
    try {
      const agentRepository = new AgentRepository();
      await agentRepository.incrementUsageCount(agentId);
    } catch (trackingError) {
      console.warn('Failed to track agent usage:', trackingError);
    }

    sendSuccess(res, result, 201);
  } catch (error) {
    if (!handleCommonError(error, res, 'processing session message')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to process session message');
    }
  }
});

/**
 * DELETE /sessions/:sessionId/memory - Clear session memory
 */
router.delete('/sessions/:sessionId/memory', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate sessionId parameter
    const paramValidation = validateData(z.object({ sessionId: UuidSchema }), req.params, res, 'session parameter');
    if (!paramValidation) return;

    const { sessionId } = paramValidation;

    // Verify session exists
    const session = await sessionService.getSessionById(sessionId);
    if (!session) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Session not found', 404, {
        resource: 'session',
        id: sessionId,
      });
      return;
    }

    // Clear session memory
    const store = getStore();
    await store.clear(sessionId);

    sendSuccess(res, { message: 'Session memory cleared successfully' }, 200);
  } catch (error) {
    if (!handleCommonError(error, res, 'clearing session memory')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to clear session memory');
    }
  }
});

/**
 * GET /messages/memory/:memoryId - Get messages by memory ID (backward compatibility)
 */
router.get('/messages/memory/:memoryId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate memoryId parameter
    const paramValidation = validateData(z.object({ memoryId: UuidSchema }), req.params, res, 'memory parameter');
    if (!paramValidation) return;

    // Validate and parse query parameters
    const queryValidation = validateData(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      req.query,
      res,
      'query parameters'
    );
    if (!queryValidation) return;

    const { memoryId } = paramValidation;
    const { limit, offset } = queryValidation;

    const messageRepository = new MessageRepository();
    const memoryRepository = new MemoryRepository();

    // Verify memory exists
    const memory = await memoryRepository.findById(memoryId);
    if (!memory) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Memory not found', 404, {
        resource: 'memory',
        id: memoryId,
      });
      return;
    }

    // Fetch messages with pagination
    const allMessages = await messageRepository.findByMemoryId(memoryId);
    const messages = allMessages.slice(offset, offset + limit);

    sendSuccess(res, {
      messages,
      memoryId,
      total: allMessages.length,
      limit,
      offset,
    });
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching session messages')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch session messages');
    }
  }
});

/**
 * GET /starships/:starshipId/sessions - Get sessions by starship (deprecated)
 */
router.get('/starships/:starshipId/sessions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate starshipId parameter
    const paramValidation = validateData(z.object({ starshipId: UuidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Validate pagination query
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { page, limit } = paginationValidation;

    // Sessions no longer have starship relationships
    const paginationMeta = createPaginationMeta(page, limit, 0);
    sendSuccess(res, [], 200, paginationMeta);
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching starship sessions')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starship sessions');
    }
  }
});

/**
 * GET /sessions/:sessionId - Get session details with messages
 */
router.get('/sessions/:sessionId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate sessionId parameter
    const paramValidation = validateData(z.object({ sessionId: UuidSchema }), req.params, res, 'session parameter');
    if (!paramValidation) return;

    // Validate pagination query
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { sessionId } = paramValidation;
    const { page, limit } = paginationValidation;

    // Get session details
    const session = await sessionService.getSessionById(sessionId);
    if (!session) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Session not found', 404, {
        resource: 'session',
        id: sessionId,
      });
      return;
    }

    // Fetch session messages with pagination
    const offset = (page - 1) * limit;
    const messageRepository = new MessageRepository();
    const messages = await messageRepository.findByConversationId(sessionId, limit, offset);

    const paginationMeta = createPaginationMeta(page, limit, messages.length);

    sendSuccess(
      res,
      {
        ...session,
        messages,
      },
      200,
      paginationMeta
    );
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching session details')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch session details');
    }
  }
});

/**
 * GET /users/:userId/sessions - Get sessions for user (deprecated)
 */
router.get('/users/:userId/sessions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate userId parameter
    const paramValidation = validateData(z.object({ userId: UuidSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    // Validate pagination query
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { userId: targetUserId } = paramValidation;
    const { page, limit } = paginationValidation;
    const userId = (req as any).user!.id;

    // Users can only access their own sessions
    if (targetUserId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied', 403);
      return;
    }

    // Sessions no longer have user relationships
    const paginationMeta = createPaginationMeta(page, limit, 0);
    sendSuccess(res, [], 200, paginationMeta);
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching user sessions')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch user sessions');
    }
  }
});

/**
 * POST /sessions - Create new session
 */
router.post('/sessions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        source: SessionSourceSchema,
        metadata: z.object({}).passthrough().optional(),
      }),
      req.body,
      res,
      'session creation data'
    );
    if (!bodyValidation) return;

    const { metadata } = bodyValidation;

    const session = await sessionService.createSession({ metadata });

    sendSuccess(res, session, 201);
  } catch (error) {
    if (!handleCommonError(error, res, 'creating session')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create session');
    }
  }
});

/**
 * DELETE /sessions/:sessionId - Delete session
 */
router.delete('/sessions/:sessionId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate sessionId parameter
    const paramValidation = validateData(z.object({ sessionId: UuidSchema }), req.params, res, 'session parameter');
    if (!paramValidation) return;

    const { sessionId } = paramValidation;

    // Verify session exists
    const session = await sessionService.getSessionById(sessionId);
    if (!session) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Session not found', 404, {
        resource: 'session',
        id: sessionId,
      });
      return;
    }

    const deleted = await sessionService.deleteSession(sessionId);

    if (deleted) {
      sendSuccess(res, { message: 'Session deleted successfully' }, 200);
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete session');
    }
  } catch (error) {
    if (!handleCommonError(error, res, 'deleting session')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete session');
    }
  }
});

export default router;
