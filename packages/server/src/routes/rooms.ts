import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { ConversationService } from '@/services/ConversationService';
import { ImportExportService } from '@/services/ImportExportService';
import { UIActionService } from '@/services/UIActionService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import {
  AgentRepository,
  ConversationNotificationPrefRepository,
  ConversationParticipantRepository,
  ConversationRepository,
  NotificationRepository,
  RoomDatasetsRepository,
  RoomTaskBoardsRepository,
  RoomToolsRepository,
  RoomViewsRepository,
  RoomRepository,
  StarshipDatasetRepository,
  StarshipMemberRepository,
  TaskBoardRepository,
  ToolRepository,
  ViewRepository,
  getConnection,
} from '@starships/models';
import type { MessageModel, RoomModel } from '@starships/protocol';
import { NotificationStreamBus } from '@/services/NotificationStreamBus';
import { MessageService } from '@/services/MessageService';
import { WalletService } from '@/services/WalletService';
import { BillingService } from '@/services/BillingService';
import { StarshipTurnLeaseService } from '@/services/StarshipTurnLeaseService';
import { CREDITS_PER_USER_MESSAGE } from '@/config/credits';
import archiver from 'archiver';
import crypto from 'crypto';
import { rateLimiters } from '@/middleware/rateLimiter';

const router: Router = Router();

const RoomSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((s) => s === s.trim(), 'slug must not have leading/trailing whitespace')
  .refine((s) => s === s.toLowerCase(), 'slug must be lowercase')
  .refine((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s), 'slug must be lowercase alphanumeric with hyphens');

const RoomNotificationLevelSchema = z.enum(['all', 'mentions', 'mute']);
const InviteApprovalIdSchema = z.union([IdSchema, z.string().uuid()]);

function safeFilenameSegment(input: string): string {
  const raw = String(input || '').trim();
  const sanitized = raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized.length > 0 ? sanitized : 'export';
}

function isoCompactTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

async function resolveRoomAccessArgs(args: { roomConversationId: string }): Promise<{
  room: RoomModel | null;
  conversationStarshipId: string | null;
}> {
  const roomRepo = new RoomRepository();
  const room = await roomRepo.findByConversationId(args.roomConversationId);
  if (!room) return { room: null, conversationStarshipId: null };

  // Resolve starshipId from authoritative conversation row (defense-in-depth).
  const conn = getConnection();
  const convoRow = await conn.queryOne<{ starship_id: string }>('SELECT starship_id FROM conversations WHERE id = $1', [
    args.roomConversationId,
  ]);
  const conversationStarshipId = convoRow?.starship_id ? String(convoRow.starship_id) : '';
  return { room, conversationStarshipId: conversationStarshipId || null };
}

async function requireRoomReadAccess(args: {
  roomId: string;
  req: Request;
  res: Response;
}): Promise<{ authUserId: string; room: RoomModel; conversationStarshipId: string } | null> {
  const roomId = String(args.roomId || '').trim();
  if (!roomId) {
    sendError(args.res, 'VALIDATION_ERROR', 'Missing roomId', 400);
    return null;
  }

  const authUserId = args.req.user?.id as string | undefined;
  if (!authUserId) {
    sendError(args.res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }

  const { room, conversationStarshipId } = await resolveRoomAccessArgs({ roomConversationId: roomId });
  if (!room) {
    sendError(args.res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId });
    return null;
  }
  if (!conversationStarshipId) {
    sendError(args.res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId: roomId });
    return null;
  }
  if (String(room.starshipId) !== String(conversationStarshipId)) {
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this room', 403, { roomId });
    return null;
  }

  if (!(await verifyStarshipAccess(conversationStarshipId, authUserId, args.res))) return null;
  // Rooms require explicit participation for read/write (public + private).
  // No owner/admin bypass by policy.
  const participantRepo = new ConversationParticipantRepository();
  const ok = await participantRepo.isUserParticipant(authUserId, roomId).catch(() => false);
  if (!ok) {
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this room', 403, {
      resource: 'room',
      roomId,
      reason: 'room_membership_required',
    });
    return null;
  }

  return { authUserId, room, conversationStarshipId };
}

// ============================================================================
// Invite approvals API (Slack-like "add on mention")
// ============================================================================

/**
 * GET /rooms/:roomId/invite-approvals/pending
 *
 * Returns pending invite approvals for a room, optionally filtered by the current thread conversation id.
 * Used to persist inline approvals across refresh.
 */
router.get('/rooms/:roomId/invite-approvals/pending', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const query = req.query as Record<string, unknown>;
    const conversationIdFilter = typeof query.conversationId === 'string' ? query.conversationId.trim() : '';

    const conn = getConnection();
    const approvals = await conn.query<{
      id: string;
      message_id: string;
      conversation_id: string;
      room_conversation_id: string;
      requested_by_user_id: string | null;
      created_at: string;
      requested_by_display_name: string | null;
      requested_by_email: string | null;
    }>(
      `
      SELECT
        ria.id,
        ria.message_id,
        ria.conversation_id,
        ria.room_conversation_id,
        ria.requested_by_user_id,
        ria.created_at,
        u.display_name AS requested_by_display_name,
        u.email AS requested_by_email
      FROM room_invite_approvals ria
      LEFT JOIN users u ON u.id = ria.requested_by_user_id
      WHERE ria.room_conversation_id = $1
        AND ria.status = 'pending'
        AND ($2::text = '' OR ria.conversation_id = $2::text)
      ORDER BY ria.created_at ASC
      `,
      [access.room.conversationId, conversationIdFilter]
    );

    const approvalIds = approvals.map((a) => String(a.id)).filter(Boolean);
    const targets =
      approvalIds.length === 0
        ? []
        : await conn.query<{
            approval_id: string;
            target_type: 'user' | 'agent';
            target_id: string;
            user_display_name: string | null;
            user_email: string | null;
            agent_name: string | null;
            agent_slug: string | null;
          }>(
            `
            SELECT
              t.approval_id,
              t.target_type,
              t.target_id,
              u.display_name AS user_display_name,
              u.email AS user_email,
              a.name AS agent_name,
              a.slug AS agent_slug
            FROM room_invite_approval_targets t
            LEFT JOIN users u ON t.target_type = 'user' AND u.id = t.target_id
            LEFT JOIN agents a ON t.target_type = 'agent' AND a.id = t.target_id
            WHERE t.approval_id = ANY($1)
            ORDER BY t.created_at ASC
            `,
            [approvalIds]
          );

    const byApprovalId: Record<string, { users: Array<{ id: string; label: string }>; agents: Array<{ id: string; label: string }> }> = {};
    for (const id of approvalIds) byApprovalId[id] = { users: [], agents: [] };
    for (const t of targets) {
      const aid = String(t.approval_id || '').trim();
      if (!aid || !byApprovalId[aid]) continue;
      const type = t.target_type === 'user' ? 'user' : 'agent';
      const id = String(t.target_id || '').trim();
      if (!id) continue;
      if (type === 'user') {
        const label = String(t.user_display_name || t.user_email || id).trim();
        byApprovalId[aid].users.push({ id, label: label || id });
      } else {
        const label = String(t.agent_name || t.agent_slug || id).trim();
        byApprovalId[aid].agents.push({ id, label: label || id });
      }
    }

    const payload = approvals.map((a) => {
      const id = String(a.id);
      const targets = byApprovalId[id] ?? { users: [], agents: [] };
      const requestedBy =
        a.requested_by_display_name || a.requested_by_email
          ? String(a.requested_by_display_name || a.requested_by_email)
          : a.requested_by_user_id
            ? String(a.requested_by_user_id)
            : '';
      return {
        id,
        roomConversationId: String(a.room_conversation_id),
        conversationId: String(a.conversation_id),
        messageId: String(a.message_id),
        createdAt: String(a.created_at),
        requestedByUserId: a.requested_by_user_id ? String(a.requested_by_user_id) : null,
        requestedByLabel: requestedBy || null,
        users: targets.users,
        agents: targets.agents,
      };
    });

    sendSuccess(res, { approvals: payload }, 200);
  } catch (error) {
    handleError(error, res, 'fetching room invite approvals');
  }
});

/**
 * POST /rooms/:roomId/invite-approvals/:approvalId/approve
 */
router.post(
  '/rooms/:roomId/invite-approvals/:approvalId/approve',
  jwtAuthMiddleware,
  rateLimiters.apiAuthenticated,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const params = validateData(
        z.object({ roomId: IdSchema, approvalId: InviteApprovalIdSchema }),
        req.params,
        res,
        'invite approval parameter'
      );
      if (!params) return;

      const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
      if (!access) return;

      // Policy: for public rooms, any room participant may approve/deny invite requests.
      // For private rooms, invite approvals are restricted to the starship owner/instance-admin.
      if (access.room.isPrivate) {
        if (!(await verifyStarshipOwnerAccess(access.room.starshipId, access.authUserId, res))) return;
      }

      const conn = getConnection();
      let threadConversationId = '';
      let approvalMessageId = '';
      let requestedByUserId: string | null = null;
      let invitedUserIds: string[] = [];
      let invitedAgentIds: string[] = [];
      await conn.query('BEGIN');
      try {
        const approval = await conn.queryOne<{
          id: string;
          status: string;
          requested_by_user_id: string | null;
          conversation_id: string;
          message_id: string;
        }>(
          `
        SELECT id, status, requested_by_user_id, conversation_id, message_id
        FROM room_invite_approvals
        WHERE id = $1 AND room_conversation_id = $2
        FOR UPDATE
        `,
          [params.approvalId, access.room.conversationId]
        );
        if (!approval) {
          await conn.query('ROLLBACK');
          sendError(res, 'RESOURCE_NOT_FOUND', 'Invite approval not found', 404, { approvalId: params.approvalId });
          return;
        }
        if (String(approval.status) !== 'pending') {
          await conn.query('ROLLBACK');
          sendSuccess(res, { status: String(approval.status) }, 200);
          return;
        }
        threadConversationId = approval.conversation_id ? String(approval.conversation_id) : '';
        approvalMessageId = approval.message_id ? String(approval.message_id) : '';
        requestedByUserId = approval.requested_by_user_id ? String(approval.requested_by_user_id) : null;

        const targets = await conn.query<{ target_type: 'user' | 'agent'; target_id: string }>(
          `SELECT target_type, target_id FROM room_invite_approval_targets WHERE approval_id = $1`,
          [params.approvalId]
        );
        invitedUserIds = targets
          .filter((t) => t.target_type === 'user')
          .map((t) => String(t.target_id || '').trim())
          .filter(Boolean);
        invitedAgentIds = targets
          .filter((t) => t.target_type === 'agent')
          .map((t) => String(t.target_id || '').trim())
          .filter(Boolean);

        // "Invited by" should reflect the requester (message author) even if someone else approves.
        const createdBy = approval.requested_by_user_id ? String(approval.requested_by_user_id) : access.authUserId;
        const participantRepo = new ConversationParticipantRepository();
        for (const t of targets) {
          const type = t.target_type === 'user' ? 'user' : 'agent';
          const id = String(t.target_id || '').trim();
          if (!id) continue;
          if (type === 'user') {
            await participantRepo
              .addUserParticipant({ conversationId: access.room.conversationId, userId: id, role: 'member', createdBy })
              .catch(() => null);
          } else {
            await participantRepo
              .addAgentParticipant({ conversationId: access.room.conversationId, agentId: id, createdBy })
              .catch(() => null);
          }
        }

        await conn.query(
          `
        UPDATE room_invite_approvals
           SET status = 'approved',
               resolved_at = NOW(),
               resolved_by_user_id = $2,
               updated_at = NOW()
         WHERE id = $1
        `,
          [params.approvalId, access.authUserId]
        );

        await conn.query('COMMIT');
      } catch (e) {
        await conn.query('ROLLBACK');
        throw e;
      }

      try {
        const ui = new UIActionService();
        await ui.publishAction(threadConversationId || access.room.conversationId, 'room_invite_approval_resolved', {
          approvalId: params.approvalId,
          roomConversationId: access.room.conversationId,
          conversationId: threadConversationId || null,
        });
      } catch {
        // best-effort only
      }

      // After approval:
      // - If users were added, notify them (inbox + SSE).
      // - If an agent was added, trigger the agent turn for the original message.
      void (async () => {
        try {
          const sid = String(access.room.starshipId || '').trim();
          const conversationId = String(threadConversationId || '').trim();
          const messageId = String(approvalMessageId || '').trim();
          if (!sid || !conversationId || !messageId) return;

          // 1) Notify invited users
          if (invitedUserIds.length > 0) {
            const notifRepo = new NotificationRepository();
            const bus = NotificationStreamBus.getInstance();
            for (const uid of invitedUserIds) {
              // Don't notify the approver about their own action.
              if (uid && uid === access.authUserId) continue;
              const created = await notifRepo
                .createOrIgnoreByUserTypeMessage({
                  starshipId: sid,
                  userId: uid,
                  type: 'channel',
                  conversationId,
                  messageId,
                })
                .catch(() => ({ created: false as const }));
              if (!created.created || !created.notification) continue;
              try {
                await bus.publish(sid, uid, { type: 'notification.append', data: { notification: created.notification } });
                const unread = await notifRepo.getUnreadCounts({ starshipId: sid, userId: uid });
                await bus.publish(sid, uid, { type: 'notification.state', data: { unread } });
              } catch {
                // best-effort only
              }
            }
          }

          // 2) Trigger agent once the agent is now a room participant
          const messageService = new MessageService();
          const msg = (await messageService.getMessage(messageId).catch(() => null)) as MessageModel | null;
          if (!msg) return;
          if (String(msg.role || '') !== 'user') return;

          const content = String(msg.content || '');
          const attachmentIds = Array.isArray(msg.attachmentIds) ? msg.attachmentIds : undefined;

          const conversationService = new ConversationService();
          // Prefer mention-driven routing (can include multiple agents); otherwise fall back to a single explicit agentId.
          const allAgents = await new AgentRepository().findByStarship(sid).catch(() => []);
          const starshipAgentIdSet = new Set(allAgents.map((a) => String(a?.id || '').trim()).filter(Boolean));
          const agentIdBySlug = new Map<string, string>();
          for (const a of Array.isArray(allAgents) ? allAgents : []) {
            const id = String(a?.id || '').trim();
            const slug = String(a?.slug || '').trim();
            if (slug && id) agentIdBySlug.set(slug, id);
          }

          const mentionedAgentIds = Array.from(
            new Set(
              (Array.from(content.matchAll(/<@a:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi)) || [])
                .map((m) => String(m?.[1] || '').trim())
                .map((slug) => (slug ? agentIdBySlug.get(slug) || '' : ''))
                .filter((id) => Boolean(id) && starshipAgentIdSet.has(id))
            )
          );
          const hasMentionTargets = mentionedAgentIds.length > 0;
          const explicitAgentId = hasMentionTargets
            ? null
            : invitedAgentIds.find((id) => starshipAgentIdSet.has(String(id || '').trim())) || null;

          const willTrigger = await conversationService
            .willTriggerAgentExecution({ conversationId, content, agentId: explicitAgentId })
            .catch(() => false);
          if (!willTrigger) return;

          // Billing + concurrency guard (mirrors POST /conversations/:id/messages behavior at a high level).
          const starship = await conversationService.getConversationStarship(conversationId).catch(() => null);
          if (!starship) return;

          const requiredCredits = Number(CREDITS_PER_USER_MESSAGE) || 0;
          const walletService = new WalletService();
          const wallet = await walletService.getByStarshipId(starship.id).catch(() => null);
          if (!wallet) return;
          const currentCredits = Number(wallet.balance) || 0;
          if (currentCredits < requiredCredits) return;

          const leaseService = new StarshipTurnLeaseService();
          let turnLeaseId: string | undefined;
          try {
            turnLeaseId = await leaseService.acquire({
              starshipId: starship.id,
              conversationId,
              maxConcurrentTurns: starship.maxConcurrentTurns ?? 3,
            });
          } catch {
            return;
          }

          const conversationRepo = new ConversationRepository();
          const turnGuardId = crypto.randomUUID();
          const turnGuardAcquired = await conversationRepo.acquireTurnGuard(conversationId, turnGuardId).catch(() => false);
          if (!turnGuardAcquired) {
            if (turnLeaseId) await leaseService.release(turnLeaseId).catch(() => undefined);
            return;
          }

          try {
            const billingService = new BillingService();
            await billingService.debitForUserMessage({
              walletId: wallet.id,
              starshipId: starship.id,
              conversationId,
              messageId,
            });
          } catch {
            await conversationRepo.mergeState(conversationId, { turnActive: false }).catch(() => undefined);
            if (turnLeaseId) await leaseService.release(turnLeaseId).catch(() => undefined);
            return;
          }

          try {
            await conversationService.addConversationMessage(
              {
                conversationId,
                role: 'user',
                content,
                messageType: msg.messageType || 'user_input',
                ...(explicitAgentId ? { agentId: explicitAgentId } : null),
                ...(attachmentIds && attachmentIds.length > 0 ? { attachmentIds } : null),
              },
              requestedByUserId ? { authContext: { userId: requestedByUserId } } : undefined,
              { preCreatedUserMessage: msg, turnLeaseId, turnGuardId }
            );
          } catch {
            // Best-effort: if it fails post-debit, we don't retry automatically.
            // Turn guard state cleanup is handled by ConversationService on completion; but if it fails early,
            // attempt to release lease and clear turnActive.
            await conversationRepo.mergeState(conversationId, { turnActive: false }).catch(() => undefined);
            if (turnLeaseId) await leaseService.release(turnLeaseId).catch(() => undefined);
          }
        } catch {
          // best-effort only
        }
      })();

      sendSuccess(res, { status: 'approved' }, 200);
    } catch (error) {
      handleError(error, res, 'approving room invite');
    }
  }
);

/**
 * POST /rooms/:roomId/invite-approvals/:approvalId/deny
 */
router.post(
  '/rooms/:roomId/invite-approvals/:approvalId/deny',
  jwtAuthMiddleware,
  rateLimiters.apiAuthenticated,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const params = validateData(
        z.object({ roomId: IdSchema, approvalId: InviteApprovalIdSchema }),
        req.params,
        res,
        'invite approval parameter'
      );
      if (!params) return;

      const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
      if (!access) return;

      // Policy: for public rooms, any room participant may approve/deny invite requests.
      // For private rooms, invite approvals are restricted to the starship owner/instance-admin.
      if (access.room.isPrivate) {
        if (!(await verifyStarshipOwnerAccess(access.room.starshipId, access.authUserId, res))) return;
      }

      const conn = getConnection();
      let threadConversationId = '';
      await conn.query('BEGIN');
      try {
        const approval = await conn.queryOne<{ id: string; status: string; conversation_id: string; message_id: string }>(
          `
        SELECT id, status, conversation_id, message_id
        FROM room_invite_approvals
        WHERE id = $1 AND room_conversation_id = $2
        FOR UPDATE
        `,
          [params.approvalId, access.room.conversationId]
        );
        if (!approval) {
          await conn.query('ROLLBACK');
          sendError(res, 'RESOURCE_NOT_FOUND', 'Invite approval not found', 404, { approvalId: params.approvalId });
          return;
        }
        if (String(approval.status) !== 'pending') {
          await conn.query('ROLLBACK');
          sendSuccess(res, { status: String(approval.status) }, 200);
          return;
        }

        threadConversationId = approval.conversation_id ? String(approval.conversation_id) : '';
        await conn.query(
          `
        UPDATE room_invite_approvals
           SET status = 'denied',
               resolved_at = NOW(),
               resolved_by_user_id = $2,
               updated_at = NOW()
         WHERE id = $1
        `,
          [params.approvalId, access.authUserId]
        );
        await conn.query('COMMIT');
      } catch (e) {
        await conn.query('ROLLBACK');
        throw e;
      }

      try {
        const ui = new UIActionService();
        await ui.publishAction(threadConversationId || access.room.conversationId, 'room_invite_approval_resolved', {
          approvalId: params.approvalId,
          roomConversationId: access.room.conversationId,
          conversationId: threadConversationId || null,
        });
      } catch {
        // best-effort only
      }

      sendSuccess(res, { status: 'denied' }, 200);
    } catch (error) {
      handleError(error, res, 'denying room invite');
    }
  }
);

/**
 * GET /rooms/:roomId/participation
 *
 * Returns whether the current user is a participant of the room conversation.
 * This endpoint is used to drive the explicit "Join room" UI flow.
 *
 * NOTE:
 * - For public rooms, non-participants may call this.
 * - For private rooms, access is still restricted by the room visibility rules (caller must already be a participant).
 */
router.get('/rooms/:roomId/participation', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const { room, conversationStarshipId } = await resolveRoomAccessArgs({ roomConversationId: params.roomId });
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!conversationStarshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId: params.roomId });
      return;
    }
    if (String(room.starshipId) !== String(conversationStarshipId)) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this room', 403, { roomId: params.roomId });
      return;
    }

    if (!(await verifyStarshipAccess(conversationStarshipId, authUserId, res))) return;

    const participantRepo = new ConversationParticipantRepository();
    const isParticipant = await participantRepo.isUserParticipant(authUserId, params.roomId).catch(() => false);

    // For private rooms, do not reveal participation status to non-members.
    if (room.isPrivate && !isParticipant) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this room', 403, { roomId: params.roomId });
      return;
    }

    sendSuccess(res, { isParticipant, isPrivate: Boolean(room.isPrivate), canJoin: !room.isPrivate }, 200);
  } catch (error) {
    handleError(error, res, 'fetching room participation');
  }
});

/**
 * POST /rooms/:roomId/join
 *
 * Join a public room by inserting a conversation_participants row.
 */
router.post('/rooms/:roomId/join', jwtAuthMiddleware, rateLimiters.apiAuthenticated, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const { room, conversationStarshipId } = await resolveRoomAccessArgs({ roomConversationId: params.roomId });
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!conversationStarshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId: params.roomId });
      return;
    }
    if (String(room.starshipId) !== String(conversationStarshipId)) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this room', 403, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipAccess(conversationStarshipId, authUserId, res))) return;

    if (room.isPrivate) {
      sendError(res, 'ACCESS_DENIED', 'Cannot join a private room', 403, { roomId: params.roomId });
      return;
    }

    const participantRepo = new ConversationParticipantRepository();
    const result = await participantRepo.addUserParticipant({
      conversationId: params.roomId,
      userId: authUserId,
      role: 'member',
      createdBy: authUserId,
    });

    sendSuccess(res, { joined: true, created: result.created }, 200);
  } catch (error) {
    handleError(error, res, 'joining room');
  }
});

/**
 * POST /rooms/:roomId/leave
 *
 * Leave a public room by removing the conversation_participants row for the current user.
 */
router.post(
  '/rooms/:roomId/leave',
  jwtAuthMiddleware,
  rateLimiters.apiAuthenticated,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
      if (!params) return;

      const authUserId = req.user?.id as string | undefined;
      if (!authUserId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      const { room, conversationStarshipId } = await resolveRoomAccessArgs({ roomConversationId: params.roomId });
      if (!room) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
        return;
      }
      if (!conversationStarshipId) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId: params.roomId });
        return;
      }
      if (String(room.starshipId) !== String(conversationStarshipId)) {
        sendError(res, 'ACCESS_DENIED', 'Access denied to this room', 403, { roomId: params.roomId });
        return;
      }
      if (!(await verifyStarshipAccess(conversationStarshipId, authUserId, res))) return;

      if (room.isPrivate) {
        sendError(res, 'ACCESS_DENIED', 'Cannot leave a private room', 403, { roomId: params.roomId });
        return;
      }

      const conn = getConnection();
      const result = await conn.queryWithResult(`DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`, [
        params.roomId,
        authUserId,
      ]);
      const removed = (result.rowCount ?? 0) > 0;
      sendSuccess(res, { left: true, removed }, 200);
    } catch (error) {
      handleError(error, res, 'leaving room');
    }
  }
);

/**
 * GET /rooms/:roomId/participants
 *
 * Returns user + agent participant ids for the room conversation.
 * Requires the caller to be a room participant.
 */
router.get(
  '/rooms/:roomId/participants',
  jwtAuthMiddleware,
  rateLimiters.apiAuthenticated,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
      if (!params) return;

      const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
      if (!access) return;

      const participantRepo = new ConversationParticipantRepository();
      const [userIds, agentIds] = await Promise.all([
        participantRepo.listUserIdsByConversation(access.room.conversationId).catch(() => []),
        participantRepo.listAgentIdsByConversation(access.room.conversationId).catch(() => []),
      ]);

      sendSuccess(res, { userIds, agentIds }, 200);
    } catch (error) {
      handleError(error, res, 'listing room participants');
    }
  }
);

/**
 * POST /rooms/:roomId/agents
 *
 * Adds an agent participant to the room (agent allowlist).
 * MVP policy: starship owner/instance-admin only.
 */
router.post(
  '/rooms/:roomId/agents',
  jwtAuthMiddleware,
  rateLimiters.apiAuthenticated,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
      if (!params) return;

      const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
      if (!access) return;

      // Private rooms: only starship owner/admin can manage the agent allowlist (MVP).
      // Public rooms: any participant can add allowlisted agents (Slack-like "invite on mention").
      if (access.room.isPrivate) {
        if (!(await verifyStarshipOwnerAccess(access.room.starshipId, access.authUserId, res))) return;
      }

      const body = validateData(z.object({ agentId: IdSchema }), req.body, res, 'room agent add');
      if (!body) return;

      const agentRepo = new AgentRepository();
      const agent = await agentRepo.findById(body.agentId);
      if (!agent) {
        sendError(res, 'VALIDATION_ERROR', 'Agent not found', 400, { agentId: body.agentId });
        return;
      }
      if (String(agent.starshipId) !== String(access.room.starshipId)) {
        sendError(res, 'VALIDATION_ERROR', 'Agent must belong to the same starship as the room', 400, {
          agentId: body.agentId,
          roomStarshipId: access.room.starshipId,
          agentStarshipId: agent.starshipId,
        });
        return;
      }

      const participantRepo = new ConversationParticipantRepository();
      const result = await participantRepo.addAgentParticipant({
        conversationId: access.room.conversationId,
        agentId: body.agentId,
        createdBy: access.authUserId,
      });

      sendSuccess(res, { created: result.created }, 200);
    } catch (error) {
      handleError(error, res, 'adding room agent');
    }
  }
);

/**
 * DELETE /rooms/:roomId/agents/:agentId
 *
 * Removes an agent participant from the room (agent allowlist).
 * MVP policy: starship owner/instance-admin only.
 */
router.delete(
  '/rooms/:roomId/agents/:agentId',
  jwtAuthMiddleware,
  rateLimiters.apiAuthenticated,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const params = validateData(z.object({ roomId: IdSchema, agentId: IdSchema }), req.params, res, 'room agent remove');
      if (!params) return;

      const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
      if (!access) return;

      if (access.room.isPrivate) {
        if (!(await verifyStarshipOwnerAccess(access.room.starshipId, access.authUserId, res))) return;
      }

      const conn = getConnection();
      const result = await conn.queryWithResult(`DELETE FROM conversation_participants WHERE conversation_id = $1 AND agent_id = $2`, [
        access.room.conversationId,
        params.agentId,
      ]);
      const removed = (result.rowCount ?? 0) > 0;
      sendSuccess(res, { removed }, 200);
    } catch (error) {
      handleError(error, res, 'removing room agent');
    }
  }
);

/**
 * GET /starships/:starshipId/rooms
 *
 * Lists rooms for a starship:
 * - public rooms are visible to all starship members
 * - private rooms are visible only to room members (no bypass)
 */
router.get('/starships/:starshipId/rooms', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const conn = getConnection();
    const rows = await conn.query<{
      conversation_id: string;
      starship_id: string;
      slug: string;
      name: string;
      is_private: boolean;
      topic: string | null;
      created_at: string;
      updated_at: string;
      conversation_created_at: string;
      conversation_updated_at: string;
    }>(
      `
      SELECT
        r.*,
        conv.created_at as conversation_created_at,
        conv.updated_at as conversation_updated_at
      FROM rooms r
      INNER JOIN conversations conv ON conv.id = r.conversation_id
      WHERE r.starship_id = $1
        AND (
          r.is_private = false
          OR EXISTS (
            SELECT 1
            FROM conversation_participants cp
            WHERE cp.conversation_id = r.conversation_id
              AND cp.user_id = $2
            LIMIT 1
          )
        )
      ORDER BY conv.updated_at DESC, conv.created_at DESC
      `,
      [params.starshipId, authUserId]
    );

    const rooms: RoomModel[] = rows.map((r) => ({
      conversationId: String(r.conversation_id),
      starshipId: String(r.starship_id),
      slug: String(r.slug),
      name: String(r.name),
      isPrivate: Boolean(r.is_private),
      topic: r.topic ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    sendSuccess(res, { rooms }, 200);
  } catch (error) {
    handleError(error, res, 'listing rooms');
  }
});

/**
 * POST /starships/:starshipId/rooms
 *
 * Creates a conversation-backed room.
 */
router.post('/starships/:starshipId/rooms', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const body = validateData(
      z.object({
        slug: RoomSlugSchema,
        name: z
          .string()
          .min(1)
          .max(100)
          .refine((s) => s === s.trim(), 'name must not have leading/trailing whitespace')
          .refine((s) => s.trim().length > 0, 'name cannot be empty'),
        isPrivate: z.boolean().optional(),
        topic: z.string().max(2000).optional().nullable(),
      }),
      req.body,
      res,
      'room create'
    );
    if (!body) return;

    const conversationService = new ConversationService();
    const roomRepo = new RoomRepository();
    const participantRepo = new ConversationParticipantRepository();

    const conversation = await conversationService.createConversation({
      title: body.name,
      status: 'active',
      starshipId: params.starshipId,
    });

    try {
      const room = await roomRepo.create({
        conversationId: conversation.id,
        starshipId: params.starshipId,
        slug: body.slug,
        name: body.name,
        isPrivate: Boolean(body.isPrivate),
        topic: body.topic ?? null,
      });

      // Rooms require explicit participation even when public.
      // Make the creator an initial admin participant so they can access the room immediately.
      await participantRepo.addUserParticipant({
        conversationId: room.conversationId,
        userId: authUserId,
        role: 'admin',
        createdBy: authUserId,
      });

      sendSuccess(res, { room, conversationId: conversation.id }, 201);
    } catch (e) {
      try {
        await conversationService.deleteConversation(conversation.id);
      } catch {
        /* ignore */
      }
      throw e;
    }
  } catch (error) {
    handleError(error, res, 'creating room');
  }
});

/**
 * GET /rooms/:roomId
 *
 * Returns a conversation-backed room by its conversation id.
 */
router.get('/rooms/:roomId', jwtAuthMiddleware, rateLimiters.apiAuthenticated, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }

    // Resolve starshipId from authoritative conversation row (defense-in-depth).
    const conn = getConnection();
    const convoRow = await conn.queryOne<{ starship_id: string }>('SELECT starship_id FROM conversations WHERE id = $1', [params.roomId]);
    const conversationStarshipId = convoRow?.starship_id ? String(convoRow.starship_id) : '';
    if (!conversationStarshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId: params.roomId });
      return;
    }

    if (String(room.starshipId) !== String(conversationStarshipId)) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this room', 403, { roomId: params.roomId });
      return;
    }

    if (!(await verifyStarshipAccess(conversationStarshipId, authUserId, res))) return;
    // Rooms require explicit participation (public + private). No bypass.
    const participantRepo = new ConversationParticipantRepository();
    const ok = await participantRepo.isUserParticipant(authUserId, params.roomId).catch(() => false);
    if (!ok) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this room', 403, { resource: 'room', roomId: params.roomId });
      return;
    }

    sendSuccess(res, { room }, 200);
  } catch (error) {
    handleError(error, res, 'fetching room');
  }
});

/**
 * GET /rooms/:roomId/export-bundle
 *
 * Export a room and its resources as a zip bundle.
 * Owner / instance-admin only.
 */
router.get('/rooms/:roomId/export-bundle', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }

    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const svc = new ImportExportService();
    const bundle = await svc.exportRoomBundle(params.roomId);

    const fromStarshipSlug =
      typeof bundle.room.metadata?.fromStarshipSlug === 'string' ? bundle.room.metadata.fromStarshipSlug : 'starship';
    const fromRoomSlug = typeof bundle.room.metadata?.fromSlug === 'string' ? bundle.room.metadata.fromSlug : room.slug || room.conversationId;
    const baseName = safeFilenameSegment(`room-bundle-${fromStarshipSlug}-${fromRoomSlug}-${isoCompactTimestamp()}`);
    const filename = `${baseName}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    const appendContainers = <K extends string>(
      items: Array<{ metadata?: { fromSlug?: unknown; fromStarshipSlug?: unknown } }>,
      dir: string,
      fallbackPrefix: string,
      kind: K
    ): Array<{ kind: K; fromSlug?: unknown; fromStarshipSlug?: unknown; file: string }> => {
      const usedNames = new Set<string>();
      const entries: Array<{ kind: K; fromSlug?: unknown; fromStarshipSlug?: unknown; file: string }> = [];

      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const slug = typeof item.metadata?.fromSlug === 'string' ? item.metadata.fromSlug : `${fallbackPrefix}-${i + 1}`;
        const base = safeFilenameSegment(slug);
        let outName = base;
        let n = 2;
        while (usedNames.has(outName)) {
          outName = `${base}-${n}`;
          n += 1;
        }
        usedNames.add(outName);
        const file = `${dir}/${outName}.json`;
        entries.push({
          kind,
          fromSlug: item.metadata?.fromSlug,
          fromStarshipSlug: item.metadata?.fromStarshipSlug,
          file,
        });
        archive.append(JSON.stringify(item, null, 2), { name: file });
      }

      return entries;
    };

    const roomEntries = appendContainers([bundle.room], 'rooms', 'room', 'room');
    const agentEntries = appendContainers(bundle.agents, 'agents', 'agent', 'agent');
    const viewEntries = appendContainers(bundle.views, 'views', 'view', 'view');
    const datasetEntries = appendContainers(bundle.datasets, 'datasets', 'dataset', 'dataset');
    const taskBoardEntries = appendContainers(bundle.taskBoards, 'task-boards', 'task-board', 'task_board');
    const toolEntries = appendContainers(bundle.tools, 'tools', 'tool', 'tool');

    const manifest = {
      schemaVersion: '1',
      kind: 'bundle',
      exportedAt: new Date().toISOString(),
      entities: {
        rooms: roomEntries,
        agents: agentEntries,
        views: viewEntries,
        datasets: datasetEntries,
        taskBoards: taskBoardEntries,
        tools: toolEntries,
      },
    };

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    await archive.finalize();
  } catch (error) {
    if (res.headersSent) {
      try {
        res.end();
      } catch {
        // ignore
      }
      console.error('[ROOMS] Error exporting room bundle after headers sent:', error);
      return;
    }
    handleError(error, res, 'exporting room bundle');
  }
});

/**
 * PATCH /rooms/:roomId
 *
 * Updates a conversation-backed room. MVP policy: starship owner/instance-admin only.
 */
router.patch('/rooms/:roomId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const body = validateData(
      z.object({
        name: z
          .string()
          .min(1)
          .max(100)
          .refine((s) => s === s.trim(), 'name must not have leading/trailing whitespace')
          .refine((s) => s.trim().length > 0, 'name cannot be empty')
          .optional(),
        isPrivate: z.boolean().optional(),
        topic: z.string().max(2000).optional().nullable(),
      }),
      req.body,
      res,
      'room update'
    );
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }

    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const conn = getConnection();
    const nextName = body.name !== undefined ? String(body.name) : undefined;
    const nextIsPrivate = body.isPrivate !== undefined ? Boolean(body.isPrivate) : undefined;
    const nextTopic = body.topic !== undefined ? (body.topic ?? null) : undefined;

    const setParts: string[] = [];
    const values: Array<string | boolean | null> = [];
    let i = 1;
    if (nextName !== undefined) {
      setParts.push(`name = $${i++}`);
      values.push(nextName);
    }
    if (nextIsPrivate !== undefined) {
      setParts.push(`is_private = $${i++}`);
      values.push(nextIsPrivate);
    }
    if (nextTopic !== undefined) {
      setParts.push(`topic = $${i++}`);
      values.push(nextTopic);
    }
    setParts.push(`updated_at = NOW()`);

    const sql = `
      UPDATE rooms
         SET ${setParts.join(', ')}
       WHERE conversation_id = $${i++}
       RETURNING *;
    `;
    values.push(room.conversationId);

    const updatedRow = await conn.queryOne<{
      conversation_id: string;
      starship_id: string;
      slug: string;
      name: string;
      is_private: boolean;
      topic: string | null;
      created_at: string;
      updated_at: string;
    }>(sql, values);
    if (!updatedRow) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update room', 500);
      return;
    }

    // Keep backing conversation title in sync with room name.
    if (nextName !== undefined) {
      const conversationService = new ConversationService();
      try {
        await conversationService.updateConversation(room.conversationId, { title: nextName });
      } catch {
        /* ignore */
      }
    }

    // If the room is now private, ensure the updater is a member/participant (idempotent).
    // NOTE: By policy we do not revoke existing participants when a room flips from public → private
    // (Slack-like behavior); access is locked to the current member set going forward.
    if (nextIsPrivate === true) {
      const participantRepo = new ConversationParticipantRepository();
      try {
        await participantRepo.addUserParticipant({
          conversationId: room.conversationId,
          userId: authUserId,
          role: 'admin',
          createdBy: authUserId,
        });
      } catch {
        /* ignore */
      }
    }

    const updated: RoomModel = {
      conversationId: String(updatedRow.conversation_id),
      starshipId: String(updatedRow.starship_id),
      slug: String(updatedRow.slug),
      name: String(updatedRow.name),
      isPrivate: Boolean(updatedRow.is_private),
      topic: updatedRow.topic ?? null,
      createdAt: String(updatedRow.created_at),
      updatedAt: String(updatedRow.updated_at),
    };

    sendSuccess(res, { room: updated }, 200);
  } catch (error) {
    handleError(error, res, 'updating room');
  }
});

/**
 * DELETE /rooms/:roomId
 *
 * Deletes a room by deleting its backing conversation (CASCADE deletes rooms row + pins).
 * MVP policy: starship owner/instance-admin only.
 */
router.delete('/rooms/:roomId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }

    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const conversationService = new ConversationService();
    const deleted = await conversationService.deleteConversation(room.conversationId);
    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }

    sendSuccess(res, { deleted: true }, 200);
  } catch (error) {
    handleError(error, res, 'deleting room');
  }
});

/**
 * GET /rooms/:roomId/notification-level
 */
router.get('/rooms/:roomId/notification-level', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const { room, conversationStarshipId } = await resolveRoomAccessArgs({ roomConversationId: params.roomId });
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!conversationStarshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId: params.roomId });
      return;
    }

    if (String(room.starshipId) !== String(conversationStarshipId)) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this room', 403, { roomId: params.roomId });
      return;
    }

    if (!(await verifyStarshipAccess(conversationStarshipId, authUserId, res))) return;
    // Rooms require explicit participation (public + private). No bypass.
    const participantRepo = new ConversationParticipantRepository();
    const ok = await participantRepo.isUserParticipant(authUserId, params.roomId).catch(() => false);
    if (!ok) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this room', 403, { resource: 'room', roomId: params.roomId });
      return;
    }

    const prefRepo = new ConversationNotificationPrefRepository();
    const pref = await prefRepo.get(params.roomId, authUserId);
    const rawLevel = typeof pref?.level === 'string' ? String(pref.level) : '';
    const level: z.infer<typeof RoomNotificationLevelSchema> =
      rawLevel === 'all' || rawLevel === 'mentions' || rawLevel === 'mute' ? rawLevel : 'mentions';
    sendSuccess(res, { level }, 200);
  } catch (error) {
    handleError(error, res, 'fetching room notification level');
  }
});

/**
 * PUT /rooms/:roomId/notification-level
 */
router.put('/rooms/:roomId/notification-level', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const body = validateData(z.object({ level: RoomNotificationLevelSchema }), req.body, res, 'notification level body');
    if (!body) return;

    const { room, conversationStarshipId } = await resolveRoomAccessArgs({ roomConversationId: params.roomId });
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!conversationStarshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId: params.roomId });
      return;
    }

    if (String(room.starshipId) !== String(conversationStarshipId)) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this room', 403, { roomId: params.roomId });
      return;
    }

    if (!(await verifyStarshipAccess(conversationStarshipId, authUserId, res))) return;
    // Rooms require explicit participation (public + private). No bypass.
    const participantRepo = new ConversationParticipantRepository();
    const ok = await participantRepo.isUserParticipant(authUserId, params.roomId).catch(() => false);
    if (!ok) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this room', 403, { resource: 'room', roomId: params.roomId });
      return;
    }

    const prefRepo = new ConversationNotificationPrefRepository();
    const pref = await prefRepo.upsert({ conversationId: params.roomId, userId: authUserId, level: body.level });
    sendSuccess(res, { level: pref.level }, 200);
  } catch (error) {
    handleError(error, res, 'updating room notification level');
  }
});

/**
 * POST /rooms/:roomId/members
 *
 * Adds a member to a room.
 *
 * Policy:
 * - Caller must be a room participant (no bypass).
 * - Public rooms: any participant can add another starship member.
 * - Private rooms: starship owner/instance-admin only (MVP).
 */
router.post('/rooms/:roomId/members', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const body = validateData(
      z.object({
        userId: IdSchema,
        role: z.enum(['member', 'admin']).optional(),
      }),
      req.body,
      res,
      'room member add'
    );
    if (!body) return;

    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    if (access.room.isPrivate) {
      if (!(await verifyStarshipOwnerAccess(access.room.starshipId, access.authUserId, res))) return;
    }

    const memberRepo = new StarshipMemberRepository();
    const okMember = await memberRepo.isMember(body.userId, access.room.starshipId).catch(() => false);
    if (!okMember) {
      sendError(res, 'VALIDATION_ERROR', 'User is not a member of this starship', 400, {
        userId: body.userId,
        starshipId: access.room.starshipId,
      });
      return;
    }

    const participantRepo = new ConversationParticipantRepository();
    const result = await participantRepo.addUserParticipant({
      conversationId: access.room.conversationId,
      userId: body.userId,
      role: access.room.isPrivate ? (body.role ?? 'member') : 'member',
      createdBy: access.authUserId,
    });

    sendSuccess(res, { created: result.created }, 200);
  } catch (error) {
    handleError(error, res, 'adding room member');
  }
});

/**
 * DELETE /rooms/:roomId/members/:userId
 *
 * Removes a member from a private room.
 * MVP policy: starship owner/instance-admin only.
 */
router.delete('/rooms/:roomId/members/:userId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, userId: IdSchema }), req.params, res, 'room member remove');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!room.isPrivate) {
      sendError(res, 'VALIDATION_ERROR', 'Cannot remove members from a public room', 400, { roomId: params.roomId });
      return;
    }

    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const conn = getConnection();
    const result = await conn.queryWithResult(`DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`, [
      room.conversationId,
      params.userId,
    ]);
    const removed = (result.rowCount ?? 0) > 0;
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'removing room member');
  }
});

// ============================================================================
// Pins API
// ============================================================================

router.get('/rooms/:roomId/pins', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const viewsRepo = new RoomViewsRepository();
    const datasetsRepo = new RoomDatasetsRepository();
    const boardsRepo = new RoomTaskBoardsRepository();

    const [views, datasets, taskBoards] = await Promise.all([
      viewsRepo.list(access.room.conversationId),
      datasetsRepo.list(access.room.conversationId),
      boardsRepo.list(access.room.conversationId),
    ]);

    sendSuccess(res, { views, datasets, taskBoards }, 200);
  } catch (error) {
    handleError(error, res, 'listing room pins');
  }
});

// ---------------------------------------------------------------------------
// Pinned resource "view" endpoints (return resolved resource objects in pin order)
// ---------------------------------------------------------------------------

router.get('/rooms/:roomId/resources', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const query = validateData(
      z.object({
        q: z.string().optional(),
        kinds: z.union([z.string(), z.array(z.string())]).optional(),
        includeArchived: z.coerce.boolean().optional(),
        limitPerKind: z.coerce.number().int().min(0).max(200).optional(),
      }),
      req.query,
      res,
      'room resources query'
    );
    if (!query) return;

    const q = String(query.q ?? '').trim();
    const hasQ = q.length > 0;
    const includeArchived = query.includeArchived ?? false;
    const limitPerKind = typeof query.limitPerKind === 'number' ? query.limitPerKind : null;

    const escapeLike = (input: string): string => {
      // Escape LIKE wildcards so user search is treated literally.
      // We use `... ILIKE $n ESCAPE '\'` in SQL.
      return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    };
    const qLike = hasQ ? `%${escapeLike(q)}%` : null;

    const rawKinds = query.kinds;
    const requestedKindsList =
      rawKinds == null ? null : Array.isArray(rawKinds) ? rawKinds.flatMap((v) => String(v).split(',')) : String(rawKinds).split(',');

    const normalizeKind = (input: string): 'views' | 'datasets' | 'taskBoards' | 'tools' | null | 'INVALID' => {
      const k = String(input || '')
        .trim()
        .toLowerCase();
      if (!k) return null;
      if (k === 'all' || k === '*') return null;
      if (k === 'views' || k === 'view') return 'views';
      if (k === 'datasets' || k === 'dataset') return 'datasets';
      if (k === 'taskboards' || k === 'task-boards' || k === 'boards' || k === 'board' || k === 'tasks') return 'taskBoards';
      if (k === 'tools' || k === 'tool') return 'tools';
      return 'INVALID';
    };

    const allKinds: Array<'views' | 'datasets' | 'taskBoards' | 'tools'> = ['views', 'datasets', 'taskBoards', 'tools'];
    const kindSet = new Set<'views' | 'datasets' | 'taskBoards' | 'tools'>(allKinds);
    if (requestedKindsList && requestedKindsList.length > 0) {
      const next = new Set<'views' | 'datasets' | 'taskBoards' | 'tools'>();
      for (const kRaw of requestedKindsList) {
        const nk = normalizeKind(kRaw);
        if (nk === null) {
          // 'all' or empty => treat as default (all)
          next.clear();
          for (const k of allKinds) next.add(k);
          break;
        }
        if (nk === 'INVALID') {
          sendError(res, 'VALIDATION_ERROR', `Invalid kind: ${String(kRaw)}`, 400, {
            allowed: allKinds,
            provided: requestedKindsList,
          });
          return;
        }
        next.add(nk);
      }
      if (next.size > 0) {
        kindSet.clear();
        for (const k of next) kindSet.add(k);
      }
    }

    const viewsRepo = new RoomViewsRepository();
    const datasetsRepo = new RoomDatasetsRepository();
    const boardsRepo = new RoomTaskBoardsRepository();
    const toolsRepo = new RoomToolsRepository();

    const [viewPins, datasetPins, boardPins, toolPins] = await Promise.all([
      kindSet.has('views') ? viewsRepo.list(access.room.conversationId) : Promise.resolve([]),
      kindSet.has('datasets') ? datasetsRepo.list(access.room.conversationId) : Promise.resolve([]),
      kindSet.has('taskBoards') ? boardsRepo.list(access.room.conversationId) : Promise.resolve([]),
      kindSet.has('tools') ? toolsRepo.list(access.room.conversationId) : Promise.resolve([]),
    ]);

    const conn = getConnection();

    const [userParticipantRows, agentParticipantRows] = await Promise.all([
      conn.query<{
        user_id: string;
        role: 'member' | 'admin' | null;
        display_name: string | null;
        avatar: string | null;
      }>(
        `SELECT cp.user_id,
                cp.role,
                u.display_name,
                COALESCE(NULLIF(u.avatar, ''), oa.oauth_avatar) as avatar
           FROM conversation_participants cp
           JOIN users u ON u.id = cp.user_id
           LEFT JOIN LATERAL (
             SELECT (profile_data->>'avatar') as oauth_avatar
               FROM oauth_accounts
              WHERE user_id = u.id
              ORDER BY updated_at DESC
              LIMIT 1
           ) oa ON true
          WHERE cp.conversation_id = $1
            AND cp.user_id IS NOT NULL
          ORDER BY COALESCE(u.display_name, ''), u.id`,
        [access.room.conversationId]
      ),
      conn.query<{
        id: string;
        slug: string;
        name: string;
      }>(
        `SELECT a.id, a.slug, a.name
           FROM conversation_participants cp
           JOIN agents a ON a.id = cp.agent_id
          WHERE cp.conversation_id = $1
            AND cp.agent_id IS NOT NULL
          ORDER BY a.name`,
        [access.room.conversationId]
      ),
    ]);

    const participants = {
      users: userParticipantRows
        .map((r) => {
          const id = String(r.user_id || '').trim();
          if (!id) return null;
          return {
            id,
            slug: `u:${id}`,
            displayName: r.display_name ?? null,
            avatar: r.avatar ?? null,
            role: r.role ?? null,
          };
        })
        .filter(Boolean),
      agents: agentParticipantRows
        .map((r) => {
          const id = String(r.id || '').trim();
          const slug = String(r.slug || '').trim();
          if (!id || !slug) return null;
          return { id, slug, name: String(r.name ?? '') };
        })
        .filter(Boolean),
    };

    const viewIds = viewPins.map((p) => String(p.viewId)).filter(Boolean);
    const datasetIds = datasetPins.map((p) => String(p.datasetId)).filter(Boolean);
    const boardIds = boardPins.map((p) => String(p.boardId)).filter(Boolean);
    const toolIds = toolPins.map((p) => String(p.toolId)).filter(Boolean);

    const [viewsRows, datasetRows, boardRows, toolRows] = await Promise.all([
      viewIds.length
        ? conn.query<{
            id: string;
            name: string;
            slug: string;
            description: string;
            created_at: string;
            updated_at: string;
          }>(
            `SELECT id, name, slug, description, created_at, updated_at
               FROM views
              WHERE id = ANY($1::text[])
                AND starship_id = $2
                ${
                  hasQ
                    ? `AND (
                         name ILIKE $3 ESCAPE '\\'
                      OR slug ILIKE $3 ESCAPE '\\'
                      OR COALESCE(description, '') ILIKE $3 ESCAPE '\\'
                    )`
                    : ''
                }`,
            hasQ ? [viewIds, access.conversationStarshipId, qLike] : [viewIds, access.conversationStarshipId]
          )
        : Promise.resolve([]),
      datasetIds.length
        ? conn.query<{
            id: string;
            name: string;
            slug: string;
            description: string;
            archived: boolean;
            created_at: string;
            updated_at: string;
          }>(
            `SELECT id, name, slug, description, archived, created_at, updated_at
               FROM starship_datasets
              WHERE id = ANY($1::text[])
                AND starship_id = $2
                ${includeArchived ? '' : `AND archived = FALSE`}
                ${
                  hasQ
                    ? `AND (
                         name ILIKE $3 ESCAPE '\\'
                      OR slug ILIKE $3 ESCAPE '\\'
                      OR COALESCE(description, '') ILIKE $3 ESCAPE '\\'
                    )`
                    : ''
                }`,
            hasQ ? [datasetIds, access.conversationStarshipId, qLike] : [datasetIds, access.conversationStarshipId]
          )
        : Promise.resolve([]),
      boardIds.length
        ? conn.query<{
            id: string;
            name: string;
            slug: string;
            description: string;
            archived: boolean;
            pos: number;
            created_at: string;
            updated_at: string;
          }>(
            `SELECT id, name, slug, description, archived, pos, created_at, updated_at
               FROM task_boards
              WHERE id = ANY($1::text[])
                AND starship_id = $2
                ${includeArchived ? '' : `AND archived = FALSE`}
                ${
                  hasQ
                    ? `AND (
                         name ILIKE $3 ESCAPE '\\'
                      OR slug ILIKE $3 ESCAPE '\\'
                      OR COALESCE(description, '') ILIKE $3 ESCAPE '\\'
                    )`
                    : ''
                }`,
            hasQ ? [boardIds, access.conversationStarshipId, qLike] : [boardIds, access.conversationStarshipId]
          )
        : Promise.resolve([]),
      toolIds.length
        ? conn.query<{
            id: string;
            name: string;
            slug: string;
            description: string;
            created_at: string;
            updated_at: string;
          }>(
            `SELECT id, name, slug, description, created_at, updated_at
               FROM tools
              WHERE id = ANY($1::text[])
                AND starship_id = $2
                ${
                  hasQ
                    ? `AND (
                         name ILIKE $3 ESCAPE '\\'
                      OR slug ILIKE $3 ESCAPE '\\'
                      OR COALESCE(description, '') ILIKE $3 ESCAPE '\\'
                    )`
                    : ''
                }`,
            hasQ ? [toolIds, access.conversationStarshipId, qLike] : [toolIds, access.conversationStarshipId]
          )
        : Promise.resolve([]),
    ]);

    const viewsById = new Map(viewsRows.map((r) => [String(r.id), r]));
    const datasetsById = new Map(datasetRows.map((r) => [String(r.id), r]));
    const boardsById = new Map(boardRows.map((r) => [String(r.id), r]));
    const toolsById = new Map(toolRows.map((r) => [String(r.id), r]));

    let views = viewPins
      .map((pin) => {
        const r = viewsById.get(String(pin.viewId));
        if (!r) return null;
        return {
          pin,
          view: {
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description ?? ''),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          },
        };
      })
      .filter(Boolean);

    let datasets = datasetPins
      .map((pin) => {
        const r = datasetsById.get(String(pin.datasetId));
        if (!r) return null;
        return {
          pin,
          dataset: {
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description ?? ''),
            archived: Boolean(r.archived),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          },
        };
      })
      .filter(Boolean);

    let taskBoards = boardPins
      .map((pin) => {
        const r = boardsById.get(String(pin.boardId));
        if (!r) return null;
        return {
          pin,
          taskBoard: {
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description ?? ''),
            archived: Boolean(r.archived),
            pos: Number(r.pos ?? 0),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          },
        };
      })
      .filter(Boolean);

    let tools = toolPins
      .map((pin) => {
        const r = toolsById.get(String(pin.toolId));
        if (!r) return null;
        return {
          assignment: pin,
          tool: {
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description ?? ''),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          },
        };
      })
      .filter(Boolean);

    if (limitPerKind != null) {
      if (limitPerKind === 0) {
        views = [];
        datasets = [];
        taskBoards = [];
        tools = [];
      } else {
        views = views.slice(0, limitPerKind);
        datasets = datasets.slice(0, limitPerKind);
        taskBoards = taskBoards.slice(0, limitPerKind);
        tools = tools.slice(0, limitPerKind);
      }
    }

    sendSuccess(res, { views, datasets, taskBoards, tools, participants }, 200);
  } catch (error) {
    handleError(error, res, 'listing room resources');
  }
});

router.get('/rooms/:roomId/pins/views', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const viewsRepo = new RoomViewsRepository();
    const pins = await viewsRepo.list(access.room.conversationId);
    const ids = pins.map((p) => String(p.viewId)).filter(Boolean);

    if (ids.length === 0) {
      sendSuccess(res, { items: [] }, 200);
      return;
    }

    const conn = getConnection();
    const rows = await conn.query<{
      id: string;
      name: string;
      slug: string;
      description: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, slug, description, created_at, updated_at
         FROM views
        WHERE id = ANY($1::text[])
          AND starship_id = $2`,
      [ids, access.conversationStarshipId]
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const items = pins
      .map((pin) => {
        const r = byId.get(String(pin.viewId));
        if (!r) return null;
        return {
          pin,
          view: {
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description ?? ''),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          },
        };
      })
      .filter(Boolean);

    sendSuccess(res, { items }, 200);
  } catch (error) {
    handleError(error, res, 'listing pinned views');
  }
});

router.get('/rooms/:roomId/pins/datasets', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const datasetsRepo = new RoomDatasetsRepository();
    const pins = await datasetsRepo.list(access.room.conversationId);
    const ids = pins.map((p) => String(p.datasetId)).filter(Boolean);

    if (ids.length === 0) {
      sendSuccess(res, { items: [] }, 200);
      return;
    }

    const conn = getConnection();
    const rows = await conn.query<{
      id: string;
      name: string;
      slug: string;
      description: string;
      archived: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, slug, description, archived, created_at, updated_at
         FROM starship_datasets
        WHERE id = ANY($1::text[])
          AND starship_id = $2`,
      [ids, access.conversationStarshipId]
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const items = pins
      .map((pin) => {
        const r = byId.get(String(pin.datasetId));
        if (!r) return null;
        return {
          pin,
          dataset: {
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description ?? ''),
            archived: Boolean(r.archived),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          },
        };
      })
      .filter(Boolean);

    sendSuccess(res, { items }, 200);
  } catch (error) {
    handleError(error, res, 'listing pinned datasets');
  }
});

router.get('/rooms/:roomId/pins/task-boards', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const boardsRepo = new RoomTaskBoardsRepository();
    const pins = await boardsRepo.list(access.room.conversationId);
    const ids = pins.map((p) => String(p.boardId)).filter(Boolean);

    if (ids.length === 0) {
      sendSuccess(res, { items: [] }, 200);
      return;
    }

    const conn = getConnection();
    const rows = await conn.query<{
      id: string;
      name: string;
      slug: string;
      description: string;
      archived: boolean;
      pos: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, slug, description, archived, pos, created_at, updated_at
         FROM task_boards
        WHERE id = ANY($1::text[])
          AND starship_id = $2`,
      [ids, access.conversationStarshipId]
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const items = pins
      .map((pin) => {
        const r = byId.get(String(pin.boardId));
        if (!r) return null;
        return {
          pin,
          taskBoard: {
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description ?? ''),
            archived: Boolean(r.archived),
            pos: Number(r.pos ?? 0),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          },
        };
      })
      .filter(Boolean);

    sendSuccess(res, { items }, 200);
  } catch (error) {
    handleError(error, res, 'listing pinned task boards');
  }
});

router.get('/rooms/:roomId/tools', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const toolsRepo = new RoomToolsRepository();
    const assignments = await toolsRepo.list(access.room.conversationId);
    const ids = assignments.map((p) => String(p.toolId)).filter(Boolean);

    if (ids.length === 0) {
      sendSuccess(res, { items: [] }, 200);
      return;
    }

    const conn = getConnection();
    const rows = await conn.query<{
      id: string;
      name: string;
      slug: string;
      description: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, slug, description, created_at, updated_at
         FROM tools
        WHERE id = ANY($1::text[])
          AND starship_id = $2`,
      [ids, access.conversationStarshipId]
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const items = assignments
      .map((assignment) => {
        const r = byId.get(String(assignment.toolId));
        if (!r) return null;
        return {
          assignment,
          tool: {
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description ?? ''),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          },
        };
      })
      .filter(Boolean);

    sendSuccess(res, { items }, 200);
  } catch (error) {
    handleError(error, res, 'listing room tools');
  }
});

router.post('/rooms/:roomId/tools', jwtAuthMiddleware, rateLimiters.apiAuthenticated, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(
      z.object({
        toolId: IdSchema,
        permission: z.enum(['allow', 'ask', 'deny']),
      }),
      req.body,
      res,
      'assign tool'
    );
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const toolRepo = new ToolRepository();
    const tool = await toolRepo.findById(body.toolId);
    if (!tool) {
      sendError(res, 'VALIDATION_ERROR', 'Tool not found', 400, { toolId: body.toolId });
      return;
    }
    if (String(tool.starshipId) !== String(room.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Assigned tool must belong to the same starship as the room', 400, {
        toolId: body.toolId,
        roomStarshipId: room.starshipId,
        toolStarshipId: tool.starshipId,
      });
      return;
    }

    const roomToolsRepo = new RoomToolsRepository();
    const assignment = await roomToolsRepo.upsert({
      roomConversationId: room.conversationId,
      toolId: body.toolId,
      permission: body.permission,
    });
    sendSuccess(res, { assignment }, 200);
  } catch (error) {
    handleError(error, res, 'assigning tool');
  }
});

router.delete('/rooms/:roomId/tools/:toolId', jwtAuthMiddleware, rateLimiters.apiAuthenticated, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, toolId: IdSchema }), req.params, res, 'tool assignment parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const roomToolsRepo = new RoomToolsRepository();
    const removed = await roomToolsRepo.remove(room.conversationId, params.toolId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'unassigning tool');
  }
});

router.post('/rooms/:roomId/pins/views', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(z.object({ viewId: IdSchema, position: z.number().int().min(0).optional() }), req.body, res, 'pin view');
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const viewRepo = new ViewRepository();
    const view = await viewRepo.findById(body.viewId);
    if (!view) {
      sendError(res, 'VALIDATION_ERROR', 'View not found', 400, { viewId: body.viewId });
      return;
    }
    if (String(view.starshipId) !== String(room.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Pinned view must belong to the same starship as the room', 400, {
        viewId: body.viewId,
        roomStarshipId: room.starshipId,
        viewStarshipId: view.starshipId,
      });
      return;
    }

    const pinnedViewsRepo = new RoomViewsRepository();
    const pin = await pinnedViewsRepo.upsert({
      roomConversationId: room.conversationId,
      viewId: body.viewId,
      position: body.position ?? null,
      createdBy: authUserId,
    });
    sendSuccess(res, { pin }, 200);
  } catch (error) {
    handleError(error, res, 'pinning view');
  }
});

router.delete('/rooms/:roomId/pins/views/:viewId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, viewId: IdSchema }), req.params, res, 'pin parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const pinnedViewsRepo = new RoomViewsRepository();
    const removed = await pinnedViewsRepo.remove(room.conversationId, params.viewId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'unpinning view');
  }
});

router.post('/rooms/:roomId/pins/datasets', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(
      z.object({ datasetId: IdSchema, position: z.number().int().min(0).optional() }),
      req.body,
      res,
      'pin dataset'
    );
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const datasetRepo = new StarshipDatasetRepository();
    const dataset = await datasetRepo.findById(body.datasetId);
    if (!dataset) {
      sendError(res, 'VALIDATION_ERROR', 'Dataset not found', 400, { datasetId: body.datasetId });
      return;
    }
    if (String(dataset.starshipId) !== String(room.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Pinned dataset must belong to the same starship as the room', 400, {
        datasetId: body.datasetId,
        roomStarshipId: room.starshipId,
        datasetStarshipId: dataset.starshipId,
      });
      return;
    }

    const pinnedRepo = new RoomDatasetsRepository();
    const pin = await pinnedRepo.upsert({
      roomConversationId: room.conversationId,
      datasetId: body.datasetId,
      position: body.position ?? null,
      createdBy: authUserId,
    });
    sendSuccess(res, { pin }, 200);
  } catch (error) {
    handleError(error, res, 'pinning dataset');
  }
});

router.delete('/rooms/:roomId/pins/datasets/:datasetId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, datasetId: IdSchema }), req.params, res, 'pin parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const pinnedRepo = new RoomDatasetsRepository();
    const removed = await pinnedRepo.remove(room.conversationId, params.datasetId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'unpinning dataset');
  }
});

router.post('/rooms/:roomId/pins/task-boards', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(
      z.object({ boardId: IdSchema, position: z.number().int().min(0).optional() }),
      req.body,
      res,
      'pin task board'
    );
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const boardRepo = new TaskBoardRepository();
    const board = await boardRepo.findById(body.boardId);
    if (!board) {
      sendError(res, 'VALIDATION_ERROR', 'Task board not found', 400, { boardId: body.boardId });
      return;
    }
    if (String(board.starshipId) !== String(room.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Pinned task board must belong to the same starship as the room', 400, {
        boardId: body.boardId,
        roomStarshipId: room.starshipId,
        boardStarshipId: board.starshipId,
      });
      return;
    }

    const pinnedRepo = new RoomTaskBoardsRepository();
    const pin = await pinnedRepo.upsert({
      roomConversationId: room.conversationId,
      boardId: body.boardId,
      position: body.position ?? null,
      createdBy: authUserId,
    });
    sendSuccess(res, { pin }, 200);
  } catch (error) {
    handleError(error, res, 'pinning task board');
  }
});

router.delete('/rooms/:roomId/pins/task-boards/:boardId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, boardId: IdSchema }), req.params, res, 'pin parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const pinnedRepo = new RoomTaskBoardsRepository();
    const removed = await pinnedRepo.remove(room.conversationId, params.boardId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'unpinning task board');
  }
});

router.post('/rooms/:roomId/pins/views/reorder', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(z.object({ viewIds: z.array(IdSchema) }), req.body, res, 'reorder pinned views');
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const pinnedRepo = new RoomViewsRepository();
    const existing = await pinnedRepo.list(room.conversationId);
    const existingIds = existing.map((p: { viewId: string }) => String(p.viewId));
    const nextIds = body.viewIds.map((x) => String(x));

    const uniq = new Set(nextIds);
    if (uniq.size !== nextIds.length) {
      sendError(res, 'VALIDATION_ERROR', 'Duplicate viewIds in reorder list', 400);
      return;
    }
    if (existingIds.length !== nextIds.length || existingIds.some((id: string) => !uniq.has(id))) {
      sendError(res, 'VALIDATION_ERROR', 'Reorder list must include exactly the currently pinned views', 400, {
        pinnedCount: existingIds.length,
        providedCount: nextIds.length,
      });
      return;
    }

    const conn = getConnection();
    const caseTemp = nextIds.map((_, idx) => `WHEN $${idx + 2} THEN ${-(idx + 1)}`).join(' ');
    const caseFinal = nextIds.map((_, idx) => `WHEN $${idx + 2} THEN ${idx}`).join(' ');
    const inList = nextIds.map((_, idx) => `$${idx + 2}`).join(', ');
    const args = [room.conversationId, ...nextIds];

    await conn.query('BEGIN');
    try {
      await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room_views:${room.conversationId}`]);
      await conn.query(
        `UPDATE room_views
            SET position = CASE view_id ${caseTemp} ELSE position END
          WHERE room_conversation_id = $1
            AND view_id IN (${inList})`,
        args
      );
      await conn.query(
        `UPDATE room_views
            SET position = CASE view_id ${caseFinal} ELSE position END
          WHERE room_conversation_id = $1
            AND view_id IN (${inList})`,
        args
      );
      await conn.query('COMMIT');
    } catch (e) {
      await conn.query('ROLLBACK');
      throw e;
    }

    const views = await pinnedRepo.list(room.conversationId);
    sendSuccess(res, { views }, 200);
  } catch (error) {
    handleError(error, res, 'reordering pinned views');
  }
});

router.post('/rooms/:roomId/pins/datasets/reorder', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(z.object({ datasetIds: z.array(IdSchema) }), req.body, res, 'reorder pinned datasets');
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const pinnedRepo = new RoomDatasetsRepository();
    const existing = await pinnedRepo.list(room.conversationId);
    const existingIds = existing.map((p: { datasetId: string }) => String(p.datasetId));
    const nextIds = body.datasetIds.map((x) => String(x));

    const uniq = new Set(nextIds);
    if (uniq.size !== nextIds.length) {
      sendError(res, 'VALIDATION_ERROR', 'Duplicate datasetIds in reorder list', 400);
      return;
    }
    if (existingIds.length !== nextIds.length || existingIds.some((id: string) => !uniq.has(id))) {
      sendError(res, 'VALIDATION_ERROR', 'Reorder list must include exactly the currently pinned datasets', 400, {
        pinnedCount: existingIds.length,
        providedCount: nextIds.length,
      });
      return;
    }

    const conn = getConnection();
    const caseTemp = nextIds.map((_, idx) => `WHEN $${idx + 2} THEN ${-(idx + 1)}`).join(' ');
    const caseFinal = nextIds.map((_, idx) => `WHEN $${idx + 2} THEN ${idx}`).join(' ');
    const inList = nextIds.map((_, idx) => `$${idx + 2}`).join(', ');
    const args = [room.conversationId, ...nextIds];

    await conn.query('BEGIN');
    try {
      await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room_datasets:${room.conversationId}`]);
      await conn.query(
        `UPDATE room_datasets
            SET position = CASE dataset_id ${caseTemp} ELSE position END
          WHERE room_conversation_id = $1
            AND dataset_id IN (${inList})`,
        args
      );
      await conn.query(
        `UPDATE room_datasets
            SET position = CASE dataset_id ${caseFinal} ELSE position END
          WHERE room_conversation_id = $1
            AND dataset_id IN (${inList})`,
        args
      );
      await conn.query('COMMIT');
    } catch (e) {
      await conn.query('ROLLBACK');
      throw e;
    }

    const datasets = await pinnedRepo.list(room.conversationId);
    sendSuccess(res, { datasets }, 200);
  } catch (error) {
    handleError(error, res, 'reordering pinned datasets');
  }
});

router.post('/rooms/:roomId/pins/task-boards/reorder', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(z.object({ boardIds: z.array(IdSchema) }), req.body, res, 'reorder pinned task boards');
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const pinnedRepo = new RoomTaskBoardsRepository();
    const existing = await pinnedRepo.list(room.conversationId);
    const existingIds = existing.map((p: { boardId: string }) => String(p.boardId));
    const nextIds = body.boardIds.map((x) => String(x));

    const uniq = new Set(nextIds);
    if (uniq.size !== nextIds.length) {
      sendError(res, 'VALIDATION_ERROR', 'Duplicate boardIds in reorder list', 400);
      return;
    }
    if (existingIds.length !== nextIds.length || existingIds.some((id: string) => !uniq.has(id))) {
      sendError(res, 'VALIDATION_ERROR', 'Reorder list must include exactly the currently pinned task boards', 400, {
        pinnedCount: existingIds.length,
        providedCount: nextIds.length,
      });
      return;
    }

    const conn = getConnection();
    const caseTemp = nextIds.map((_, idx) => `WHEN $${idx + 2} THEN ${-(idx + 1)}`).join(' ');
    const caseFinal = nextIds.map((_, idx) => `WHEN $${idx + 2} THEN ${idx}`).join(' ');
    const inList = nextIds.map((_, idx) => `$${idx + 2}`).join(', ');
    const args = [room.conversationId, ...nextIds];

    await conn.query('BEGIN');
    try {
      await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room_task_boards:${room.conversationId}`]);
      await conn.query(
        `UPDATE room_task_boards
            SET position = CASE board_id ${caseTemp} ELSE position END
          WHERE room_conversation_id = $1
            AND board_id IN (${inList})`,
        args
      );
      await conn.query(
        `UPDATE room_task_boards
            SET position = CASE board_id ${caseFinal} ELSE position END
          WHERE room_conversation_id = $1
            AND board_id IN (${inList})`,
        args
      );
      await conn.query('COMMIT');
    } catch (e) {
      await conn.query('ROLLBACK');
      throw e;
    }

    const taskBoards = await pinnedRepo.list(room.conversationId);
    sendSuccess(res, { taskBoards }, 200);
  } catch (error) {
    handleError(error, res, 'reordering pinned task boards');
  }
});

export default router;
