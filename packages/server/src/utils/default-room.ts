import { ConversationParticipantRepository, RoomRepository, getConnection } from '@starships/models';
import type { RoomModel } from '@starships/protocol';
import { ConversationService } from '@/services/ConversationService';

const DEFAULT_ROOM_SLUG = 'lobby';
const DEFAULT_ROOM_NAME = 'Lobby';

/**
 * Ensure every starship has a default public room (#lobby).
 *
 * Idempotent:
 * - If it already exists, returns it.
 * - If concurrent callers race, one wins; the loser will roll back cleanly.
 */
export async function ensureLobbyRoomForStarship(args: { starshipId: string; createdByUserId: string }): Promise<RoomModel | null> {
  const starshipId = String(args.starshipId || '').trim();
  const createdByUserId = String(args.createdByUserId || '').trim();
  if (!starshipId || !createdByUserId) return null;

  const roomRepo = new RoomRepository();
  const existing = await roomRepo.findBySlug(DEFAULT_ROOM_SLUG, starshipId).catch(() => null);
  if (existing) {
    // Ensure creator is at least a participant (best-effort; idempotent).
    try {
      const participantRepo = new ConversationParticipantRepository();
      await participantRepo.addUserParticipant({
        conversationId: existing.conversationId,
        userId: createdByUserId,
        role: 'admin',
        createdBy: createdByUserId,
      });
    } catch {
      /* ignore */
    }
    return existing;
  }

  const conversationService = new ConversationService();
  const conversation = await conversationService.createConversation({
    title: DEFAULT_ROOM_NAME,
    status: 'active',
    starshipId,
  });

  try {
    const created = await roomRepo.create({
      conversationId: conversation.id,
      starshipId,
      slug: DEFAULT_ROOM_SLUG,
      name: DEFAULT_ROOM_NAME,
      isPrivate: false,
      topic: null,
    });

    // Creator becomes admin participant (idempotent).
    try {
      const participantRepo = new ConversationParticipantRepository();
      await participantRepo.addUserParticipant({
        conversationId: created.conversationId,
        userId: createdByUserId,
        role: 'admin',
        createdBy: createdByUserId,
      });
    } catch {
      /* ignore */
    }

    return created;
  } catch (e) {
    // If we lost a uniqueness race on slug, prefer the winner (do NOT delete anything owned by the winner).
    const winner = await roomRepo.findBySlug(DEFAULT_ROOM_SLUG, starshipId).catch(() => null);
    if (winner) {
      void conversationService.deleteConversation(conversation.id).catch(() => undefined);
      return winner;
    }
    throw e;
  }
}

