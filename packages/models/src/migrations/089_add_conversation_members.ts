import type { Client } from 'pg';

/**
 * Migration 089: Add conversation_members table
 *
 * Used to enforce private channel membership (and future per-conversation ACLs).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        PRIMARY KEY (conversation_id, user_id)
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_members_conversation_id ON conversation_members(conversation_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_members_user_id ON conversation_members(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_members_role ON conversation_members(role);`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP TABLE IF EXISTS conversation_members;`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
