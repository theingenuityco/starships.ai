import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { MessageService } from '@/services/MessageService';
import { ConversationService } from '@/services/ConversationService';
import { ConversationStreamBus } from '@/services/ConversationStreamBus';
import { verifyResourceAccess } from '@/middleware/verify-starship-access';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import {
  enforceDirectMessageMembership,
  enforcePrivateChannelMembership,
  enforceRoomParticipantMembershipForConversation,
} from '@/utils/conversation-membership';
import { analyzeRoomMentionsAndAgentAllowlist } from '@/utils/room-mentions';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import type { MessageModel } from '@starships/protocol';
import { DELETED_MESSAGE_MARKER } from '@starships/protocol';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';
import {
  ConversationRepository,
  ConversationParticipantRepository,
  MessageReactionRepository,
  NotificationRepository,
} from '@starships/models';
import { NotificationStreamBus } from '@/services/NotificationStreamBus';
import { getConnection } from '@starships/models';
import { createRoomInviteApprovalForMessage } from '@/utils/room-invite-approvals';

const router: Router = Router();

// Zod schemas for validation

const CreateMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1, 'Content is required').max(50000, 'Content too long'),
  starshipId: IdSchema,
  agentId: IdSchema.optional(),
  memoryId: IdSchema.optional(),
  conversationId: IdSchema.optional(),
  // Attachments are uploaded separately (multipart) and referenced here by id.
  // This route is used by "persist-only" thread messages and system seed messages;
  // it must support attachmentIds so those messages can carry files consistently.
  attachmentIds: z.array(IdSchema).max(50).optional(),
  parentMessageId: IdSchema.optional(),
  linkedConversationId: IdSchema.optional(),
  threadDepth: z.number().min(0).max(100).optional(),
  processingStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  messageType: z
    .enum(['user_input', 'agent_response', 'system_notification', 'system_instruction', 'workflow_output', 'error', 'tool_result'])
    .optional(),
  importance: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  metadata: z.object({}).passthrough().optional(),
  hasAttachments: z.boolean().optional(),
  tokenCount: z.number().min(0).optional(),
  processingTimeMs: z.number().min(0).optional(),
  toolCallId: z.string().optional(), // Reference to the tool call that generated this result
});

const UpdateMessageSchema = CreateMessageSchema.partial().omit({ starshipId: true });

type CreateMessageBody = z.infer<typeof CreateMessageSchema>;

const ToggleReactionSchema = z.object({
  emoji: z.string().min(1, 'emoji is required').max(32, 'emoji too long'),
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

function coerceStringId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

type PersistedMessage = MessageModel & {
  // NOTE: protocol MessageModel does not currently include these persisted FK fields,
  // but server messages do contain them (camelCase).
  conversationId?: string;
  starshipId?: string;
  // Back-compat: some mocks/legacy payloads may use snake_case.
  conversation_id?: string;
  starship_id?: string;
};

function getMessageConversationId(message: PersistedMessage): string {
  return coerceStringId(message.conversationId) || coerceStringId(message.conversation_id);
}

function getMessageStarshipId(message: PersistedMessage): string {
  return coerceStringId(message.starshipId) || coerceStringId(message.starship_id);
}

/**
 * POST /messages - Create a message (no agent processing)
 *
 * NOTE:
 * This endpoint ONLY persists a message. It does not trigger ConversationService processing
 * (unlike POST /conversations/:conversationId/messages).
 *
 * Used for inserting hidden system context (e.g. thread context seed) into a conversation history.
 */
router.post('/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidationUnknown = validateData(CreateMessageSchema, req.body, res, 'create message');
    if (!bodyValidationUnknown) return;
    const bodyValidation = bodyValidationUnknown as CreateMessageBody;

    const conversationId = typeof bodyValidation.conversationId === 'string' ? bodyValidation.conversationId : '';
    if (!conversationId) {
      sendError(res, 'VALIDATION_ERROR', 'conversationId is required', 400, { field: 'conversationId' });
      return;
    }

    // Verify conversation exists + access
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { resource: 'conversation', id: conversationId });
      return;
    }

    const authUserId = req.user?.id as string;
    if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) return;

    // Safety: ensure starshipId matches the conversation's starship
    if (String(bodyValidation.starshipId) !== String(conversation.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'starshipId does not match conversation', 400, {
        starshipId: bodyValidation.starshipId,
        conversationStarshipId: conversation.starshipId,
      });
      return;
    }

    // Enforce membership rules for restricted conversations (private channels + DMs).
    if (
      !(await enforcePrivateChannelMembership({
        conversationId,
        conversationStarshipId: conversation.starshipId,
        userId: authUserId,
        req,
        res,
      }))
    )
      return;
    if (!(await enforceDirectMessageMembership({ conversationId, userId: authUserId, req, res }))) return;
    if (
      !(await enforceRoomParticipantMembershipForConversation({
        conversationId,
        conversationStarshipId: conversation.starshipId,
        userId: authUserId,
        req,
        res,
      }))
    )
      return;

    const roomInvite = await analyzeRoomMentionsAndAgentAllowlist({
      conversationId,
      content: String(bodyValidation.content || ''),
      requestedAgentId: typeof bodyValidation.agentId === 'string' ? String(bodyValidation.agentId) : null,
    });

    const messageService = new MessageService();
    const { agentId: requestedAgentId, ...bodyWithoutAgentId } = bodyValidation;
    const messageType =
      typeof bodyValidation.messageType === 'string'
        ? bodyValidation.messageType
        : bodyValidation.role === 'tool'
          ? 'tool_result'
          : bodyValidation.role === 'assistant'
            ? 'agent_response'
            : bodyValidation.role === 'system'
              ? 'system_notification'
              : 'user_input';
    const contentForMessage = roomInvite ? roomInvite.sanitizedContentForMessage : String(bodyValidation.content || '');
    const created = await messageService.createMessage({
      ...bodyWithoutAgentId,
      content: contentForMessage,
      conversationId,
      // Attribute to the caller for auditing (even for system messages).
      userId: authUserId,
      messageType,
      ...(roomInvite
        ? roomInvite.sanitizedAgentIdForMessage
          ? { agentId: roomInvite.sanitizedAgentIdForMessage }
          : {}
        : requestedAgentId
          ? { agentId: requestedAgentId }
          : {}),
    });

    // If this is a room/room-thread message and it referenced non-participants, persist a pending approval row (best-effort).
    if (roomInvite && (roomInvite.missingUserIds.length > 0 || roomInvite.missingAgentIds.length > 0)) {
      try {
        const conn = getConnection();
        const messageId = String((created as unknown as { id?: unknown })?.id ?? '').trim();
        if (messageId) {
          await createRoomInviteApprovalForMessage(conn, {
            starshipId: conversation.starshipId,
            roomConversationId: roomInvite.ctx.roomConversationId,
            conversationId,
            messageId,
            requestedByUserId: authUserId,
            missingUserIds: roomInvite.missingUserIds,
            missingAgentIds: roomInvite.missingAgentIds,
            emitUIAction: true,
          });
        }
      } catch {
        // best-effort only
      }
    }

    sendSuccess(res, created, 201);
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
    const paramValidation = validateData(z.object({ messageId: IdSchema }), req.params, res, 'message parameter');
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

    const authUserId = req.user?.id as string | undefined;
    const conversationId = getMessageConversationId(message as PersistedMessage);
    const starshipId = getMessageStarshipId(message as PersistedMessage);
    if (!conversationId || !starshipId) {
      sendError(res, 'VALIDATION_ERROR', 'Message is missing conversationId/starshipId', 400, { messageId });
      return;
    }

    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyResourceAccess(starshipId, authUserId, 'message', messageId, res))) return;
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { resource: 'conversation', id: conversationId });
      return;
    }
    if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) return;
    if (
      !(await enforcePrivateChannelMembership({
        conversationId,
        conversationStarshipId: conversation.starshipId,
        userId: authUserId,
        req,
        res,
      }))
    )
      return;
    if (!(await enforceDirectMessageMembership({ conversationId, userId: authUserId, req, res }))) return;
    if (
      !(await enforceRoomParticipantMembershipForConversation({
        conversationId,
        conversationStarshipId: conversation.starshipId,
        userId: authUserId,
        req,
        res,
      }))
    )
      return;

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
    const paramValidation = validateData(z.object({ messageId: IdSchema }), req.params, res, 'message parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(UpdateMessageSchema, req.body, res, 'message update data');
    if (!bodyValidation) return;
    let updatePayload: Record<string, unknown> = bodyValidation as unknown as Record<string, unknown>;

    const { messageId } = paramValidation;
    const authUserId = req.user?.id as string | undefined;

    // Load message to enforce access + ownership rules
    const messageService = new MessageService();
    const message = await messageService.getMessage(messageId);
    if (!message) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Message not found', 404, {
        resource: 'message',
        id: messageId,
      });
      return;
    }

    const conversationId = getMessageConversationId(message as PersistedMessage);
    const starshipId = getMessageStarshipId(message as PersistedMessage);

    if (!conversationId || !starshipId) {
      sendError(res, 'VALIDATION_ERROR', 'Message is missing conversationId/starshipId', 400, { messageId });
      return;
    }

    // Authorization: verify user has access to the starship + conversation membership.
    if (authUserId) {
      if (!(await verifyResourceAccess(starshipId, authUserId, 'message', messageId, res))) return;
      const conversationService = new ConversationService();
      const conversation = await conversationService.getConversationById(conversationId);
      if (!conversation) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { resource: 'conversation', id: conversationId });
        return;
      }
      if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) return;
      if (
        !(await enforcePrivateChannelMembership({
          conversationId,
          conversationStarshipId: conversation.starshipId,
          userId: authUserId,
          req,
          res,
        }))
      )
        return;
      if (!(await enforceDirectMessageMembership({ conversationId, userId: authUserId, req, res }))) return;
      if (
        !(await enforceRoomParticipantMembershipForConversation({
          conversationId,
          conversationStarshipId: conversation.starshipId,
          userId: authUserId,
          req,
          res,
        }))
      )
        return;
    }

    const wantsContentUpdate = typeof (updatePayload as any)?.content === 'string';
    if (wantsContentUpdate) {
      const role = coerceStringId((message as PersistedMessage).role);
      const authorUserId = coerceStringId((message as PersistedMessage).userId);
      if (!authUserId || role !== 'user' || !authorUserId || authorUserId !== authUserId) {
        sendError(res, 'ACCESS_DENIED', 'You can only edit your own messages', 403, { resource: 'message', id: messageId });
        return;
      }
      if (String((message as PersistedMessage).content || '') === DELETED_MESSAGE_MARKER) {
        sendError(res, 'RESOURCE_CONFLICT', 'Deleted messages cannot be edited', 409, { resource: 'message', id: messageId });
        return;
      }

      // Room mention policy: persist a sanitized copy so disallowed agent mention tokens
      // cannot be stored and later re-surface in history.
      const analysis = await analyzeRoomMentionsAndAgentAllowlist({
        conversationId,
        content: String((updatePayload as any)?.content || ''),
        requestedAgentId: null,
      });
      if (analysis) {
        updatePayload = { ...updatePayload, content: analysis.sanitizedContentForMessage };
      }
    }

    // Delegate to service layer
    const updatedMessage = (await messageService.updateMessage(messageId, updatePayload)) as PersistedMessage | null;

    if (!updatedMessage) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Message not found', 404, {
        resource: 'message',
        id: messageId,
      });
      return;
    }

    // Thread linking: when a message becomes linked to a child conversation, ensure the child thread
    // has initial participants per policy:
    // - linked message author (user or agent)
    // - thread starter (the authenticated user who performed the link)
    const linkedConversationId =
      typeof (updatePayload as any)?.linkedConversationId === 'string' ? String((updatePayload as any).linkedConversationId).trim() : '';
    if (linkedConversationId) {
      try {
        const authUserId = req.user?.id as string | undefined;
        const participantRepo = new ConversationParticipantRepository();

        // 1) Add the message author (author of linked message).
        const role = coerceStringId(updatedMessage.role);
        if (role === 'user') {
          const authorUserId = coerceStringId(updatedMessage.userId);
          if (authorUserId) {
            await participantRepo.addUserParticipant({
              conversationId: linkedConversationId,
              userId: authorUserId,
              role: null,
              createdBy: authUserId ?? null,
            });
          }
        } else if (role === 'assistant') {
          const authorAgentId = coerceStringId(updatedMessage.agentId);
          if (authorAgentId) {
            await participantRepo.addAgentParticipant({
              conversationId: linkedConversationId,
              agentId: authorAgentId,
              createdBy: authUserId ?? null,
            });
          }
        }

        // 2) Add the thread starter (actor who linked the message).
        if (authUserId) {
          await participantRepo.addUserParticipant({
            conversationId: linkedConversationId,
            userId: authUserId,
            role: null,
            createdBy: authUserId,
          });
        }

        // Intentionally do NOT persist the linked message content into the child conversation state.
        // The thread link (linkedConversationId) is sufficient for UI navigation, and the child
        // conversation transcript should stand alone without hidden/implicit context injection.
      } catch {
        /* best-effort: do not fail linking if participant insertion fails */
      }
    }

    // Realtime update:
    // When a message is updated (notably when it becomes linked to a thread via `linkedConversationId`),
    // broadcast the updated message to all participants on the parent conversation stream.
    //
    // We reuse `message.append` intentionally: the client treats same-id `message.append` as an update,
    // which avoids needing a new stream event type.
    try {
      const conversationId = getMessageConversationId(updatedMessage);
      if (conversationId) {
        const bus = ConversationStreamBus.getInstance();
        await bus.publish(conversationId, { type: 'message.append', data: { conversationId, message: updatedMessage } });
      }
    } catch {
      /* best-effort: persistence succeeded even if streaming publish fails */
    }

    sendSuccess(res, updatedMessage, 200);
  } catch (error) {
    handleError(error, res, 'updating message');
  }
});

/**
 * POST /messages/:messageId/reactions - Toggle an emoji reaction on a message
 */
router.post('/messages/:messageId/reactions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const authUserId = req.user?.id as string;

    const paramValidation = validateData(z.object({ messageId: IdSchema }), req.params, res, 'message parameter');
    if (!paramValidation) return;
    const bodyValidation = validateData(ToggleReactionSchema, req.body, res, 'toggle reaction data');
    if (!bodyValidation) return;

    const { messageId } = paramValidation;
    const emoji = String(bodyValidation.emoji || '').trim();
    if (!emoji) {
      sendError(res, 'VALIDATION_ERROR', 'emoji is required', 400, { field: 'emoji' });
      return;
    }

    // Load the message so we can enforce access and locate the conversation stream.
    const messageService = new MessageService();
    const message = await messageService.getMessage(messageId);
    if (!message) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Message not found', 404, { resource: 'message', id: messageId });
      return;
    }

    const conversationId =
      typeof (message as any)?.conversationId === 'string'
        ? String((message as any).conversationId).trim()
        : typeof (message as any)?.conversation_id === 'string'
          ? String((message as any).conversation_id).trim()
          : '';
    const starshipId =
      typeof (message as any)?.starshipId === 'string'
        ? String((message as any).starshipId).trim()
        : typeof (message as any)?.starship_id === 'string'
          ? String((message as any).starship_id).trim()
          : '';

    if (!conversationId || !starshipId) {
      sendError(res, 'VALIDATION_ERROR', 'Message is missing conversationId/starshipId', 400, { messageId });
      return;
    }

    // Authorization: verify user has access to the starship + is a member of restricted conversations.
    if (!(await verifyResourceAccess(starshipId, authUserId, 'message', messageId, res))) return;
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { resource: 'conversation', id: conversationId });
      return;
    }
    if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) return;

    if (
      !(await enforcePrivateChannelMembership({
        conversationId,
        conversationStarshipId: conversation.starshipId,
        userId: authUserId,
        req,
        res,
      }))
    )
      return;
    if (!(await enforceDirectMessageMembership({ conversationId, userId: authUserId, req, res }))) return;
    if (
      !(await enforceRoomParticipantMembershipForConversation({
        conversationId,
        conversationStarshipId: conversation.starshipId,
        userId: authUserId,
        req,
        res,
      }))
    )
      return;

    const reactionRepo = new MessageReactionRepository();
    const toggled = await reactionRepo.toggleReaction({ messageId, userId: authUserId, emoji });
    const reactions = await reactionRepo.getAggregatedReactions(messageId);

    // Publish realtime update so all connected clients update without refresh.
    try {
      const bus = ConversationStreamBus.getInstance();
      await bus.publish(conversationId, {
        type: 'message.reactions',
        data: { conversationId, messageId, reactions },
      });
    } catch (err) {
      console.error('[reactions] Failed to publish realtime update:', err);
      /* best-effort: persist succeeded even if streaming publish fails */
    }

    // Best-effort: create a durable notification for the message author when someone reacts.
    try {
      if (toggled === 'added') {
        const authorUserId = typeof (message as any)?.userId === 'string' ? String((message as any).userId).trim() : '';
        if (authorUserId && authorUserId !== authUserId) {
          const notifRepo = new NotificationRepository();
          // NOTE: Reactions should notify for each add event (no per-message dedupe).
          const created: { created: boolean; notification?: any } = await notifRepo
            .create({
              starshipId,
              userId: authorUserId,
              type: 'reaction',
              conversationId,
              messageId,
            })
            .then((notification) => ({ created: true, notification }))
            .catch(() => ({ created: false, notification: undefined }));
          if (created?.created && created?.notification) {
            const notifBus = NotificationStreamBus.getInstance();
            await notifBus.publish(starshipId, authorUserId, {
              type: 'notification.append',
              data: { notification: created.notification },
            });
            const unread = await notifRepo.getUnreadCounts({ starshipId, userId: authorUserId });
            await notifBus.publish(starshipId, authorUserId, { type: 'notification.state', data: { unread } });
          }
        }
      }
    } catch (e) {
      void e;
      /* best-effort */
    }

    sendSuccess(res, { messageId, reactions }, 200);
  } catch (error) {
    handleError(error, res, 'toggling message reaction');
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
    const paramValidation = validateData(z.object({ messageId: IdSchema }), req.params, res, 'message parameter');
    if (!paramValidation) return;

    const { messageId } = paramValidation;
    const authUserId = req.user?.id as string | undefined;

    const messageService = new MessageService();
    const message = await messageService.getMessage(messageId);
    if (!message) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Message not found', 404, {
        resource: 'message',
        id: messageId,
      });
      return;
    }

    const conversationId =
      typeof (message as any)?.conversationId === 'string'
        ? String((message as any).conversationId).trim()
        : typeof (message as any)?.conversation_id === 'string'
          ? String((message as any).conversation_id).trim()
          : '';
    const starshipId =
      typeof (message as any)?.starshipId === 'string'
        ? String((message as any).starshipId).trim()
        : typeof (message as any)?.starship_id === 'string'
          ? String((message as any).starship_id).trim()
          : '';

    if (!conversationId || !starshipId) {
      sendError(res, 'VALIDATION_ERROR', 'Message is missing conversationId/starshipId', 400, { messageId });
      return;
    }

    if (authUserId) {
      if (!(await verifyResourceAccess(starshipId, authUserId, 'message', messageId, res))) return;
      const conversationService = new ConversationService();
      const conversation = await conversationService.getConversationById(conversationId);
      if (!conversation) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { resource: 'conversation', id: conversationId });
        return;
      }
      if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) return;
      if (
        !(await enforcePrivateChannelMembership({
          conversationId,
          conversationStarshipId: conversation.starshipId,
          userId: authUserId,
          req,
          res,
        }))
      )
        return;
      if (!(await enforceDirectMessageMembership({ conversationId, userId: authUserId, req, res }))) return;
      if (
        !(await enforceRoomParticipantMembershipForConversation({
          conversationId,
          conversationStarshipId: conversation.starshipId,
          userId: authUserId,
          req,
          res,
        }))
      )
        return;
    }

    const role = typeof (message as any)?.role === 'string' ? String((message as any).role) : '';
    const authorUserId = typeof (message as any)?.userId === 'string' ? String((message as any).userId) : '';
    if (!authUserId || role !== 'user' || !authorUserId || authorUserId !== authUserId) {
      sendError(res, 'ACCESS_DENIED', 'You can only delete your own messages', 403, { resource: 'message', id: messageId });
      return;
    }

    if (String((message as any)?.content || '') === DELETED_MESSAGE_MARKER) {
      sendSuccess(res, { message: 'Message already deleted', messageId }, 200);
      return;
    }

    const deletedMessage = await messageService.deleteMessage(messageId);
    if (!deletedMessage) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Message not found', 404, {
        resource: 'message',
        id: messageId,
      });
      return;
    }

    // Realtime update: publish soft-delete update so clients replace the content.
    try {
      const bus = ConversationStreamBus.getInstance();
      await bus.publish(conversationId, { type: 'message.append', data: { conversationId, message: deletedMessage as any } });
    } catch {
      /* best-effort */
    }

    sendSuccess(res, { message: deletedMessage }, 200);
  } catch (error) {
    handleError(error, res, 'deleting message');
  }
});

export default router;
