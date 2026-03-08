import type { Client } from 'pg';
import { nanoid } from 'nanoid';

/**
 * Migration 177:
 * - Introduce a default room `lobby` for every starship (new and existing).
 * - Re-parent all channel-backed and direct-message-backed conversations under that lobby room
 *   (children modeled via `conversations.parent_conversation_id`).
 * - Drop the channels + direct_messages surfaces and related starship default-channel pointer.
 *
 * Product intent:
 * - Channels and DMs no longer exist as first-class surfaces.
 * - Their backing conversations continue to exist (with all messages preserved), but are now
 *   children of the lobby room.
 * - Channel-only fields (`is_private`, `topic`, etc.) are intentionally discarded by dropping the table.
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

    const LOBBY_ROOM_SLUG = 'lobby';
    const LOBBY_ROOM_NAME = 'Lobby';

    const hasChannels = await tableExists('channels');
    const hasDirectMessages = await tableExists('direct_messages');

    const starshipsRes = await client.query<{ id: string; owner_id: string }>(`SELECT id, owner_id FROM starships`);
    const starships = getRows<{ id: string; owner_id: string }>(starshipsRes);

    for (const s of starships) {
      const starshipId = String(s.id);
      const ownerId = String(s.owner_id);

      // -------------------------------------------------------------------
      // Ensure the lobby room exists for this starship.
      // -------------------------------------------------------------------
      const existingLobbyRes = await client.query<{ conversation_id: string }>(
        `SELECT conversation_id
           FROM rooms
          WHERE starship_id = $1
            AND lower(slug) = $2
          LIMIT 1`,
        [starshipId, LOBBY_ROOM_SLUG]
      );
      const existingLobby = getRows<{ conversation_id: string }>(existingLobbyRes);

      let lobbyRoomConversationId: string;
      if (existingLobby.length > 0) {
        lobbyRoomConversationId = String(existingLobby[0]!.conversation_id);
      } else {
        lobbyRoomConversationId = nanoid();
        await client.query(
          `INSERT INTO conversations (id, title, status, state, starship_id, created_at, updated_at)
           VALUES ($1, $2, 'active', '{}'::jsonb, $3, NOW(), NOW())`,
          [lobbyRoomConversationId, LOBBY_ROOM_NAME, starshipId]
        );
        await client.query(
          `INSERT INTO rooms (conversation_id, starship_id, slug, name, is_private, topic, created_at, updated_at)
           VALUES ($1, $2, $3, $4, false, NULL, NOW(), NOW())`,
          [lobbyRoomConversationId, starshipId, LOBBY_ROOM_SLUG, LOBBY_ROOM_NAME]
        );
      }

      // -------------------------------------------------------------------
      // Ensure starship collaborators can access the lobby room.
      //
      // Rooms enforce explicit participation for read/write, even when public.
      // We model Lobby as "always joined" for owner + members.
      // -------------------------------------------------------------------
      await client.query(
        `
        INSERT INTO conversation_participants (conversation_id, user_id, role, created_at, created_by)
        VALUES ($1, $2, 'admin', NOW(), $2)
        ON CONFLICT (conversation_id, user_id) DO NOTHING
        `,
        [lobbyRoomConversationId, ownerId]
      );

      // Starship members (non-owners) become participants (idempotent).
      await client.query(
        `
        INSERT INTO conversation_participants (conversation_id, user_id, role, created_at, created_by)
        SELECT $1, sm.user_id, 'member', NOW(), $2
          FROM starship_members sm
         WHERE sm.starship_id = $3
        ON CONFLICT (conversation_id, user_id) DO NOTHING
        `,
        [lobbyRoomConversationId, ownerId, starshipId]
      );

      if (hasChannels || hasDirectMessages) {
        // -------------------------------------------------------------------
        // Re-parent channels and DMs under lobby room.
        // -------------------------------------------------------------------
        if (hasChannels) {
          await client.query(
            `
            UPDATE conversations conv
               SET parent_conversation_id = $1,
                   updated_at = NOW()
              FROM channels ch
             WHERE ch.starship_id = $2
               AND conv.id = ch.conversation_id
               AND conv.id <> $1
               AND conv.parent_conversation_id IS NULL
            `,
            [lobbyRoomConversationId, starshipId]
          );
        }
        if (hasDirectMessages) {
          await client.query(
            `
            UPDATE conversations conv
               SET parent_conversation_id = $1,
                   updated_at = NOW()
              FROM direct_messages dm
             WHERE dm.starship_id = $2
               AND conv.id = dm.conversation_id
               AND conv.id <> $1
               AND conv.parent_conversation_id IS NULL
            `,
            [lobbyRoomConversationId, starshipId]
          );
        }
      }

      // Keep channel conversations public by dropping any explicit user participants that were used
      // for private channel membership.
      //
      // NOTE: We intentionally do NOT delete agent participants; those power agent linkage and
      // other features (e.g. allowed agent contexts).
      if (hasChannels) {
        await client.query(
          `
          DELETE FROM conversation_participants cp
          USING channels ch
          WHERE cp.conversation_id = ch.conversation_id
            AND ch.starship_id = $1
            AND cp.user_id IS NOT NULL
          `,
          [starshipId]
        );
      }

      // Sync backing conversation titles to channel names (best-effort). This keeps the migrated
      // child conversation list readable after dropping the channels surface.
      if (hasChannels) {
        await client.query(
          `
          UPDATE conversations conv
             SET title = ch.name,
                 updated_at = NOW()
            FROM channels ch
           WHERE ch.starship_id = $1
             AND conv.id = ch.conversation_id
             AND conv.title IS DISTINCT FROM ch.name
          `,
          [starshipId]
        );
      }
    }

    // -----------------------------------------------------------------------
    // Drop starship default channel pointer (no longer meaningful).
    // -----------------------------------------------------------------------
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'starships_default_channel_conversation_id_fkey'
        ) THEN
          ALTER TABLE starships DROP CONSTRAINT starships_default_channel_conversation_id_fkey;
        END IF;
      END $$;
    `);
    await client.query(`DROP INDEX IF EXISTS idx_starships_default_channel_conversation_id;`);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_name = 'starships'
             AND column_name = 'default_channel_conversation_id'
        ) THEN
          ALTER TABLE starships DROP COLUMN IF EXISTS default_channel_conversation_id;
        END IF;
      END $$;
    `);

    // -----------------------------------------------------------------------
    // Drop channel + DM surfaces.
    // -----------------------------------------------------------------------
    if (hasChannels) await client.query(`DROP TABLE IF EXISTS channels;`);
    if (hasDirectMessages) await client.query(`DROP TABLE IF EXISTS direct_messages;`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  // Non-reversible by design:
  // - We cannot reliably reconstruct channels/direct_messages tables with original semantics,
  //   including private channel membership and DM peer modeling.
  await client.query('BEGIN');
  try {
    // Best-effort rollback: un-parent any conversations that were moved directly under a lobby room.
    await client.query(
      `
      UPDATE conversations conv
         SET parent_conversation_id = NULL,
             updated_at = NOW()
        FROM rooms r
       WHERE conv.parent_conversation_id = r.conversation_id
         AND lower(r.slug) = 'lobby'
      `
    );
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

