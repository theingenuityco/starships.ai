import type { Request, Response } from 'express';
import { sendError } from '@/utils/responseHelpers';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { StarshipService } from '@/services/StarshipService';
import { ChannelRepository, ConversationParticipantRepository, DirectMessageRepository, RoomRepository, getConnection } from '@starships/models';

/**
 * Enforce private channel membership (conversation-backed channels).
 *
 * Starship collaborators can see starship resources, but private channels are more restrictive:
 * - instance admin can always access
 * - starship owner can access (ONLY when the channel belongs to that starship)
 * - otherwise require a row in `conversation_participants` (user participant)
 *
 * IMPORTANT:
 * Always pass the conversation's authoritative starshipId. This prevents authorization
 * bypasses if a channel row is ever inconsistent (e.g. conversationId pointing at a
 * different starship than the conversation itself).
 */
export async function enforcePrivateChannelMembership(args: {
  conversationId: string;
  conversationStarshipId: string;
  userId: string;
  req: Request;
  res: Response;
}): Promise<boolean> {
  try {
    const channelRepo = new ChannelRepository();
    const channel = await channelRepo.findByConversationId(args.conversationId).catch(() => null);
    if (!channel || !channel.isPrivate) return true;

    // Fail closed if the channel row does not match the conversation's starship.
    if (String(channel.starshipId) !== String(args.conversationStarshipId)) {
      sendError(args.res, 'ACCESS_DENIED', 'Access denied to this channel', 403, {
        resource: 'channel',
        conversationId: args.conversationId,
        reason: 'starship_mismatch',
      });
      return false;
    }

    // Instance admin bypass
    if (isInstanceAdmin(args.req.user)) return true;

    // Starship owner bypass (only for this starship)
    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(channel.starshipId).catch(() => null);
    if (starship && String(starship.ownerId) === String(args.userId)) return true;

    const participantRepo = new ConversationParticipantRepository();
    const okParticipant = await participantRepo.isUserParticipant(args.userId, args.conversationId);
    if (okParticipant) return true;
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this channel', 403, {
      resource: 'channel',
      conversationId: args.conversationId,
    });
    return false;
  } catch {
    // Best-effort: if we cannot evaluate channel membership, fail closed for safety.
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this channel', 403, {
      resource: 'channel',
      conversationId: args.conversationId,
      reason: 'membership_check_failed',
    });
    return false;
  }
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

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(room.starshipId).catch(() => null);
    if (starship && String(starship.ownerId) === String(args.userId)) return true;

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
 * Enforce direct message membership (conversation-backed DMs).
 *
 * Starship collaborators can see starship resources, but DMs are always restricted:
 * - instance admin can always access
 * - otherwise require a row in `conversation_participants` (user participant)
 */
export async function enforceDirectMessageMembership(args: {
  conversationId: string;
  userId: string;
  req: Request;
  res: Response;
}): Promise<boolean> {
  try {
    const dmRepo = new DirectMessageRepository();
    const dm = await dmRepo.findByConversationId(args.conversationId).catch(() => null);
    if (!dm) return true;

    // Instance admin bypass
    if (isInstanceAdmin(args.req.user)) return true;

    const participantRepo = new ConversationParticipantRepository();
    const ok = await participantRepo.isUserParticipant(args.userId, args.conversationId);
    if (!ok) {
      sendError(args.res, 'ACCESS_DENIED', 'Access denied to this direct message', 403, {
        resource: 'direct_message',
        conversationId: args.conversationId,
      });
      return false;
    }
    return true;
  } catch {
    // Best-effort: if we cannot evaluate DM membership, fail closed for safety.
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this direct message', 403, {
      resource: 'direct_message',
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
  room: { starshipId: string; isPrivate: boolean } | null;
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
  const room = await roomRepo.findByConversationId(conversationId).catch(() => null);
  if (room) {
    return { isRoom: true, isRoomThread: false, roomConversationId: conversationId, room };
  }

  // Check parent conversation id chain (room threads can be nested multiple levels deep).
  try {
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
    const starshipId = typeof row?.starship_id === 'string' ? String(row.starship_id).trim() : '';
    const isPrivate = Boolean(row?.is_private);
    return {
      isRoom: false,
      isRoomThread: true,
      roomConversationId,
      room: starshipId ? { starshipId, isPrivate } : null,
    };
  } catch {
    return null;
  }
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
