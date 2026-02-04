import { BaseRepository } from '@/repositories/BaseRepository';

export type ToggleReactionResult = 'added' | 'removed';

/**
 * Repository for message emoji reactions.
 *
 * Storage model:
 * - One row per (message_id, user_id, emoji)
 * - Uniqueness enforced by DB index
 */
export class MessageReactionRepository extends BaseRepository {
  constructor() {
    super('MessageReactionRepository');
  }

  async toggleReaction(args: { messageId: string; userId: string; emoji: string }): Promise<ToggleReactionResult> {
    return this.executeWithErrorHandling(
      async () => {
        const messageId = String(args.messageId || '').trim();
        const userId = String(args.userId || '').trim();
        const emoji = String(args.emoji || '').trim();
        if (!messageId) throw new Error('messageId is required');
        if (!userId) throw new Error('userId is required');
        if (!emoji) throw new Error('emoji is required');

        const connection = this.getConnection();

        // Try to add reaction first.
        const insertRes = await connection.queryWithResult(
          `
            INSERT INTO message_reactions (message_id, user_id, emoji)
            VALUES ($1, $2, $3)
            ON CONFLICT (message_id, user_id, emoji) DO NOTHING
          `,
          [messageId, userId, emoji]
        );
        const inserted = typeof (insertRes as any)?.rowCount === 'number' ? Number((insertRes as any).rowCount) : 0;
        if (inserted > 0) return 'added';

        // Already existed → remove it (toggle off).
        await connection.queryWithResult(`DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`, [
          messageId,
          userId,
          emoji,
        ]);
        return 'removed';
      },
      'toggleReaction',
      'message_reactions',
      `${args?.messageId ?? ''}:${args?.userId ?? ''}:${args?.emoji ?? ''}`
    );
  }

  async getAggregatedReactions(messageIdRaw: string): Promise<Record<string, string[]>> {
    return this.executeWithErrorHandling(
      async () => {
        const messageId = String(messageIdRaw || '').trim();
        if (!messageId) return {};

        const connection = this.getConnection();
        const row = await connection.queryOne<{ reactions: any }>(
          `
            SELECT COALESCE(
              (
                SELECT jsonb_object_agg(emoji, user_ids)
                FROM (
                  SELECT
                    emoji,
                    jsonb_agg(user_id ORDER BY created_at ASC) AS user_ids
                  FROM message_reactions
                  WHERE message_id = $1
                  GROUP BY emoji
                ) per_emoji
              ),
              '{}'::jsonb
            ) AS reactions
          `,
          [messageId]
        );

        const raw = row?.reactions;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

        const out: Record<string, string[]> = {};
        for (const [emoji, userIds] of Object.entries(raw as Record<string, unknown>)) {
          if (!emoji) continue;
          if (!Array.isArray(userIds)) continue;
          out[String(emoji)] = userIds.map((x) => String(x)).filter(Boolean);
        }
        return out;
      },
      'getAggregatedReactions',
      'message_reactions',
      messageIdRaw
    );
  }
}
