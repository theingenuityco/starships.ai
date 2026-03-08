import type { Client } from 'pg';
import { nanoid } from 'nanoid';

/**
 * Migration 178:
 *
 * Rooms are conversation-backed containers. In the rooms UI, "chat" is modeled as child conversations
 * (threads) under the room conversation via `conversations.parent_conversation_id`.
 *
 * During the channel -> room cutover, some installations ended up with message history written directly
 * onto the lobby room container conversation. That history is effectively hidden because the rooms UI
 * does not render room-container message timelines; it only lists child conversations.
 *
 * Fix: For each starship's `#lobby` room, move any messages (and related rows) that currently belong
 * to the lobby room container conversation into a dedicated child conversation titled "Main".
 *
 * Idempotent:
 * - If the lobby room has no container messages, this is a no-op.
 * - If the "Main" child conversation already exists, it is reused.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const getRows = <T>(result: unknown): T[] => {
      if (Array.isArray(result)) return result as T[];
      const anyRes = result as { rows?: unknown };
      return Array.isArray(anyRes?.rows) ? (anyRes.rows as T[]) : [];
    };

    const LOBBY_SLUG = 'lobby';
    const MAIN_TITLE = 'Main';

    // Fetch all lobby rooms (one per starship).
    const lobbyRoomsRes = await client.query<{ starship_id: string; room_conversation_id: string; room_name: string | null }>(`
      SELECT r.starship_id, r.conversation_id AS room_conversation_id, r.name AS room_name
        FROM rooms r
       WHERE lower(r.slug) = $1
    `, [LOBBY_SLUG]);
    const lobbyRooms = getRows<{ starship_id: string; room_conversation_id: string; room_name: string | null }>(lobbyRoomsRes);

    for (const r of lobbyRooms) {
      const starshipId = String(r.starship_id);
      const roomConversationId = String(r.room_conversation_id);

      // Only migrate if there are messages on the room container conversation.
      const msgMetaRes = await client.query<{ message_count: string; min_created_at: string | null; max_updated_at: string | null }>(`
        SELECT
          count(*)::text AS message_count,
          min(created_at)::text AS min_created_at,
          max(updated_at)::text AS max_updated_at
        FROM messages
        WHERE conversation_id = $1
      `, [roomConversationId]);
      const msgMeta = getRows<{ message_count: string; min_created_at: string | null; max_updated_at: string | null }>(msgMetaRes)?.[0];
      const messageCount = msgMeta ? Number(msgMeta.message_count) : 0;
      if (!messageCount || messageCount <= 0) continue;

      // Find (or create) the child conversation that will receive the migrated history.
      const existingChildRes = await client.query<{ id: string }>(`
        SELECT id
          FROM conversations
         WHERE parent_conversation_id = $1
           AND lower(title) = lower($2)
         LIMIT 1
      `, [roomConversationId, MAIN_TITLE]);
      const existingChild = getRows<{ id: string }>(existingChildRes);

      let targetConversationId: string;
      if (existingChild.length > 0) {
        targetConversationId = String(existingChild[0]!.id);
      } else {
        targetConversationId = nanoid();
        const createdAt = msgMeta?.min_created_at ? String(msgMeta.min_created_at) : null;
        const updatedAt = msgMeta?.max_updated_at ? String(msgMeta.max_updated_at) : null;
        await client.query(
          `
          INSERT INTO conversations (id, title, status, state, starship_id, parent_conversation_id, created_at, updated_at)
          VALUES ($1, $2, 'active', '{}'::jsonb, $3, $4, COALESCE($5::timestamptz, NOW()), COALESCE($6::timestamptz, NOW()))
          `,
          [targetConversationId, MAIN_TITLE, starshipId, roomConversationId, createdAt, updatedAt]
        );
      }

      // --------------------------
      // Move message-backed state.
      // --------------------------

      // Turns (must move before/with messages so turn lists align).
      await client.query(
        `UPDATE turns SET conversation_id = $1 WHERE conversation_id = $2`,
        [targetConversationId, roomConversationId]
      ).catch(() => undefined); // best-effort (turns table may not exist in some installs)

      // Messages.
      await client.query(
        `UPDATE messages SET conversation_id = $1, updated_at = NOW() WHERE conversation_id = $2`,
        [targetConversationId, roomConversationId]
      );

      // Usage rows (token accounting) - preserve billing linkage.
      await client.query(
        `UPDATE usage SET conversation_id = $1 WHERE conversation_id = $2`,
        [targetConversationId, roomConversationId]
      ).catch(() => undefined);

      // Mentions index.
      await client.query(
        `UPDATE message_mentions SET conversation_id = $1 WHERE conversation_id = $2`,
        [targetConversationId, roomConversationId]
      ).catch(() => undefined);

      // Notifications (DM/mention inbox rows).
      await client.query(
        `UPDATE notifications SET conversation_id = $1 WHERE conversation_id = $2`,
        [targetConversationId, roomConversationId]
      ).catch(() => undefined);

      // Tool-call approvals (unique per conversation/tool_call_id) - use insert+delete to avoid uniqueness conflicts.
      await client.query(
        `
        INSERT INTO tool_call_approvals (id, starship_id, conversation_id, agent_id, tool_slug, tool_call_id, args_json, status, created_at, decided_at)
        SELECT id, starship_id, $1, agent_id, tool_slug, tool_call_id, args_json, status, created_at, decided_at
          FROM tool_call_approvals
         WHERE conversation_id = $2
        ON CONFLICT (conversation_id, tool_call_id) DO NOTHING
        `,
        [targetConversationId, roomConversationId]
      ).catch(() => undefined);
      await client.query(`DELETE FROM tool_call_approvals WHERE conversation_id = $1`, [roomConversationId]).catch(() => undefined);

      // Conversation read states (PK per conversation/user) - merge into target then delete old.
      await client.query(
        `
        INSERT INTO conversation_read_states (conversation_id, user_id, last_read_message_id, last_read_at, updated_at)
        SELECT $1, user_id, last_read_message_id, last_read_at, updated_at
          FROM conversation_read_states
         WHERE conversation_id = $2
        ON CONFLICT (conversation_id, user_id) DO UPDATE
          SET last_read_message_id = EXCLUDED.last_read_message_id,
              last_read_at = EXCLUDED.last_read_at,
              updated_at = GREATEST(conversation_read_states.updated_at, EXCLUDED.updated_at)
        `,
        [targetConversationId, roomConversationId]
      ).catch(() => undefined);
      await client.query(`DELETE FROM conversation_read_states WHERE conversation_id = $1`, [roomConversationId]).catch(() => undefined);

      // Conversation notification prefs (PK per conversation/user) - merge into target then delete old.
      await client.query(
        `
        INSERT INTO conversation_notification_prefs (conversation_id, user_id, level, created_at, updated_at)
        SELECT $1, user_id, level, created_at, updated_at
          FROM conversation_notification_prefs
         WHERE conversation_id = $2
        ON CONFLICT (conversation_id, user_id) DO UPDATE
          SET level = EXCLUDED.level,
              updated_at = GREATEST(conversation_notification_prefs.updated_at, EXCLUDED.updated_at)
        `,
        [targetConversationId, roomConversationId]
      ).catch(() => undefined);
      await client.query(`DELETE FROM conversation_notification_prefs WHERE conversation_id = $1`, [roomConversationId]).catch(() => undefined);

      // Keep titles and timestamps coherent (best-effort).
      await client.query(
        `
        UPDATE conversations
           SET updated_at = GREATEST(updated_at, NOW())
         WHERE id = $1
        `,
        [targetConversationId]
      ).catch(() => undefined);
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  // Non-reversible by design:
  // - We cannot reliably detect whether moved rows originated from the lobby room container vs. normal child conversations.
  await client.query('BEGIN');
  try {
    // no-op
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

