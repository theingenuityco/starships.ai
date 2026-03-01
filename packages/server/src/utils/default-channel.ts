import { ChannelRepository, getConnection } from '@starships/models';
import type { ChannelModel } from '@starships/protocol';
import { ConversationService } from '@/services/ConversationService';

const DEFAULT_CHANNEL_SLUG = 'lobby';
const DEFAULT_CHANNEL_NAME = 'Lobby';

/**
 * Ensure every starship has a default public channel (#lobby).
 *
 * Idempotent:
 * - If it already exists, returns it.
 * - If concurrent callers race, one wins; the loser will roll back cleanly.
 */
export async function ensureDefaultChannelForStarship(args: {
  starshipId: string;
  createdByUserId?: string;
}): Promise<ChannelModel | null> {
  const conn = getConnection();

  const existing = await conn
    .queryOne<{
      conversation_id: string;
      starship_id: string;
      slug: string;
      name: string;
      is_private: boolean;
      topic: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT *
         FROM channels
        WHERE starship_id = $1
          AND lower(slug) = $2
        LIMIT 1`,
      [args.starshipId, DEFAULT_CHANNEL_SLUG]
    )
    .catch(() => null);

  if (existing) {
    // Best-effort: persist the default channel pointer on the starship (migration adds the column).
    try {
      await conn.query(`UPDATE starships SET default_channel_conversation_id = $1, updated_at = NOW() WHERE id = $2`, [
        existing.conversation_id,
        args.starshipId,
      ]);
    } catch {
      /* ignore (pre-migration compatibility) */
    }

    return {
      conversationId: String(existing.conversation_id),
      starshipId: String(existing.starship_id),
      slug: String(existing.slug),
      name: String(existing.name),
      isPrivate: Boolean(existing.is_private),
      channelType: 'chat',
      topic: existing.topic ?? null,
      createdAt: String(existing.created_at),
      updatedAt: String(existing.updated_at),
    };
  }

  const conversationService = new ConversationService();
  const channelRepo = new ChannelRepository();

  const conversation = await conversationService.createConversation({
    title: DEFAULT_CHANNEL_NAME,
    status: 'active',
    starshipId: args.starshipId,
  });

  try {
    const channel = await channelRepo.create({
      conversationId: conversation.id,
      starshipId: args.starshipId,
      slug: DEFAULT_CHANNEL_SLUG,
      name: DEFAULT_CHANNEL_NAME,
      isPrivate: false,
      topic: null,
    });

    try {
      await conn.query(`UPDATE starships SET default_channel_conversation_id = $1, updated_at = NOW() WHERE id = $2`, [
        channel.conversationId,
        args.starshipId,
      ]);
    } catch {
      /* ignore (pre-migration compatibility) */
    }

    return channel;
  } catch (e) {
    // If we lost a uniqueness race on slug, prefer the winner (do NOT delete anything here).
    const winner = await conn
      .queryOne<{
        conversation_id: string;
        starship_id: string;
        slug: string;
        name: string;
        is_private: boolean;
        topic: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT *
           FROM channels
          WHERE starship_id = $1
            AND lower(slug) = $2
          LIMIT 1`,
        [args.starshipId, DEFAULT_CHANNEL_SLUG]
      )
      .catch(() => null);

    if (!winner) throw e;

    try {
      await conn.query(`UPDATE starships SET default_channel_conversation_id = $1, updated_at = NOW() WHERE id = $2`, [
        winner.conversation_id,
        args.starshipId,
      ]);
    } catch {
      /* ignore (pre-migration compatibility) */
    }

    return {
      conversationId: String(winner.conversation_id),
      starshipId: String(winner.starship_id),
      slug: String(winner.slug),
      name: String(winner.name),
      isPrivate: Boolean(winner.is_private),
      channelType: 'chat',
      topic: winner.topic ?? null,
      createdAt: String(winner.created_at),
      updatedAt: String(winner.updated_at),
    };
  }
}
