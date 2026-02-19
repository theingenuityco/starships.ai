import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { ConversationService } from '@/services/ConversationService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { ChannelRepository, ConversationMemberRepository, ConversationNotificationPrefRepository, getConnection } from '@starships/models';
import type { ChannelModel } from '@starships/protocol';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { StarshipService } from '@/services/StarshipService';
import { enforcePrivateChannelMembership } from '@/utils/conversation-membership';

const router: Router = Router();

const ChannelSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((s) => s === s.trim(), 'slug must not have leading/trailing whitespace')
  .refine((s) => s === s.toLowerCase(), 'slug must be lowercase')
  .refine((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s), 'slug must be lowercase alphanumeric with hyphens');

const ChannelNotificationLevelSchema = z.enum(['all', 'mentions', 'mute']);

/**
 * GET /starships/:starshipId/channels
 *
 * Lists channels for a starship:
 * - public channels are visible to all starship members
 * - private channels are visible only to channel members (owner/instance-admin can see all)
 */
router.get('/starships/:starshipId/channels', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(params.starshipId);
    const isOwner = !!starship && starship.ownerId === authUserId;
    const isAdmin = isInstanceAdmin(req.user);

    const conn = getConnection();

    // NOTE: Conversation-backed channel id is channels.conversation_id
    // We join conversations so the client can sort by activity and navigate using conversationId.
    const rows = await conn.query<{
      conversation_id: string;
      starship_id: string;
      slug: string;
      name: string;
      is_private: boolean;
      channel_type?: string | null;
      topic: string | null;
      created_at: string;
      updated_at: string;
      conversation_created_at: string;
      conversation_updated_at: string;
    }>(
      `
      SELECT
        c.*,
        conv.created_at as conversation_created_at,
        conv.updated_at as conversation_updated_at
      FROM channels c
      INNER JOIN conversations conv ON conv.id = c.conversation_id
      WHERE c.starship_id = $1
        AND (
          c.is_private = false
          OR $2::boolean = true
          OR EXISTS (
            SELECT 1
            FROM conversation_members cm
            WHERE cm.conversation_id = c.conversation_id
              AND cm.user_id = $3
            LIMIT 1
          )
        )
      ORDER BY conv.updated_at DESC, conv.created_at DESC
      `,
      [params.starshipId, Boolean(isOwner || isAdmin), authUserId]
    );

    const channels: ChannelModel[] = rows.map((r) => ({
      conversationId: String(r.conversation_id),
      starshipId: String(r.starship_id),
      slug: String(r.slug),
      name: String(r.name),
      isPrivate: Boolean(r.is_private),
      channelType:
        String((r as any).channel_type || 'chat')
          .trim()
          .toLowerCase() === 'forum'
          ? 'forum'
          : 'chat',
      topic: r.topic ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    sendSuccess(res, { channels }, 200);
  } catch (error) {
    handleError(error, res, 'listing channels');
  }
});

/**
 * POST /starships/:starshipId/channels
 *
 * Creates a conversation-backed channel.
 */
router.post('/starships/:starshipId/channels', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
        slug: ChannelSlugSchema,
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
      'channel create'
    );
    if (!body) return;

    const conversationService = new ConversationService();
    const channelRepo = new ChannelRepository();
    const memberRepo = new ConversationMemberRepository();

    // Create backing conversation first (reuses existing conversation page + message routes).
    const conversation = await conversationService.createConversation({
      title: body.name,
      status: 'active',
      starshipId: params.starshipId,
    });

    try {
      const channel = await channelRepo.create({
        conversationId: conversation.id,
        starshipId: params.starshipId,
        slug: body.slug,
        name: body.name,
        isPrivate: Boolean(body.isPrivate),
        topic: body.topic ?? null,
      });

      // Private channels: add creator as a member (idempotent).
      if (channel.isPrivate) {
        await memberRepo.createOrIgnoreMember({
          conversationId: channel.conversationId,
          userId: authUserId,
          role: 'admin',
          createdBy: authUserId,
        });
      }

      sendSuccess(res, { channel, conversationId: conversation.id }, 201);
    } catch (e) {
      // Best-effort cleanup if channel row insert fails (e.g. slug uniqueness conflict).
      try {
        await conversationService.deleteConversation(conversation.id);
      } catch {
        /* ignore */
      }
      throw e;
    }
  } catch (error) {
    handleError(error, res, 'creating channel');
  }
});

/**
 * PATCH /channels/:channelId
 *
 * Updates a conversation-backed channel. MVP policy: starship owner/instance-admin only.
 *
 * Notes:
 * - `channelId` is the backing conversation id (channels.conversation_id).
 * - We keep conversation.title in sync with channel.name for UI consistency.
 */
router.patch('/channels/:channelId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ channelId: IdSchema }), req.params, res, 'channel parameter');
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
      'channel update'
    );
    if (!body) return;

    const channelRepo = new ChannelRepository();
    const channel = await channelRepo.findByConversationId(params.channelId);
    if (!channel) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Channel not found', 404, { channelId: params.channelId });
      return;
    }

    // MVP: owner-only (owner/instance-admin).
    if (!(await verifyStarshipOwnerAccess(channel.starshipId, authUserId, res))) return;

    const conn = getConnection();
    const nextName = body.name !== undefined ? String(body.name) : undefined;
    const nextIsPrivate = body.isPrivate !== undefined ? Boolean(body.isPrivate) : undefined;
    const nextTopic = body.topic !== undefined ? (body.topic ?? null) : undefined;

    // Update the channels row.
    const setParts: string[] = [];
    const values: any[] = [];
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
    // Always bump updated_at.
    setParts.push(`updated_at = NOW()`);

    const sql = `
      UPDATE channels
         SET ${setParts.join(', ')}
       WHERE conversation_id = $${i++}
       RETURNING *;
    `;
    values.push(channel.conversationId);

    const updatedRow = await conn.queryOne<Record<string, any>>(sql, values);
    if (!updatedRow) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update channel', 500);
      return;
    }

    // Keep backing conversation title in sync with channel name.
    if (nextName !== undefined) {
      const conversationService = new ConversationService();
      try {
        await conversationService.updateConversation(channel.conversationId, { title: nextName });
      } catch (e) {
        // Best-effort: channel update already persisted; conversation title mismatch is non-fatal.
        // (The UI will fall back to channel.name in navigation.)
      }
    }

    // If the channel is now private, ensure the updater is a member (idempotent).
    if (nextIsPrivate === true) {
      const memberRepo = new ConversationMemberRepository();
      try {
        await memberRepo.createOrIgnoreMember({
          conversationId: channel.conversationId,
          userId: authUserId,
          role: 'admin',
          createdBy: authUserId,
        });
      } catch {
        /* ignore */
      }
    }

    const updated: ChannelModel = {
      conversationId: String(updatedRow.conversation_id),
      starshipId: String(updatedRow.starship_id),
      slug: String(updatedRow.slug),
      name: String(updatedRow.name),
      isPrivate: Boolean(updatedRow.is_private),
      channelType:
        String((updatedRow as any).channel_type || 'chat')
          .trim()
          .toLowerCase() === 'forum'
          ? 'forum'
          : 'chat',
      topic: updatedRow.topic ?? null,
      createdAt: String(updatedRow.created_at),
      updatedAt: String(updatedRow.updated_at),
    };

    sendSuccess(res, { channel: updated }, 200);
  } catch (error) {
    handleError(error, res, 'updating channel');
  }
});

/**
 * GET /channels/:channelId/notification-level
 *
 * Returns the current user's notification level preference for this channel.
 * Default when no preference exists: 'mentions'.
 */
router.get('/channels/:channelId/notification-level', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ channelId: IdSchema }), req.params, res, 'channel parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const channelRepo = new ChannelRepository();
    const channel = await channelRepo.findByConversationId(params.channelId);
    if (!channel) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Channel not found', 404, { channelId: params.channelId });
      return;
    }

    // Resolve starshipId from authoritative conversation row (defense-in-depth).
    const conn = getConnection();
    const convoRow = await conn.queryOne<{ starship_id: string }>('SELECT starship_id FROM conversations WHERE id = $1', [params.channelId]);
    const conversationStarshipId = convoRow?.starship_id ? String(convoRow.starship_id) : '';
    if (!conversationStarshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId: params.channelId });
      return;
    }

    // Fail closed if channel row starship_id ever diverges from the conversation.
    if (String(channel.starshipId) !== String(conversationStarshipId)) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this channel', 403, { channelId: params.channelId });
      return;
    }

    if (!(await verifyStarshipAccess(conversationStarshipId, authUserId, res))) return;
    if (
      !(await enforcePrivateChannelMembership({
        conversationId: params.channelId,
        conversationStarshipId,
        userId: authUserId,
        req,
        res,
      }))
    )
      return;

    const prefRepo = new ConversationNotificationPrefRepository();
    const pref = await prefRepo.get(params.channelId, authUserId);
    const level = (pref?.level as any) || 'mentions';
    sendSuccess(res, { level }, 200);
  } catch (error) {
    handleError(error, res, 'fetching channel notification level');
  }
});

/**
 * PUT /channels/:channelId/notification-level
 *
 * Updates the current user's notification level preference for this channel.
 */
router.put('/channels/:channelId/notification-level', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ channelId: IdSchema }), req.params, res, 'channel parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const body = validateData(z.object({ level: ChannelNotificationLevelSchema }), req.body, res, 'notification level body');
    if (!body) return;

    const channelRepo = new ChannelRepository();
    const channel = await channelRepo.findByConversationId(params.channelId);
    if (!channel) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Channel not found', 404, { channelId: params.channelId });
      return;
    }

    // Resolve starshipId from authoritative conversation row (defense-in-depth).
    const conn = getConnection();
    const convoRow = await conn.queryOne<{ starship_id: string }>('SELECT starship_id FROM conversations WHERE id = $1', [params.channelId]);
    const conversationStarshipId = convoRow?.starship_id ? String(convoRow.starship_id) : '';
    if (!conversationStarshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId: params.channelId });
      return;
    }

    if (String(channel.starshipId) !== String(conversationStarshipId)) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this channel', 403, { channelId: params.channelId });
      return;
    }

    if (!(await verifyStarshipAccess(conversationStarshipId, authUserId, res))) return;
    if (
      !(await enforcePrivateChannelMembership({
        conversationId: params.channelId,
        conversationStarshipId,
        userId: authUserId,
        req,
        res,
      }))
    )
      return;

    const prefRepo = new ConversationNotificationPrefRepository();
    const pref = await prefRepo.upsert({ conversationId: params.channelId, userId: authUserId, level: body.level });
    sendSuccess(res, { level: pref.level }, 200);
  } catch (error) {
    handleError(error, res, 'updating channel notification level');
  }
});

/**
 * DELETE /channels/:channelId
 *
 * Deletes a channel by deleting its backing conversation (CASCADE deletes channels row).
 * MVP policy: starship owner/instance-admin only.
 */
router.delete('/channels/:channelId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ channelId: IdSchema }), req.params, res, 'channel parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const channelRepo = new ChannelRepository();
    const channel = await channelRepo.findByConversationId(params.channelId);
    if (!channel) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Channel not found', 404, { channelId: params.channelId });
      return;
    }

    if (!(await verifyStarshipOwnerAccess(channel.starshipId, authUserId, res))) return;

    // Prevent deleting the starship default channel (DB FK will also enforce this).
    const conn = getConnection();
    const starshipRow = await conn.queryOne<{ default_channel_conversation_id: string | null }>(
      `SELECT default_channel_conversation_id FROM starships WHERE id = $1`,
      [channel.starshipId]
    );
    const defaultCid = typeof starshipRow?.default_channel_conversation_id === 'string' ? String(starshipRow.default_channel_conversation_id) : '';
    if (defaultCid && defaultCid === channel.conversationId) {
      sendError(res, 'VALIDATION_ERROR', 'Cannot delete the default channel', 400, { channelId: params.channelId });
      return;
    }

    const conversationService = new ConversationService();
    const deleted = await conversationService.deleteConversation(channel.conversationId);
    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Channel not found', 404, { channelId: params.channelId });
      return;
    }

    sendSuccess(res, { deleted: true }, 200);
  } catch (error) {
    handleError(error, res, 'deleting channel');
  }
});

/**
 * POST /channels/:channelId/members
 *
 * Adds a member to a private channel.
 * MVP policy: starship owner/instance-admin only.
 */
router.post('/channels/:channelId/members', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ channelId: IdSchema }), req.params, res, 'channel parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const body = validateData(
      z.object({
        userId: IdSchema,
        role: z.enum(['member', 'admin']).optional(),
      }),
      req.body,
      res,
      'channel member add'
    );
    if (!body) return;

    const channelRepo = new ChannelRepository();
    const channel = await channelRepo.findByConversationId(params.channelId);
    if (!channel) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Channel not found', 404, { channelId: params.channelId });
      return;
    }
    if (!channel.isPrivate) {
      sendError(res, 'VALIDATION_ERROR', 'Cannot add members to a public channel', 400, { channelId: params.channelId });
      return;
    }

    // MVP: owner-only (owner/admin/instance-admin). Tighten later if desired.
    if (!(await verifyStarshipOwnerAccess(channel.starshipId, authUserId, res))) return;

    const memberRepo = new ConversationMemberRepository();
    const result = await memberRepo.createOrIgnoreMember({
      conversationId: channel.conversationId,
      userId: body.userId,
      role: body.role ?? 'member',
      createdBy: authUserId,
    });

    sendSuccess(res, { created: result.created }, 200);
  } catch (error) {
    handleError(error, res, 'adding channel member');
  }
});

/**
 * DELETE /channels/:channelId/members/:userId
 *
 * Removes a member from a private channel.
 * MVP policy: starship owner/instance-admin only.
 */
router.delete('/channels/:channelId/members/:userId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ channelId: IdSchema, userId: IdSchema }), req.params, res, 'channel member remove');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const channelRepo = new ChannelRepository();
    const channel = await channelRepo.findByConversationId(params.channelId);
    if (!channel) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Channel not found', 404, { channelId: params.channelId });
      return;
    }
    if (!channel.isPrivate) {
      sendError(res, 'VALIDATION_ERROR', 'Cannot remove members from a public channel', 400, { channelId: params.channelId });
      return;
    }

    if (!(await verifyStarshipOwnerAccess(channel.starshipId, authUserId, res))) return;

    const memberRepo = new ConversationMemberRepository();
    const removed = await memberRepo.removeMember(channel.conversationId, params.userId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'removing channel member');
  }
});

export default router;
