import { Router } from 'express';
import type { MemoryModel } from '@starships/protocol';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AgentService } from '../services/AgentService';
import { RepositoryFactory, ValidationError, NotFoundError } from '@starships/models';
import {
  sendSuccess,
  sendError,
  handleCommonError,
  validateUUID,
  validatePagination,
  createPaginationMeta,
  ERROR_CODES,
} from '../utils/responseHelpers';

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

// POST / - Send message to agent (renamed from /chat to follow new pattern)
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { agentId, message } = req.body;

    if (!userId) {
      sendError(res, ERROR_CODES.UNAUTHORIZED, 'User not authenticated', 401);
      return;
    }

    // Validate required fields
    if (!agentId || typeof agentId !== 'string') {
      sendError(res, ERROR_CODES.REQUIRED_FIELD_MISSING, 'agentId is required and must be a string', 400, {
        field: 'agentId',
        provided: typeof agentId,
      });
      return;
    }

    if (!message || typeof message !== 'string') {
      sendError(res, ERROR_CODES.REQUIRED_FIELD_MISSING, 'message is required and must be a string', 400, {
        field: 'message',
        provided: typeof message,
      });
      return;
    }

    // Validate agentId format
    const { isValid, error } = validateUUID(agentId, 'agentId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    // Build chat request using authenticated user ID from middleware
    const chatRequest = {
      source: 'agent' as const,
      agentId,
      userId,
      message,
      stream: false,
    };

    console.log(`[CHAT] Processing message for authenticated user: ${userId}`);

    const result = await AgentService.executeChat(chatRequest);

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
    if (!handleCommonError(error, res, 'processing chat message')) {
      sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Failed to process chat message');
    }
  }
});

// DELETE /:sessionKey/memory - Clear memory for a chat session
router.delete('/:sessionKey/memory', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionKey } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    if (!sessionKey || typeof sessionKey !== 'string') {
      throw new ValidationError(
        'sessionKey is required and must be a string',
        'sessionKey'
      );
    }

    const store = AgentService.getMemoryStore();
    await store.clear(sessionKey);

    res.json({
      success: true,
      data: { message: 'Memory cleared successfully' }
    });

  } catch (error) {
    console.error('Memory clear error:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error),
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// GET endpoint for fetching messages by memory ID
router.get('/messages/memory/:memoryId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { memoryId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    // Validate memoryId is a UUID
    validateUUID(memoryId, 'memoryId');

    // Parse limit and offset parameters
    const limit = Math.floor(parseInt(req.query.limit as string) || 50);
    const offset = Math.floor(parseInt(req.query.offset as string) || 0);
    
    // Validate limit range
    if (limit < 1 || limit > 200) {
      res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 200',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    if (offset < 0) {
      res.status(400).json({
        success: false,
        error: 'Offset must be non-negative',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    const messageRepository = RepositoryFactory.getMessageRepository();
    const memoryRepository = RepositoryFactory.getMemoryRepository();
    
    // First, verify the memory exists
    const memory = await memoryRepository.findById(memoryId);
    if (!memory) {
      res.status(404).json({
        success: false,
        error: 'Memory not found',
        code: 'MEMORY_NOT_FOUND'
      });
      return;
    }

    // Fetch messages for the memory with pagination
    const allMessages = await messageRepository.findByMemoryId(memoryId);
    const messages = allMessages.slice(offset, offset + limit);

    res.json({
      success: true,
      data: {
        messages,
        memoryId,
        total: allMessages.length,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('Chat messages fetch error:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error),
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        error: getErrorMessage(error),
        code: 'NOT_FOUND'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// GET endpoint for fetching memories by starship
router.get('/memories/starship/:starshipId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { starshipId } = req.params;
    const userId = req.user?.id;

    console.log('🚀 [CHAT ROUTE] GET memories/starship endpoint called:', {
      starshipId,
      userId,
      userObject: req.user,
      headers: req.headers.authorization ? 'Bearer token present' : 'No auth header',
      timestamp: new Date().toISOString()
    });

    if (!userId) {
      console.error('🚀 [CHAT ROUTE] User not authenticated - missing userId');
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    // Validate starshipId format (consistent with other routes)
    validateUUID(starshipId, 'starshipId');
    console.log('🚀 [CHAT ROUTE] StarshipId validation passed:', starshipId);

    // Parse limit parameter (consistent with agents route pattern)
    const limit = Math.floor(parseInt(req.query.limit as string) || 50);
    
    // Validate limit range (consistent with missions route)
    if (limit < 1 || limit > 200) {
      res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 200',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    console.log('🚀 [CHAT ROUTE] Calling repository with params:', {
      starshipId,
      limit
    });

    const memoryRepository = RepositoryFactory.getMemoryRepository();
    
    // Get memories with filtering
    const allMemories = await memoryRepository.findWithFilters({
      limit: limit
    });

    console.log('🚀 [CHAT ROUTE] Repository returned:', {
      memoriesCount: allMemories.length,
      memories: allMemories.map((m: MemoryModel) => ({
        id: m.id,
        messageCount: m.messageCount
      }))
    });

    res.json({
      memories: allMemories
    });

  } catch (error) {
    console.error('Chat memories fetch error:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error),
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        error: getErrorMessage(error),
        code: 'STARSHIP_NOT_FOUND'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// GET endpoint for fetching conversation messages by conversation ID
router.get('/conversation/:conversationId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    if (!conversationId || typeof conversationId !== 'string') {
      throw new ValidationError(
        'conversationId is required and must be a string',
        'conversationId'
      );
    }

    // Parse pagination parameters
    const limit = Math.floor(parseInt(req.query.limit as string) || 50);
    const offset = Math.floor(parseInt(req.query.offset as string) || 0);
    
    if (limit < 1 || limit > 200) {
      res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 200',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    if (offset < 0) {
      res.status(400).json({
        success: false,
        error: 'Offset must be non-negative',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    const messageRepository = RepositoryFactory.getMessageRepository();
    
    // Fetch conversation messages
    const messages = await messageRepository.findByConversationId(conversationId, limit, offset);

    if (messages.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        messages,
        conversationId,
        total: messages.length,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('Conversation messages fetch error:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error),
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

export default router;
