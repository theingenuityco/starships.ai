import type { Client } from 'pg';
import { nanoid } from 'nanoid';

/**
 * Migration 094:
 * Create a per-starship "#old-conversations" channel for starships that have legacy conversations,
 * and re-parent legacy conversations under it.
 *
 * This provides a single, explicit place to find pre-channels history without relying on DMs or the default channel (#lobby).
 *
 * Notes:
 * - We do NOT touch existing channels (including the default channel, e.g. #lobby).
 * - We primarily target conversations that are not channels.
 * - We also migrate conversations that were previously nested under the default channel by earlier migrations
 *   (parent_conversation_id = starships.default_channel_conversation_id).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const getRows = <T>(result: unknown): T[] => {
      if (Array.isArray(result)) return result as T[];
      const anyRes = result as { rows?: unknown };
      return Array.isArray(anyRes?.rows) ? (anyRes.rows as T[]) : [];
    };

    const slug = 'old-conversations';
    const name = 'Old conversations';

    // Find starships that have any non-channel conversations (legacy), excluding the default channel itself.
    const starshipsRes = await client.query<{ starship_id: string; default_channel_conversation_id: string | null }>(`
      SELECT
        s.id as starship_id,
        s.default_channel_conversation_id
      FROM starships s
      WHERE EXISTS (
        SELECT 1
          FROM conversations conv
          LEFT JOIN channels ch ON ch.conversation_id = conv.id
          LEFT JOIN direct_messages dm ON dm.conversation_id = conv.id
         WHERE conv.starship_id = s.id
           AND ch.conversation_id IS NULL
           AND dm.conversation_id IS NULL
           AND (s.default_channel_conversation_id IS NULL OR conv.id <> s.default_channel_conversation_id)
         LIMIT 1
      )
    `);
    const starships = getRows<{ starship_id: string; default_channel_conversation_id: string | null }>(starshipsRes);

    for (const row of starships) {
      const starshipId = String(row.starship_id);
      const defaultChannelId = row.default_channel_conversation_id ? String(row.default_channel_conversation_id) : null;

      // If the channel already exists, reuse it.
      const existingRes = await client.query<{ conversation_id: string }>(
        `SELECT conversation_id
           FROM channels
          WHERE starship_id = $1
            AND lower(slug) = $2
          LIMIT 1`,
        [starshipId, slug]
      );
      const existing = getRows<{ conversation_id: string }>(existingRes);

      let legacyChannelConversationId: string;
      if (existing.length > 0) {
        legacyChannelConversationId = String(existing[0]!.conversation_id);
      } else {
        legacyChannelConversationId = nanoid();
        await client.query(
          `INSERT INTO conversations (id, title, status, state, starship_id, created_at, updated_at)
           VALUES ($1, $2, 'active', '{}'::jsonb, $3, NOW(), NOW())`,
          [legacyChannelConversationId, name, starshipId]
        );
        await client.query(
          `INSERT INTO channels (conversation_id, starship_id, slug, name, is_private, topic, created_at, updated_at)
           VALUES ($1, $2, $3, $4, false, NULL, NOW(), NOW())`,
          [legacyChannelConversationId, starshipId, slug, name]
        );
      }

      // Re-parent legacy conversations under the new channel.
      // - Move any root legacy conversations (parent NULL)
      // - Also move any conversations currently nested directly under the default channel (defaultChannelId),
      //   because they are considered "legacy history" by this strategy.
      await client.query(
        `
        UPDATE conversations conv
           SET parent_conversation_id = $1,
               updated_at = NOW()
          FROM (
            SELECT c.id
              FROM conversations c
              LEFT JOIN channels ch ON ch.conversation_id = c.id
              LEFT JOIN direct_messages dm ON dm.conversation_id = c.id
             WHERE c.starship_id = $2
               AND ch.conversation_id IS NULL
               AND dm.conversation_id IS NULL
               AND c.id <> $1
               AND (
                 c.parent_conversation_id IS NULL
                 OR ($3::text IS NOT NULL AND c.parent_conversation_id = $3)
               )
               AND ($3::text IS NULL OR c.id <> $3)
          ) as target
         WHERE conv.id = target.id
        `,
        [legacyChannelConversationId, starshipId, defaultChannelId]
      );

      // If any DM rows exist for conversations we just migrated under the legacy channel,
      // remove them so they do not appear in the DM surface.
      await client.query(
        `
        DELETE FROM direct_messages dm
         USING conversations conv
         WHERE dm.conversation_id = conv.id
           AND conv.starship_id = $1
           AND conv.parent_conversation_id = $2
        `,
        [starshipId, legacyChannelConversationId]
      );
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Best-effort rollback: un-parent conversations that were moved under #old-conversations,
    // but do not delete the channel or conversations (non-destructive).
    await client.query(
      `
      UPDATE conversations conv
         SET parent_conversation_id = NULL,
             updated_at = NOW()
        FROM channels ch
       WHERE ch.conversation_id = conv.parent_conversation_id
         AND lower(ch.slug) = 'old-conversations'
      `
    );
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
