import type { Client } from 'pg';

/**
 * Migration 095: Add messages.linked_conversation_id
 *
 * Allows any message in any conversation (including channels) to link to another conversation,
 * enabling generic "thread preview" / "index post" UX.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS linked_conversation_id VARCHAR(255) NULL REFERENCES conversations(id) ON DELETE SET NULL;
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_linked_conversation_id ON messages(linked_conversation_id);`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('DROP INDEX IF EXISTS idx_messages_linked_conversation_id;');
    await client.query('ALTER TABLE messages DROP COLUMN IF EXISTS linked_conversation_id;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
