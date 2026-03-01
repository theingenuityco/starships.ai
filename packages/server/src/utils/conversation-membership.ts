import type { Request, Response } from 'express';
import { sendError } from '@/utils/responseHelpers';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { StarshipService } from '@/services/StarshipService';
import { ChannelRepository, ConversationMemberRepository, ConversationParticipantRepository, DirectMessageRepository, RoomRepository } from '@starships/models';

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

    // Backward/repair compatibility: some older code paths wrote to `conversation_members` only.
    // Accept membership from either table (both are scoped to the same conversation id).
    const memberRepo = new ConversationMemberRepository();
    const okMember = await memberRepo.isMember(args.userId, args.conversationId).catch(() => false);
    if (!okMember) {
      sendError(args.res, 'ACCESS_DENIED', 'Access denied to this channel', 403, {
        resource: 'channel',
        conversationId: args.conversationId,
      });
      return false;
    }

    return true;
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
}): Promise<boolean> {
  try {
    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(args.conversationId).catch(() => null);
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

    const memberRepo = new ConversationMemberRepository();
    const okMember = await memberRepo.isMember(args.userId, args.conversationId).catch(() => false);
    if (!okMember) {
      sendError(args.res, 'ACCESS_DENIED', 'Access denied to this room', 403, {
        resource: 'room',
        conversationId: args.conversationId,
      });
      return false;
    }

    return true;
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
