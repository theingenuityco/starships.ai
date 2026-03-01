import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { ConversationService } from '@/services/ConversationService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import {
  AgentRepository,
  ConversationMemberRepository,
  ConversationNotificationPrefRepository,
  ConversationParticipantRepository,
  RoomAgentsRepository,
  RoomDatasetsRepository,
  RoomTaskBoardsRepository,
  RoomToolsRepository,
  RoomViewsRepository,
  RoomRepository,
  StarshipDatasetRepository,
  TaskBoardRepository,
  ToolRepository,
  ViewRepository,
  getConnection,
} from '@starships/models';
import type { RoomModel } from '@starships/protocol';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { StarshipService } from '@/services/StarshipService';
import { enforcePrivateRoomMembership } from '@/utils/conversation-membership';

const router: Router = Router();

const RoomSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((s) => s === s.trim(), 'slug must not have leading/trailing whitespace')
  .refine((s) => s === s.toLowerCase(), 'slug must be lowercase')
  .refine((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s), 'slug must be lowercase alphanumeric with hyphens');

const RoomNotificationLevelSchema = z.enum(['all', 'mentions', 'mute']);

async function resolveRoomAccessArgs(args: { roomConversationId: string }): Promise<{
  room: RoomModel | null;
  conversationStarshipId: string | null;
}> {
  const roomRepo = new RoomRepository();
  const room = await roomRepo.findByConversationId(args.roomConversationId);
  if (!room) return { room: null, conversationStarshipId: null };

  // Resolve starshipId from authoritative conversation row (defense-in-depth).
  const conn = getConnection();
  const convoRow = await conn.queryOne<{ starship_id: string }>('SELECT starship_id FROM conversations WHERE id = $1', [args.roomConversationId]);
  const conversationStarshipId = convoRow?.starship_id ? String(convoRow.starship_id) : '';
  return { room, conversationStarshipId: conversationStarshipId || null };
}

/**
 * GET /starships/:starshipId/rooms
 *
 * Lists rooms for a starship:
 * - public rooms are visible to all starship members
 * - private rooms are visible only to room members (owner/instance-admin can see all)
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

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(params.starshipId);
    const isOwner = !!starship && starship.ownerId === authUserId;
    const isAdmin = isInstanceAdmin(req.user);

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
          OR $2::boolean = true
          OR EXISTS (
            SELECT 1
            FROM conversation_members cm
            WHERE cm.conversation_id = r.conversation_id
              AND cm.user_id = $3
            LIMIT 1
          )
          OR EXISTS (
            SELECT 1
            FROM conversation_participants cp
            WHERE cp.conversation_id = r.conversation_id
              AND cp.user_id = $3
            LIMIT 1
          )
        )
      ORDER BY conv.updated_at DESC, conv.created_at DESC
      `,
      [params.starshipId, Boolean(isOwner || isAdmin), authUserId]
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
    const memberRepo = new ConversationMemberRepository();
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

      if (room.isPrivate) {
        await memberRepo.createOrIgnoreMember({
          conversationId: room.conversationId,
          userId: authUserId,
          role: 'admin',
          createdBy: authUserId,
        });
        await participantRepo.addUserParticipant({
          conversationId: room.conversationId,
          userId: authUserId,
          role: 'admin',
          createdBy: authUserId,
        });
      }

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
router.get('/rooms/:roomId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
    if (
      !(await enforcePrivateRoomMembership({
        conversationId: params.roomId,
        conversationStarshipId,
        userId: authUserId,
        room: { starshipId: room.starshipId, isPrivate: room.isPrivate },
        req,
        res,
      }))
    )
      return;

    sendSuccess(res, { room }, 200);
  } catch (error) {
    handleError(error, res, 'fetching room');
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
    if (nextIsPrivate === true) {
      const memberRepo = new ConversationMemberRepository();
      const participantRepo = new ConversationParticipantRepository();
      try {
        await memberRepo.createOrIgnoreMember({
          conversationId: room.conversationId,
          userId: authUserId,
          role: 'admin',
          createdBy: authUserId,
        });
      } catch {
        /* ignore */
      }
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
    if (
      !(await enforcePrivateRoomMembership({
        conversationId: params.roomId,
        conversationStarshipId,
        userId: authUserId,
        room: { starshipId: room.starshipId, isPrivate: room.isPrivate },
        req,
        res,
      }))
    )
      return;

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
    if (
      !(await enforcePrivateRoomMembership({
        conversationId: params.roomId,
        conversationStarshipId,
        userId: authUserId,
        room: { starshipId: room.starshipId, isPrivate: room.isPrivate },
        req,
        res,
      }))
    )
      return;

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
 * Adds a member to a private room.
 * MVP policy: starship owner/instance-admin only.
 */
router.post('/rooms/:roomId/members', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
        userId: IdSchema,
        role: z.enum(['member', 'admin']).optional(),
      }),
      req.body,
      res,
      'room member add'
    );
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!room.isPrivate) {
      sendError(res, 'VALIDATION_ERROR', 'Cannot add members to a public room', 400, { roomId: params.roomId });
      return;
    }

    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const memberRepo = new ConversationMemberRepository();
    const participantRepo = new ConversationParticipantRepository();
    const result = await memberRepo.createOrIgnoreMember({
      conversationId: room.conversationId,
      userId: body.userId,
      role: body.role ?? 'member',
      createdBy: authUserId,
    });
    await participantRepo.addUserParticipant({
      conversationId: room.conversationId,
      userId: body.userId,
      role: body.role ?? 'member',
      createdBy: authUserId,
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

    const memberRepo = new ConversationMemberRepository();
    const removed = await memberRepo.removeMember(room.conversationId, params.userId);
    // Best-effort: keep participants in sync; ignore failures.
    try {
      const conn = getConnection();
      await conn.query(`DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`, [room.conversationId, params.userId]);
    } catch {
      /* ignore */
    }
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
    if (
      !(await enforcePrivateRoomMembership({
        conversationId: params.roomId,
        conversationStarshipId,
        userId: authUserId,
        req,
        res,
      }))
    )
      return;

    const viewsRepo = new RoomViewsRepository();
    const datasetsRepo = new RoomDatasetsRepository();
    const boardsRepo = new RoomTaskBoardsRepository();
    const agentsRepo = new RoomAgentsRepository();
    const toolsRepo = new RoomToolsRepository();

    const [views, datasets, taskBoards, agents, tools] = await Promise.all([
      viewsRepo.list(room.conversationId),
      datasetsRepo.list(room.conversationId),
      boardsRepo.list(room.conversationId),
      agentsRepo.list(room.conversationId),
      toolsRepo.list(room.conversationId),
    ]);

    sendSuccess(res, { views, datasets, taskBoards, agents, tools }, 200);
  } catch (error) {
    handleError(error, res, 'listing room pins');
  }
});

router.post('/rooms/:roomId/pins/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(z.object({ agentId: IdSchema, position: z.number().int().min(0).optional() }), req.body, res, 'pin agent');
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const agentRepo = new AgentRepository();
    const agent = await agentRepo.findById(body.agentId);
    if (!agent) {
      sendError(res, 'VALIDATION_ERROR', 'Agent not found', 400, { agentId: body.agentId });
      return;
    }
    if (String(agent.starshipId) !== String(room.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Pinned agent must belong to the same starship as the room', 400, {
        agentId: body.agentId,
        roomStarshipId: room.starshipId,
        agentStarshipId: agent.starshipId,
      });
      return;
    }

    const pinnedRepo = new RoomAgentsRepository();
    const pin = await pinnedRepo.upsert({
      roomConversationId: room.conversationId,
      agentId: body.agentId,
      position: body.position ?? null,
      createdBy: authUserId,
    });
    sendSuccess(res, { pin }, 200);
  } catch (error) {
    handleError(error, res, 'pinning agent');
  }
});

router.delete('/rooms/:roomId/pins/agents/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, agentId: IdSchema }), req.params, res, 'pin parameter');
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

    const pinnedRepo = new RoomAgentsRepository();
    const removed = await pinnedRepo.remove(room.conversationId, params.agentId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'unpinning agent');
  }
});

router.post('/rooms/:roomId/pins/tools', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(z.object({ toolId: IdSchema, position: z.number().int().min(0).optional() }), req.body, res, 'pin tool');
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
      sendError(res, 'VALIDATION_ERROR', 'Pinned tool must belong to the same starship as the room', 400, {
        toolId: body.toolId,
        roomStarshipId: room.starshipId,
        toolStarshipId: tool.starshipId,
      });
      return;
    }

    const pinnedRepo = new RoomToolsRepository();
    const pin = await pinnedRepo.upsert({
      roomConversationId: room.conversationId,
      toolId: body.toolId,
      position: body.position ?? null,
      createdBy: authUserId,
    });
    sendSuccess(res, { pin }, 200);
  } catch (error) {
    handleError(error, res, 'pinning tool');
  }
});

router.delete('/rooms/:roomId/pins/tools/:toolId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, toolId: IdSchema }), req.params, res, 'pin parameter');
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

    const pinnedRepo = new RoomToolsRepository();
    const removed = await pinnedRepo.remove(room.conversationId, params.toolId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'unpinning tool');
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
    const body = validateData(z.object({ datasetId: IdSchema, position: z.number().int().min(0).optional() }), req.body, res, 'pin dataset');
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
    const body = validateData(z.object({ boardId: IdSchema, position: z.number().int().min(0).optional() }), req.body, res, 'pin task board');
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

router.post('/rooms/:roomId/pins/agents/reorder', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(z.object({ agentIds: z.array(IdSchema) }), req.body, res, 'reorder pinned agents');
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const pinnedRepo = new RoomAgentsRepository();
    const existing = await pinnedRepo.list(room.conversationId);
    const existingIds = existing.map((p: { agentId: string }) => String(p.agentId));
    const nextIds = body.agentIds.map((x) => String(x));

    const uniq = new Set(nextIds);
    if (uniq.size !== nextIds.length) {
      sendError(res, 'VALIDATION_ERROR', 'Duplicate agentIds in reorder list', 400);
      return;
    }
    if (existingIds.length !== nextIds.length || existingIds.some((id: string) => !uniq.has(id))) {
      sendError(res, 'VALIDATION_ERROR', 'Reorder list must include exactly the currently pinned agents', 400, {
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
      await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room_agents:${room.conversationId}`]);
      await conn.query(
        `UPDATE room_agents
            SET position = CASE agent_id ${caseTemp} ELSE position END
          WHERE room_conversation_id = $1
            AND agent_id IN (${inList})`,
        args
      );
      await conn.query(
        `UPDATE room_agents
            SET position = CASE agent_id ${caseFinal} ELSE position END
          WHERE room_conversation_id = $1
            AND agent_id IN (${inList})`,
        args
      );
      await conn.query('COMMIT');
    } catch (e) {
      await conn.query('ROLLBACK');
      throw e;
    }

    const agents = await pinnedRepo.list(room.conversationId);
    sendSuccess(res, { agents }, 200);
  } catch (error) {
    handleError(error, res, 'reordering pinned agents');
  }
});

router.post('/rooms/:roomId/pins/tools/reorder', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const body = validateData(z.object({ toolIds: z.array(IdSchema) }), req.body, res, 'reorder pinned tools');
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: params.roomId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, res))) return;

    const pinnedRepo = new RoomToolsRepository();
    const existing = await pinnedRepo.list(room.conversationId);
    const existingIds = existing.map((p: { toolId: string }) => String(p.toolId));
    const nextIds = body.toolIds.map((x) => String(x));

    const uniq = new Set(nextIds);
    if (uniq.size !== nextIds.length) {
      sendError(res, 'VALIDATION_ERROR', 'Duplicate toolIds in reorder list', 400);
      return;
    }
    if (existingIds.length !== nextIds.length || existingIds.some((id: string) => !uniq.has(id))) {
      sendError(res, 'VALIDATION_ERROR', 'Reorder list must include exactly the currently pinned tools', 400, {
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
      await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room_tools:${room.conversationId}`]);
      await conn.query(
        `UPDATE room_tools
            SET position = CASE tool_id ${caseTemp} ELSE position END
          WHERE room_conversation_id = $1
            AND tool_id IN (${inList})`,
        args
      );
      await conn.query(
        `UPDATE room_tools
            SET position = CASE tool_id ${caseFinal} ELSE position END
          WHERE room_conversation_id = $1
            AND tool_id IN (${inList})`,
        args
      );
      await conn.query('COMMIT');
    } catch (e) {
      await conn.query('ROLLBACK');
      throw e;
    }

    const tools = await pinnedRepo.list(room.conversationId);
    sendSuccess(res, { tools }, 200);
  } catch (error) {
    handleError(error, res, 'reordering pinned tools');
  }
});

export default router;

