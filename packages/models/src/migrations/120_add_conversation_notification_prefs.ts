import type { Client } from 'pg';

/**
 * Migration 120: Add conversation_notification_prefs
 *
 * Per-user per-conversation notification level preferences (channels today).
 *
 * Levels:
 * - all: notify on every new message in the conversation
 * - mentions: notify only on @mentions (default when no row exists)
 * - mute: never notify for this conversation
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_notification_prefs (
        conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        level VARCHAR(20) NOT NULL CHECK (level IN ('all', 'mentions', 'mute')),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (conversation_id, user_id)
      );
    `);

    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_conversation_notification_prefs_conversation_id
         ON conversation_notification_prefs(conversation_id);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_conversation_notification_prefs_user_id
         ON conversation_notification_prefs(user_id);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_conversation_notification_prefs_level
         ON conversation_notification_prefs(level);`
    );
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP TABLE IF EXISTS conversation_notification_prefs;`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

