import type { Client } from 'pg';

/**
 * Migration 096:
 * Introduce channel types (`chat` | `forum`) and convert `#old-conversations` into a forum-style index.
 *
 * - Add `channels.channel_type` with default `chat`
 * - Backfill `#old-conversations` channels to `forum`
 * - Empty ALL messages + turns in `#old-conversations` (forum channels do not use a chat timeline)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // 1) Add channel_type (idempotent).
    await client.query(`
      ALTER TABLE channels
        ADD COLUMN IF NOT EXISTS channel_type VARCHAR(20) NOT NULL DEFAULT 'chat';
    `);

    // 2) Add constraint (idempotent).
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'ck_channels_channel_type'
        ) THEN
          ALTER TABLE channels
            ADD CONSTRAINT ck_channels_channel_type CHECK (channel_type IN ('chat', 'forum'));
        END IF;
      END $$;
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_channels_channel_type ON channels(channel_type);`);

    // 3) Backfill old-conversations to forum.
    await client.query(`
      UPDATE channels
         SET channel_type = 'forum',
             updated_at = NOW()
       WHERE lower(slug) = 'old-conversations'
    `);

    // 4) Empty timeline data for old-conversations (forum channels use cards/threads, not chat).
    await client.query(`
      DELETE FROM messages
       WHERE conversation_id IN (
        SELECT conversation_id
          FROM channels
         WHERE lower(slug) = 'old-conversations'
       );
    `);
    await client.query(`
      DELETE FROM turns
       WHERE conversation_id IN (
        SELECT conversation_id
          FROM channels
         WHERE lower(slug) = 'old-conversations'
       );
    `);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('DROP INDEX IF EXISTS idx_channels_channel_type;');
    await client.query('ALTER TABLE channels DROP CONSTRAINT IF EXISTS ck_channels_channel_type;');
    await client.query('ALTER TABLE channels DROP COLUMN IF EXISTS channel_type;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
