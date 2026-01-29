import type { Client } from 'pg';

/**
 * Migration 091: Add composite index for paginated conversation history
 *
 * Supports efficient keyset pagination by (conversation_id, created_at, id).
 */
export async function up(client: Client): Promise<void> {
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_id
      ON messages(conversation_id, created_at, id);
  `);
}

export async function down(client: Client): Promise<void> {
  await client.query(`DROP INDEX IF EXISTS idx_messages_conversation_created_id;`);
}

