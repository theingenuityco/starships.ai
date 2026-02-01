import type { Client } from 'pg';
import { nanoid } from 'nanoid';

/**
 * Migration 092: Persist starship default channel + backfill existing starships
 *
 * - Adds `starships.default_channel_conversation_id`
 * - Backfills: ensures every starship has a public `#lobby` channel
 * - Adds FK to prevent deleting the default channel conversation
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const getRows = <T>(result: unknown): T[] => {
      if (Array.isArray(result)) return result as T[];
      const anyRes = result as { rows?: unknown };
      return Array.isArray(anyRes?.rows) ? (anyRes.rows as T[]) : [];
    };

    await client.query(`
      ALTER TABLE starships
        ADD COLUMN IF NOT EXISTS default_channel_conversation_id VARCHAR(255) NULL;
    `);

    // Add FK if not already present (no IF NOT EXISTS for constraints).
    // We use a DO block to keep this migration idempotent.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'starships_default_channel_conversation_id_fkey'
        ) THEN
          ALTER TABLE starships
            ADD CONSTRAINT starships_default_channel_conversation_id_fkey
            FOREIGN KEY (default_channel_conversation_id)
            REFERENCES conversations(id)
            ON DELETE RESTRICT;
        END IF;
      END
      $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_starships_default_channel_conversation_id
        ON starships(default_channel_conversation_id);
    `);

    // Backfill existing starships:
    // - If #lobby already exists, store it as default.
    // - Otherwise create a new conversation-backed channel and store it.
    const starshipsRes = await client.query<{ id: string }>(
      `SELECT id
         FROM starships
        WHERE default_channel_conversation_id IS NULL`
    );
    const starships = getRows<{ id: string }>(starshipsRes);

    for (const s of starships) {
      const starshipId = String(s.id);

      // Prefer an existing #lobby channel if present
      const existingRes = await client.query<{ conversation_id: string }>(
        `SELECT conversation_id
           FROM channels
          WHERE starship_id = $1
            AND lower(slug) = 'lobby'
          LIMIT 1`,
        [starshipId]
      );
      const existing = getRows<{ conversation_id: string }>(existingRes);

      let conversationId: string;
      if (existing.length > 0) {
        conversationId = String(existing[0]!.conversation_id);
      } else {
        conversationId = nanoid();
        await client.query(
          `INSERT INTO conversations (id, title, status, state, starship_id, created_at, updated_at)
           VALUES ($1, $2, 'active', '{}'::jsonb, $3, NOW(), NOW())`,
          [conversationId, 'Lobby', starshipId]
        );
        await client.query(
          `INSERT INTO channels (conversation_id, starship_id, slug, name, is_private, topic, created_at, updated_at)
           VALUES ($1, $2, 'lobby', 'Lobby', false, NULL, NOW(), NOW())`,
          [conversationId, starshipId]
        );
      }

      await client.query(
        `UPDATE starships
            SET default_channel_conversation_id = $1,
                updated_at = NOW()
          WHERE id = $2`,
        [conversationId, starshipId]
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
    // Drop FK first
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'starships_default_channel_conversation_id_fkey'
        ) THEN
          ALTER TABLE starships
            DROP CONSTRAINT starships_default_channel_conversation_id_fkey;
        END IF;
      END
      $$;
    `);

    await client.query('DROP INDEX IF EXISTS idx_starships_default_channel_conversation_id;');
    await client.query('ALTER TABLE starships DROP COLUMN IF EXISTS default_channel_conversation_id;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
