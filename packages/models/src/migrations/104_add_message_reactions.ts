import type { Client } from 'pg';

/**
 * Migration 104: Add message_reactions table
 *
 * Stores per-message emoji reactions (per user) with uniqueness:
 *   (message_id, user_id, emoji)
 *
 * Reactions are aggregated into messages at query time for UI rendering.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id VARCHAR(255) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji VARCHAR(32) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CHECK (char_length(emoji) >= 1)
      );
    `);

    // Ensure uniqueness (toggle semantics)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_message_reactions_message_user_emoji
        ON message_reactions(message_id, user_id, emoji);
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON message_reactions(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_message_reactions_created_at ON message_reactions(created_at DESC);`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('DROP INDEX IF EXISTS idx_message_reactions_created_at;');
    await client.query('DROP INDEX IF EXISTS idx_message_reactions_user_id;');
    await client.query('DROP INDEX IF EXISTS idx_message_reactions_message_id;');
    await client.query('DROP INDEX IF EXISTS uq_message_reactions_message_user_emoji;');
    await client.query('DROP TABLE IF EXISTS message_reactions;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
