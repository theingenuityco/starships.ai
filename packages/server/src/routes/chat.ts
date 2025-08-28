import { Router } from 'express';
import { chat as agentChat } from '@starships/agent-engine';
import type { ChatRequest } from '@starships/protocol';
import type { Request, Response } from 'express';
import getStore from '../store';
import { authMiddleware } from '../middleware/auth';
import { AgentService } from '../services/AgentService';
import { RepositoryFactory, ValidationError, NotFoundError } from '@starships/models';

const router: Router = Router();

/**
 * UUID validation helper (consistent with other routes)
 */
const validateUUID = (id: string, fieldName: string): void => {
  if (!id || typeof id !== 'string') {
    throw new ValidationError(
      `${fieldName} is required and must be a string`,
      fieldName
    );
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new ValidationError(
      `${fieldName} must be a valid UUID format`,
      fieldName
    );
  }
};

/**
 * Error helper consistent with project patterns
 */
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

// POST /chat - Send message to agent
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { agent_id, message } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    // Validate required fields
    if (!agent_id || typeof agent_id !== 'string') {
      throw new ValidationError(
        'agent_id is required and must be a string',
        'agent_id'
      );
    }

    if (!message || typeof message !== 'string') {
      throw new ValidationError(
        'message is required and must be a string',
        'message'
      );
    }

    // Validate agent_id format
    validateUUID(agent_id, 'agent_id');

    // Build chat request using authenticated user ID from middleware
    const chatRequest: ChatRequest = {
      source: 'agent',
      agent_id,
      user_id: userId,
      message,
      stream: false,
    };

    console.log(`[CHAT] Processing message for authenticated user: ${userId}`);

    const store = getStore();
    const result = await agentChat(chatRequest, store);

    // Track agent usage after successful chat
    try {
      await AgentService.trackUsage(chatRequest.agent_id!);
      console.log(`[ANALYTICS] Tracked usage for agent: ${chatRequest.agent_id}`);
    } catch (trackingError) {
      // Don't fail the chat request if usage tracking fails
      console.warn('Failed to track agent usage:', trackingError);
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Chat error:', error);
    
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
        code: 'AGENT_NOT_FOUND'
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

    const store = getStore();
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

// GET endpoint for fetching chat messages by session ID
router.get('/messages/:sessionId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    // Validate sessionId is a UUID
    validateUUID(sessionId, 'sessionId');

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

    const chatMessageRepository = RepositoryFactory.getChatMessageRepository();
    const chatSessionRepository = RepositoryFactory.getChatSessionRepository();
    
    // First, verify the session exists and belongs to the user
    const session = await chatSessionRepository.findById(sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Chat session not found',
        code: 'SESSION_NOT_FOUND'
      });
      return;
    }

    // Note: Removed user-based access control as sessions are no longer tied to specific users

    // Fetch messages for the session
    const messages = await chatMessageRepository.findBySession(sessionId, limit, offset);

    res.json({
      success: true,
      data: {
        messages,
        sessionId,
        total: messages.length
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

// GET endpoint for fetching chat sessions by starship
router.get('/sessions/starship/:starshipId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { starshipId } = req.params;
    const userId = req.user?.id;

    console.log('🚀 [CHAT ROUTE] GET sessions/starship endpoint called:', {
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

    const chatSessionRepository = RepositoryFactory.getChatSessionRepository();
    const sessions = await chatSessionRepository.findByStarship(
      starshipId,
      limit
    );

    console.log('🚀 [CHAT ROUTE] Repository returned:', {
      sessionsCount: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        source: s.source,
        starship_id: s.starship_id
      }))
    });

    res.json({
      sessions
    });

  } catch (error) {
    console.error('Chat sessions fetch error:', error);
    
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

export default router;
