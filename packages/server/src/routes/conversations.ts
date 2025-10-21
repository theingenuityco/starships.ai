import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { ConversationService } from '@/services/ConversationService';
import { StreamingService } from '@/services/StreamingService';
import { BalanceValidationService } from '@/services/BalanceValidationService';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, PaginationSchema } from '@/schemas/common';
import { WalletService } from '@/services/WalletService';
import { ResumeTokenService } from '@/services/ResumeTokenService';

const router: Router = Router();

// Using standard pagination schema for consistency


/**
 * GET /conversations/:conversationId/messages - Get conversation messages (supports streaming for live updates)
 */
router.get('/conversations/:conversationId/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    const { conversationId } = paramValidation;

    // Check if streaming is requested
    const wantsStreaming = req.get('Accept')?.includes('text/event-stream') || req.query.stream === 'true';

    if (wantsStreaming) {
      // Add connection to streaming service - it will handle SSE headers and setup
      const streamingService = new StreamingService();

      // Server-driven resume via query param (avoid custom headers)
      const resumeToken = typeof (req.query as any).resumeToken === 'string' ? (req.query as any).resumeToken : '';

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

      // If this is a reconnection with Last-Event-ID, prefer event replay from buffer
      // to avoid duplicating already-processed baseline messages. Otherwise send
      // initial baseline snapshot messages.
      if (resumeToken) {
        // Verify token; fall back to baseline on failure
        const svc = ResumeTokenService.getInstance();
        const claims = svc.verify(resumeToken);
        if (!claims || claims.c !== conversationId) {
          // Invalid token; use baseline mode
          const startIndexForSend = Math.min(Math.max(clientBase, 0), serverCount);
          const messagesToSend = conversationMessages.slice(startIndexForSend);
          if (messagesToSend.length > 0) {
            for (const message of messagesToSend) {
              await streamingService.broadcastMessage(conversationId, message);
            }
          }
        } else {
          // 1) Replay persisted messages beyond last persisted id in token (claims.m)
          let startIdx = 0;
          if (claims.m && claims.m !== '0') {
            const idx = conversationMessages.findIndex((m) => String((m as any).id) === String(claims.m));
            startIdx = idx >= 0 ? idx + 1 : 0;
          }
          const persistedTail = conversationMessages.slice(startIdx);
          if (persistedTail.length > 0) {
            for (const message of persistedTail) {
              await streamingService.broadcastMessage(conversationId, message);
            }
          }

          // 2) Replay recent ring buffer deltas (skip 'message' entries to avoid duplicate persisted messages)
          await streamingService.replayBufferedEvents(conversationId, (evt) => evt.type !== 'message');
        }
      } else {
        // Send only messages the client may be missing based on their baselineLength hint
        const startIndexForSend = Math.min(Math.max(clientBase, 0), serverCount);
        const messagesToSend = conversationMessages.slice(startIndexForSend);

        if (messagesToSend.length > 0) {
          for (const message of messagesToSend) {
            await streamingService.broadcastMessage(conversationId, message);
          }
        }

        // Also replay critical lifecycle events (like 'complete') that may have occurred
        // during client navigation gaps even when no resume token is present.
        // We intentionally skip 'message' and 'delta' here to avoid duplicating content.
        await streamingService.replayBufferedEvents(conversationId, (evt) => evt.type === 'complete');
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
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
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

    // Preflight billing gate: block when wallet balance is <= 0
    const conversationService = new ConversationService();

    // Verify conversation exists
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    // Resolve starship and wallet, then enforce non-zero balance
    const starship = await conversationService.getConversationStarship(conversationId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found for conversation', 404, {
        resource: 'starship',
        conversationId,
      });
      return;
    }

    const walletService = new WalletService();
    const wallet = await walletService.getByStarshipId(starship.id);

    if (!wallet) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Wallet not found', 404, {
        starshipId: starship.id,
      });
      return;
    }

    // Use centralized balance validation service with $0.05 threshold
    const balanceValidation = BalanceValidationService.validateBalance({
      id: wallet.id,
      balance: wallet.balance,
    });

    if (!balanceValidation.isValid) {
      const errorDetails = BalanceValidationService.getInsufficientBalanceError(wallet.balance);
      sendError(res, 'INSUFFICIENT_FUNDS', errorDetails.message, 402, errorDetails.details);
      return;
    }

    // Fire-and-forget processing; live updates go over GET SSE channel (/conversations/:id/messages?stream=true)
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
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
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
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
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
        starshipId: IdSchema,
        agentId: IdSchema.optional(),
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
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
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
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
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
