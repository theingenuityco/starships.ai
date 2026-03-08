import type { Client } from 'pg';
import { nanoid } from 'nanoid';

/**
 * Migration 179:
 *
 * Repair invalid conversation IDs for the special lobby child conversation titled "Main".
 *
 * The API validates ids with:
 *   /^[a-z0-9_-]{10,30}$/i
 *
 * Some installations may have created "Main" conversations with UUID ids (36 chars),
 * which breaks routes like `/rooms/:roomSlug/conversation/:conversationId`.
 *
 * This migration:
 * - Finds any `Main` child conversation under a `#lobby` room whose id does not match the IdSchema regex
 * - Rewrites references to a new (or existing) valid-id `Main` conversation under the same room
 * - Deletes the invalid-id conversation
 *
 * Idempotent and safe to re-run.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const getRows = <T>(result: unknown): T[] => {
      if (Array.isArray(result)) return result as T[];
      const anyRes = result as { rows?: unknown };
      return Array.isArray(anyRes?.rows) ? (anyRes.rows as T[]) : [];
    };

    const tableExists = async (name: string): Promise<boolean> => {
      const res = await client.query(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists`, [name]);
      const rows = getRows<{ exists: boolean }>(res);
      return Boolean(rows?.[0]?.exists);
    };

    const columnExists = async (args: { tableName: string; columnName: string }): Promise<boolean> => {
      const res = await client.query(
        `
        SELECT EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_name = $1
             AND column_name = $2
        ) AS exists
        `,
        [args.tableName, args.columnName]
      );
      const rows = getRows<{ exists: boolean }>(res);
      return Boolean(rows?.[0]?.exists);
    };

    const idRegex = /^[a-z0-9_-]{10,30}$/i;
    const MAIN_TITLE = 'Main';

    // Find invalid-id Main conversations under lobby rooms.
    const candidatesRes = await client.query<{
      id: string;
      title: string;
      status: string;
      state: unknown;
      starship_id: string;
      parent_conversation_id: string;
      created_at: string;
      updated_at: string;
    }>(`
      SELECT c.*
        FROM conversations c
        JOIN rooms r ON r.conversation_id = c.parent_conversation_id
       WHERE lower(r.slug) = 'lobby'
         AND lower(c.title) = lower($1)
    `, [MAIN_TITLE]);
    const candidates = getRows<any>(candidatesRes);

    const hasTurns = await tableExists('turns');
    const hasUsage = await tableExists('usage');
    const hasMentions = await tableExists('message_mentions');
    const hasNotifications = await tableExists('notifications');
    const hasToolCallApprovals = await tableExists('tool_call_approvals');
    const hasReadStates = await tableExists('conversation_read_states');
    const hasNotificationPrefs = await tableExists('conversation_notification_prefs');
    const hasParticipants = await tableExists('conversation_participants');
    const hasRoomInviteApprovals = await tableExists('room_invite_approvals');
    const hasSchedules = await tableExists('schedules');
    const hasLinkedConversationId = await columnExists({ tableName: 'messages', columnName: 'linked_conversation_id' });

    for (const c of candidates) {
      const oldId = String(c.id);
      if (idRegex.test(oldId)) continue; // already valid

      const parentId = String(c.parent_conversation_id);
      const starshipId = String(c.starship_id);

      // Prefer an existing valid-id "Main" child under the same lobby room.
      const existingValidRes = await client.query<{ id: string }>(
        `
        SELECT id
          FROM conversations
         WHERE parent_conversation_id = $1
           AND lower(title) = lower($2)
         LIMIT 50
        `,
        [parentId, MAIN_TITLE]
      );
      const existingValid = getRows<{ id: string }>(existingValidRes).find((r) => idRegex.test(String(r.id)));

      let destId = existingValid ? String(existingValid.id) : '';
      if (!destId) {
        destId = nanoid();
        await client.query(
          `
          INSERT INTO conversations (id, title, status, state, starship_id, parent_conversation_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::timestamptz, $8::timestamptz)
          `,
          [
            destId,
            MAIN_TITLE,
            String(c.status || 'active'),
            JSON.stringify(c.state ?? {}),
            starshipId,
            parentId,
            String(c.created_at),
            String(c.updated_at),
          ]
        );
      }

      // Re-parent any threads under the old "Main".
      await client.query(`UPDATE conversations SET parent_conversation_id = $1 WHERE parent_conversation_id = $2`, [destId, oldId]);

      if (hasTurns) await client.query(`UPDATE turns SET conversation_id = $1 WHERE conversation_id = $2`, [destId, oldId]);
      await client.query(`UPDATE messages SET conversation_id = $1 WHERE conversation_id = $2`, [destId, oldId]);
      if (hasLinkedConversationId) await client.query(`UPDATE messages SET linked_conversation_id = $1 WHERE linked_conversation_id = $2`, [destId, oldId]);
      if (hasUsage) await client.query(`UPDATE usage SET conversation_id = $1 WHERE conversation_id = $2`, [destId, oldId]);
      if (hasMentions) await client.query(`UPDATE message_mentions SET conversation_id = $1 WHERE conversation_id = $2`, [destId, oldId]);
      if (hasNotifications) await client.query(`UPDATE notifications SET conversation_id = $1 WHERE conversation_id = $2`, [destId, oldId]);

      if (hasToolCallApprovals) {
        await client.query(
          `
          INSERT INTO tool_call_approvals (id, starship_id, conversation_id, agent_id, tool_slug, tool_call_id, args_json, status, created_at, decided_at)
          SELECT id, starship_id, $1, agent_id, tool_slug, tool_call_id, args_json, status, created_at, decided_at
            FROM tool_call_approvals
           WHERE conversation_id = $2
          ON CONFLICT (conversation_id, tool_call_id) DO NOTHING
          `,
          [destId, oldId]
        );
        await client.query(`DELETE FROM tool_call_approvals WHERE conversation_id = $1`, [oldId]);
      }

      if (hasReadStates) {
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
          [destId, oldId]
        );
        await client.query(`DELETE FROM conversation_read_states WHERE conversation_id = $1`, [oldId]);
      }

      if (hasNotificationPrefs) {
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
          [destId, oldId]
        );
        await client.query(`DELETE FROM conversation_notification_prefs WHERE conversation_id = $1`, [oldId]);
      }

      if (hasParticipants) await client.query(`UPDATE conversation_participants SET conversation_id = $1 WHERE conversation_id = $2`, [destId, oldId]);
      if (hasRoomInviteApprovals) await client.query(`UPDATE room_invite_approvals SET conversation_id = $1 WHERE conversation_id = $2`, [destId, oldId]);
      if (hasSchedules) await client.query(`UPDATE schedules SET last_run_conversation_id = $1 WHERE last_run_conversation_id = $2`, [destId, oldId]);

      // Delete old conversation last (it has ON DELETE CASCADE from many tables).
      await client.query(`DELETE FROM conversations WHERE id = $1`, [oldId]);
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  // Non-reversible by design.
  await client.query('BEGIN');
  try {
    // no-op
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

