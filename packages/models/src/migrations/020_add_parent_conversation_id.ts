import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS parent_conversation_id VARCHAR(255) REFERENCES conversations(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_conversations_parent_conversation_id
      ON conversations(parent_conversation_id);
  `);
}

export async function down(client: Client): Promise<void> {
  await client.query(`
    DROP INDEX IF EXISTS idx_conversations_parent_conversation_id;
    ALTER TABLE conversations
      DROP COLUMN IF EXISTS parent_conversation_id;
  `);
}
