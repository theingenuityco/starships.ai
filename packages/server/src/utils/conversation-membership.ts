import type { Request, Response } from 'express';
import { sendError } from '@/utils/responseHelpers';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { ConversationParticipantRepository, RoomRepository, getConnection } from '@starships/models';

/**
 * Enforce private channel membership (deprecated).
 *
 * Channels are removed; this is kept as a no-op to avoid breaking call sites
 * that still invoke it as part of generic conversation access checks.
 */
export async function enforcePrivateChannelMembership(args: {
  conversationId: string;
  conversationStarshipId: string;
  userId: string;
  req: Request;
  res: Response;
}): Promise<boolean> {
  return true;
}

/**
 * Enforce private room membership (conversation-backed rooms).
 *
 * Same policy as private channels.
 */
export async function enforcePrivateRoomMembership(args: {
  conversationId: string;
  conversationStarshipId: string;
  userId: string;
  req: Request;
  res: Response;
  /** Optional already-fetched room to avoid redundant DB lookup. */
  room?: { starshipId: string; isPrivate: boolean } | null;
}): Promise<boolean> {
  try {
    const room =
      args.room ??
      (await (async () => {
        const roomRepo = new RoomRepository();
        return await roomRepo.findByConversationId(args.conversationId).catch(() => null);
      })());
    if (!room || !room.isPrivate) return true;

    if (String(room.starshipId) !== String(args.conversationStarshipId)) {
      sendError(args.res, 'ACCESS_DENIED', 'Access denied to this room', 403, {
        resource: 'room',
        conversationId: args.conversationId,
        reason: 'starship_mismatch',
      });
      return false;
    }

    if (isInstanceAdmin(args.req.user)) return true;

    const participantRepo = new ConversationParticipantRepository();
    const okParticipant = await participantRepo.isUserParticipant(args.userId, args.conversationId);
    if (okParticipant) return true;
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this room', 403, {
      resource: 'room',
      conversationId: args.conversationId,
    });
    return false;
  } catch {
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this room', 403, {
      resource: 'room',
      conversationId: args.conversationId,
      reason: 'membership_check_failed',
    });
    return false;
  }
}

/**
 * Enforce explicit conversation membership when a conversation has user participants.
 *
 * This replaces DM gating after removing the `direct_messages` surface:
 * - If a conversation has no user participants, treat it as starship-visible (subject to outer starship access checks).
 * - If it has at least one user participant row, require the requester to be a participant (instance admin bypass).
 */
export async function enforceDirectMessageMembership(args: {
  conversationId: string;
  userId: string;
  req: Request;
  res: Response;
}): Promise<boolean> {
  try {
    const conn = getConnection();
    const row = await conn.queryOne<{ has_users: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
          FROM conversation_participants cp
         WHERE cp.conversation_id = $1
           AND cp.user_id IS NOT NULL
         LIMIT 1
      ) AS has_users
      `,
      [args.conversationId]
    );
    const hasUserParticipants = Boolean(row?.has_users);
    if (!hasUserParticipants) return true;

    // Instance admin bypass
    if (isInstanceAdmin(args.req.user)) return true;

    const participantRepo = new ConversationParticipantRepository();
    const ok = await participantRepo.isUserParticipant(args.userId, args.conversationId);
    if (!ok) {
      sendError(args.res, 'ACCESS_DENIED', 'Access denied to this conversation', 403, {
        resource: 'conversation',
        conversationId: args.conversationId,
      });
      return false;
    }
    return true;
  } catch {
    // Best-effort: if we cannot evaluate membership, fail closed for safety.
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this conversation', 403, {
      resource: 'conversation',
      conversationId: args.conversationId,
      reason: 'membership_check_failed',
    });
    return false;
  }
}

type RoomConversationContext = {
  /** True when the checked conversation is the room conversation itself. */
  isRoom: boolean;
  /** True when the checked conversation is a child thread whose parent is a room. */
  isRoomThread: boolean;
  /** The room's backing conversation id (when isRoom or isRoomThread). */
  roomConversationId: string;
  /** Best-effort: room row, if loaded. */
  room: { starshipId: string; isPrivate: boolean; managerAgentId?: string | null; managerAgentHeartbeatAt?: string | null } | null;
};

/**
 * Resolve whether a conversation is a room conversation or a room thread.
 *
 * IMPORTANT:
 * - We treat room membership as membership of the *room conversation* itself.
 * - Threads inherit room membership from their parent room (parent_conversation_id).
 */
export async function resolveRoomConversationContext(args: { conversationId: string }): Promise<RoomConversationContext | null> {
  const conversationId = String(args.conversationId || '').trim();
  if (!conversationId) return null;

  const roomRepo = new RoomRepository();
  const room = await roomRepo.findByConversationId(conversationId);
  if (room) {
    return { isRoom: true, isRoomThread: false, roomConversationId: conversationId, room };
  }

  // Check parent conversation id chain (room threads can be nested multiple levels deep).
  const conn = getConnection();
  const MAX_DEPTH = 50;
  const row = await conn.queryOne<{ room_conversation_id: string; starship_id: string; is_private: boolean }>(
    `
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_conversation_id, 0 AS depth
        FROM conversations
       WHERE id = $1
      UNION ALL
      SELECT c.id, c.parent_conversation_id, a.depth + 1 AS depth
        FROM conversations c
        JOIN ancestors a ON c.id = a.parent_conversation_id
       WHERE a.parent_conversation_id IS NOT NULL
         AND a.depth < $2
    )
    SELECT r.conversation_id AS room_conversation_id,
           r.starship_id,
           r.is_private
      FROM ancestors a
      JOIN rooms r ON r.conversation_id = a.id
     WHERE a.depth > 0
     ORDER BY a.depth ASC
     LIMIT 1
    `,
    [conversationId, MAX_DEPTH]
  );
  const roomConversationId = typeof row?.room_conversation_id === 'string' ? String(row.room_conversation_id).trim() : '';
  if (!roomConversationId) return null;

  // Load the full room row so callers (routing, UI policies) can access fields like managerAgentId.
  const resolvedRoom = await roomRepo.findByConversationId(roomConversationId).catch(() => null);
  if (resolvedRoom) {
    return {
      isRoom: false,
      isRoomThread: true,
      roomConversationId,
      room: resolvedRoom,
    };
  }

  // Fallback: if the room row cannot be loaded, at least return basic membership metadata.
  const starshipId = typeof row?.starship_id === 'string' ? String(row.starship_id).trim() : '';
  const isPrivate = Boolean(row?.is_private);
  return {
    isRoom: false,
    isRoomThread: true,
    roomConversationId,
    room: starshipId ? { starshipId, isPrivate } : null,
  };
}

/**
 * Enforce explicit room participation for rooms + room threads.
 *
 * Policy (per product requirement):
 * - NO owner/admin bypass.
 * - If `conversationId` is a room OR a child thread of a room, the user must be a participant of the room conversation.
 */
export async function enforceRoomParticipantMembershipForConversation(args: {
  conversationId: string;
  conversationStarshipId: string;
  userId: string;
  req: Request;
  res: Response;
  /**
   * Optional status code override for endpoints that must not return non-2xx
   * (e.g. server-tools HttpRequest wrappers).
   */
  statusCode?: number;
}): Promise<boolean> {
  try {
    const ctx = await resolveRoomConversationContext({ conversationId: args.conversationId });
    if (!ctx) return true;

    // Defense-in-depth: fail closed if room row does not match conversation starship.
    const statusCode = typeof args.statusCode === 'number' ? args.statusCode : 403;

    if (ctx.room && String(ctx.room.starshipId) !== String(args.conversationStarshipId)) {
      sendError(args.res, 'ACCESS_DENIED', 'Access denied to this room', statusCode, {
        resource: 'room',
        conversationId: args.conversationId,
        roomConversationId: ctx.roomConversationId,
        reason: 'starship_mismatch',
      });
      return false;
    }

    const participantRepo = new ConversationParticipantRepository();
    const ok = await participantRepo.isUserParticipant(args.userId, ctx.roomConversationId);
    if (ok) return true;

    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this room', statusCode, {
      resource: 'room',
      conversationId: args.conversationId,
      roomConversationId: ctx.roomConversationId,
      reason: 'room_membership_required',
      kind: ctx.isRoom ? 'room' : 'room_thread',
    });
    return false;
  } catch {
    const statusCode = typeof args.statusCode === 'number' ? args.statusCode : 403;
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this room', statusCode, {
      resource: 'room',
      conversationId: args.conversationId,
      reason: 'membership_check_failed',
    });
    return false;
  }
}
