import { MemoryRepository, MessageRepository } from '@starships/models';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { SessionService } from '@/services/SessionService';
import {
  createPaginationMeta,
  handleCommonError,
  sendError,
  sendSuccess,
  validatePagination,
  validateUUID,
} from '@/utils/responseHelpers';

const router: Router = Router();

/**
 * Error helper consistent with project patterns
 */
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

// POST /sessions/:sessionId/messages - Send message to agent (OpenAPI pattern)
router.post(
  '/sessions/:sessionId/messages',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;
      const { agentId, message } = req.body;

      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      // Validate required fields
      if (!agentId || typeof agentId !== 'string') {
        sendError(res, 'MISSING_REQUIRED_FIELD', 'agentId is required and must be a string', 400, {
          field: 'agentId',
          provided: typeof agentId,
        });
        return;
      }

      if (!message || typeof message !== 'string') {
        sendError(res, 'MISSING_REQUIRED_FIELD', 'message is required and must be a string', 400, {
          field: 'message',
          provided: typeof message,
        });
        return;
      }

      // Validate sessionId format
      const sessionValidation = validateUUID(sessionId, 'sessionId');
      if (!sessionValidation.isValid && sessionValidation.error) {
        sendError(
          res,
          sessionValidation.error.code,
          sessionValidation.error.message,
          400,
          sessionValidation.error.details
        );
        return;
      }

      // Validate agentId format
      const { isValid, error } = validateUUID(agentId, 'agentId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }

      // Verify session exists
      const session = await SessionService.getSessionById(sessionId);
      if (!session) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Session not found', 404, {
          resource: 'session',
          id: sessionId,
        });
        return;
      }

      // Build chat request using session and authenticated user
      const chatRequest = {
        source: 'agent' as const,
        agentId,
        userId,
        message,
        conversationId: sessionId, // Use sessionId as conversationId for compatibility
        stream: false,
      };

      console.log(
        `[SESSION] Processing message for authenticated user: ${userId} in session: ${sessionId}`
      );

      // Import AgentService dynamically to avoid circular dependencies
      const { AgentService } = await import('../services/AgentService');
      const result = await AgentService.executeChat(chatRequest);

      // Update session activity and message count
      await SessionService.updateSessionActivity(sessionId);
      await SessionService.incrementMessageCount(sessionId);

      // Track agent usage after successful chat
      try {
        await AgentService.trackUsage(chatRequest.agentId!);
        console.log(`[ANALYTICS] Tracked usage for agent: ${chatRequest.agentId}`);
      } catch (trackingError) {
        // Don't fail the chat request if usage tracking fails
        console.warn('Failed to track agent usage:', trackingError);
      }

      sendSuccess(res, result, 201);
    } catch (error) {
      if (!handleCommonError(error, res, 'processing session message')) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to process session message');
      }
    }
  }
);

// DELETE /sessions/:sessionId/memory - Clear memory for a session (OpenAPI pattern)
router.delete(
  '/sessions/:sessionId/memory',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      // Validate sessionId format
      const { isValid, error } = validateUUID(sessionId, 'sessionId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }

      // Verify session exists
      const session = await SessionService.getSessionById(sessionId);
      if (!session) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Session not found', 404, {
          resource: 'session',
          id: sessionId,
        });
        return;
      }

      // Import AgentService dynamically to avoid circular dependencies
      const { AgentService } = await import('../services/AgentService');
      const store = AgentService.getMemoryStore();
      await store.clear(sessionId);

      sendSuccess(res, { message: 'Session memory cleared successfully' }, 200);
    } catch (error) {
      if (!handleCommonError(error, res, 'clearing session memory')) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to clear session memory');
      }
    }
  }
);

// GET endpoint for fetching messages by memory ID (kept for backward compatibility)
router.get(
  '/messages/memory/:memoryId',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { memoryId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      // Validate memoryId is a UUID
      const memoryValidation = validateUUID(memoryId, 'memoryId');
      if (!memoryValidation.isValid && memoryValidation.error) {
        sendError(
          res,
          memoryValidation.error.code,
          memoryValidation.error.message,
          400,
          memoryValidation.error.details
        );
        return;
      }

      // Parse limit and offset parameters
      const limit = Math.floor(parseInt(req.query.limit as string) || 50);
      const offset = Math.floor(parseInt(req.query.offset as string) || 0);

      // Validate limit range
      if (limit < 1 || limit > 200) {
        sendError(res, 'VALIDATION_ERROR', 'Limit must be between 1 and 200', 400, {
          field: 'limit',
          provided: limit,
          constraint: 'between 1 and 200',
        });
        return;
      }

      if (offset < 0) {
        sendError(res, 'VALIDATION_ERROR', 'Offset must be non-negative', 400, {
          field: 'offset',
          provided: offset,
          constraint: 'non-negative',
        });
        return;
      }

      const messageRepository = new MessageRepository();
      const memoryRepository = new MemoryRepository();

      // First, verify the memory exists
      const memory = await memoryRepository.findById(memoryId);
      if (!memory) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Memory not found', 404, {
          resource: 'memory',
          id: memoryId,
        });
        return;
      }

      // Fetch messages for the memory with pagination
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
  }
);

// GET /starships/:starshipId/sessions - Fetch sessions by starship (OpenAPI pattern)
router.get(
  '/starships/:starshipId/sessions',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { starshipId } = req.params;
      const userId = req.user?.id;

      console.log('🚀 [SESSION ROUTE] GET starships/:starshipId/sessions endpoint called:', {
        starshipId,
        userId,
        userObject: req.user,
        headers: req.headers.authorization ? 'Bearer token present' : 'No auth header',
        timestamp: new Date().toISOString(),
      });

      if (!userId) {
        console.error('🚀 [SESSION ROUTE] User not authenticated - missing userId');
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      // Validate starshipId format
      const { isValid, error } = validateUUID(starshipId, 'starshipId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }

      console.log('🚀 [SESSION ROUTE] StarshipId validation passed:', starshipId);

      // Parse and validate pagination parameters
      const pagination = validatePagination(req.query.page as string, req.query.limit as string);
      if (pagination.error) {
        sendError(res, pagination.error.code, pagination.error.message, 400);
        return;
      }

      console.log('🚀 [SESSION ROUTE] Calling SessionService with params:', {
        starshipId,
        pagination,
      });

      // Since sessions no longer have starship relationships, return empty array
      const paginationMeta = createPaginationMeta(pagination.page, pagination.limit, 0);

      console.log(
        '🚀 [SESSION ROUTE] Sessions no longer have starship relationships - returning empty array'
      );

      sendSuccess(res, [], 200, paginationMeta);
    } catch (error) {
      if (!handleCommonError(error, res, 'fetching starship sessions')) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starship sessions');
      }
    }
  }
);

// GET /sessions/:sessionId - Fetch session details (OpenAPI pattern)
router.get(
  '/sessions/:sessionId',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      // Validate sessionId format
      const { isValid, error } = validateUUID(sessionId, 'sessionId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }

      // Get session details
      const session = await SessionService.getSessionById(sessionId);
      if (!session) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Session not found', 404, {
          resource: 'session',
          id: sessionId,
        });
        return;
      }

      // Parse and validate pagination parameters for messages within session
      const pagination = validatePagination(req.query.page as string, req.query.limit as string);
      if (pagination.error) {
        sendError(res, pagination.error.code, pagination.error.message, 400);
        return;
      }

      const offset = (pagination.page - 1) * pagination.limit;
      const messageRepository = new MessageRepository();

      // Fetch session messages with pagination (using sessionId as conversationId for compatibility)
      const messages = await messageRepository.findByConversationId(
        sessionId,
        pagination.limit,
        offset
      );

      const paginationMeta = createPaginationMeta(
        pagination.page,
        pagination.limit,
        messages.length
      );

      // Return session with its messages
      const sessionData = {
        ...session,
        messages: messages,
      };

      sendSuccess(res, sessionData, 200, paginationMeta);
    } catch (error) {
      if (!handleCommonError(error, res, 'fetching session details')) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch session details');
      }
    }
  }
);

// GET /users/:userId/sessions - Get sessions for a user
router.get(
  '/users/:userId/sessions',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId: targetUserId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      // Users can only access their own sessions
      if (targetUserId !== userId) {
        sendError(res, 'ACCESS_DENIED', 'Access denied', 403);
        return;
      }

      // Validate userId format
      const { isValid, error } = validateUUID(targetUserId, 'userId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }

      // Parse and validate pagination parameters
      const pagination = validatePagination(req.query.page as string, req.query.limit as string);
      if (pagination.error) {
        sendError(res, pagination.error.code, pagination.error.message, 400);
        return;
      }

      // Check if only active sessions are requested
      const onlyActive = req.query.active === 'true';

      // Since sessions no longer have user relationships, return empty array
      const paginationMeta = createPaginationMeta(pagination.page, pagination.limit, 0);

      sendSuccess(res, [], 200, paginationMeta);
    } catch (error) {
      if (!handleCommonError(error, res, 'fetching user sessions')) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch user sessions');
      }
    }
  }
);

// POST /sessions - Create a new session
router.post('/sessions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { source, agentId, starshipId, metadata } = req.body;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate required fields
    if (!source || typeof source !== 'string') {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'source is required and must be a string', 400, {
        field: 'source',
        provided: typeof source,
      });
      return;
    }

    // Validate source is a valid SessionSourceType
    const validSources = ['agent', 'sibil', 'user'] as const;
    if (!validSources.includes(source as any)) {
      sendError(res, 'VALIDATION_ERROR', 'source must be one of: agent, sibil, user', 400, {
        field: 'source',
        provided: source,
        allowedValues: validSources,
      });
      return;
    }

    // Validate optional UUIDs if provided
    if (agentId) {
      const agentValidation = validateUUID(agentId, 'agentId');
      if (!agentValidation.isValid && agentValidation.error) {
        sendError(
          res,
          agentValidation.error.code,
          agentValidation.error.message,
          400,
          agentValidation.error.details
        );
        return;
      }
    }

    if (starshipId) {
      const starshipValidation = validateUUID(starshipId, 'starshipId');
      if (!starshipValidation.isValid && starshipValidation.error) {
        sendError(
          res,
          starshipValidation.error.code,
          starshipValidation.error.message,
          400,
          starshipValidation.error.details
        );
        return;
      }
    }

    // Create new session
    const session = await SessionService.createSession({
      metadata,
    });

    console.log(`[SESSION] Created new session: ${session.id} for user: ${userId}`);

    sendSuccess(res, session, 201);
  } catch (error) {
    if (!handleCommonError(error, res, 'creating session')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create session');
    }
  }
});

// DELETE /sessions/:sessionId - Delete a session
router.delete(
  '/sessions/:sessionId',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      // Validate sessionId format
      const { isValid, error } = validateUUID(sessionId, 'sessionId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }

      // Verify session exists
      const session = await SessionService.getSessionById(sessionId);
      if (!session) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Session not found', 404, {
          resource: 'session',
          id: sessionId,
        });
        return;
      }

      // Delete the session
      const deleted = await SessionService.deleteSession(sessionId);

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
  }
);

export default router;
