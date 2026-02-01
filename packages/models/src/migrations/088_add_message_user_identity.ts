import type { Client } from 'pg';

/**
 * Migration 088: Add message author identity for multi-human chats
 *
 * Adds optional user attribution fields to `messages` so user messages can be
 * correctly attributed in shared contexts (channels, collaborators, etc).
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) NULL REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS user_name VARCHAR(255) NULL;

    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS user_avatar VARCHAR(500) NULL;

    CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
  `;
  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    DROP INDEX IF EXISTS idx_messages_user_id;
    ALTER TABLE messages DROP COLUMN IF EXISTS user_avatar;
    ALTER TABLE messages DROP COLUMN IF EXISTS user_name;
    ALTER TABLE messages DROP COLUMN IF EXISTS user_id;
  `;
  await client.query(sql);
}
