import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { MessageService } from '@/services/MessageService';
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

const CreateMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1, 'Content is required').max(50000, 'Content too long'),
  starshipId: NanoidSchema,
  agentId: NanoidSchema.optional(),
  memoryId: NanoidSchema.optional(),
  conversationId: NanoidSchema.optional(),
  parentMessageId: NanoidSchema.optional(),
  threadDepth: z.number().min(0).max(100).optional(),
  processingStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  messageType: z.enum(['user_input', 'agent_response', 'system_message', 'workflow_output']).optional(),
  importance: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  metadata: z.object({}).passthrough().optional(),
  hasAttachments: z.boolean().optional(),
  tokenCount: z.number().min(0).optional(),
  processingTimeMs: z.number().min(0).optional(),
});

const UpdateMessageSchema = CreateMessageSchema.partial().omit({ starshipId: true });

const MessageFiltersSchema = z.object({
  starshipId: NanoidSchema.optional(),
  agentId: NanoidSchema.optional(),
  memoryId: NanoidSchema.optional(),
  conversationId: NanoidSchema.optional(),
  role: z.enum(['system', 'user', 'assistant']).optional(),
  messageType: z.enum(['user_input', 'agent_response', 'system_message', 'workflow_output']).optional(),
  importance: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

const SearchMessagesSchema = MessageFiltersSchema.extend({
  query: z.string().min(1, 'Search query is required'),
});

const BulkMessageSchema = z.object({
  messageIds: z.array(NanoidSchema).min(1, 'At least one message ID is required'),
  operation: z.enum(['delete', 'archive', 'update_status', 'assign_conversation']),
  operationData: z.object({}).passthrough().optional(),
});

const MessageThreadSchema = z.object({
  includeParents: z.boolean().optional(),
  includeChildren: z.boolean().optional(),
  maxDepth: z.number().min(1).max(50).optional(),
});

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
 * POST /messages - Create new message
 */
router.post('/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidation = validateData(CreateMessageSchema, req.body, res, 'message creation data');
    if (!bodyValidation) return;

    // Delegate to service layer
    const messageService = new MessageService();
    const message = await messageService.createMessage(bodyValidation);

    sendSuccess(res, message, 201);
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
    const paramValidation = validateData(z.object({ messageId: NanoidSchema }), req.params, res, 'message parameter');
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
    const paramValidation = validateData(z.object({ messageId: NanoidSchema }), req.params, res, 'message parameter');
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
    const paramValidation = validateData(z.object({ messageId: NanoidSchema }), req.params, res, 'message parameter');
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

/**
 * GET /messages/search - Search messages with advanced filters
 */
router.get('/messages/search', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate search parameters
    const searchValidation = validateData(SearchMessagesSchema, req.query, res, 'search parameters');
    if (!searchValidation) return;

    // Validate pagination parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { page, limit } = paginationValidation;

    // Delegate to service layer
    const messageService = new MessageService();
    const searchResult = await messageService.searchMessages({
      ...searchValidation,
      limit,
      offset: (page - 1) * limit,
    });

    const paginationMeta = createPaginationMeta(page, limit, searchResult.total);
    sendSuccess(res, searchResult, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'searching messages');
  }
});

/**
 * GET /starships/:starshipId/messages - Get starship messages
 */
router.get('/starships/:starshipId/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate starshipId parameter
    const paramValidation = validateData(z.object({ starshipId: NanoidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Validate pagination parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { starshipId } = paramValidation;
    const { page, limit } = paginationValidation;

    // Delegate to service layer
    const messageService = new MessageService();
    const messages = await messageService.getMessagesByStarship(starshipId, limit, (page - 1) * limit);

    const paginationMeta = createPaginationMeta(page, limit, messages.length);
    sendSuccess(res, { messages }, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'fetching starship messages');
  }
});

/**
 * GET /agents/:agentId/messages - Get agent messages
 */
router.get('/agents/:agentId/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate agentId parameter
    const paramValidation = validateData(z.object({ agentId: NanoidSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Validate pagination parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { agentId } = paramValidation;
    const { page, limit } = paginationValidation;

    // Delegate to service layer
    const messageService = new MessageService();
    const messages = await messageService.getMessagesByAgent(agentId, limit, (page - 1) * limit);

    const paginationMeta = createPaginationMeta(page, limit, messages.length);
    sendSuccess(res, { messages }, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'fetching agent messages');
  }
});

/**
 * GET /messages/:messageId/thread - Get message thread (parent-child relationships)
 */
router.get('/messages/:messageId/thread', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate messageId parameter
    const paramValidation = validateData(z.object({ messageId: NanoidSchema }), req.params, res, 'message parameter');
    if (!paramValidation) return;

    // Validate thread parameters
    const threadValidation = validateData(MessageThreadSchema, req.query, res, 'thread parameters');
    if (!threadValidation) return;

    const { messageId } = paramValidation;

    // Delegate to service layer
    const messageService = new MessageService();
    const threadData = await messageService.getMessageThread({
      messageId,
      includeParents: threadValidation.includeParents,
      includeChildren: threadValidation.includeChildren,
      maxDepth: threadValidation.maxDepth,
    });

    sendSuccess(res, threadData, 200);
  } catch (error) {
    handleError(error, res, 'fetching message thread');
  }
});

/**
 * POST /messages/bulk - Perform bulk operations on messages
 */
router.post('/messages/bulk', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidation = validateData(BulkMessageSchema, req.body, res, 'bulk operation data');
    if (!bodyValidation) return;

    // Delegate to service layer
    const messageService = new MessageService();
    const result = await messageService.bulkOperation(bodyValidation);

    sendSuccess(res, result, 200);
  } catch (error) {
    handleError(error, res, 'performing bulk operation');
  }
});

/**
 * GET /messages/stats - Get message statistics
 */
router.get('/messages/stats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate filter parameters
    const filtersValidation = validateData(
      z.object({
        starshipId: NanoidSchema.optional(),
        agentId: NanoidSchema.optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
      }),
      req.query,
      res,
      'statistics filters'
    );
    if (!filtersValidation) return;

    // Delegate to service layer
    const messageService = new MessageService();
    const stats = await messageService.getMessageStats(filtersValidation);

    sendSuccess(res, stats, 200);
  } catch (error) {
    handleError(error, res, 'fetching message statistics');
  }
});

/**
 * GET /conversations/:conversationId/analytics - Get conversation analytics
 */
router.get('/conversations/:conversationId/analytics', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: NanoidSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    const { conversationId } = paramValidation;

    // Delegate to service layer
    const messageService = new MessageService();
    const analytics = await messageService.getConversationAnalytics(conversationId);

    if (!analytics) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found or has no messages', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    sendSuccess(res, analytics, 200);
  } catch (error) {
    handleError(error, res, 'fetching conversation analytics');
  }
});

export default router;
