import type { Client } from 'pg';

/**
 * Migration 093: Add direct_messages table
 *
 * Conversation-backed DM records. This is a *surface* over conversations (like channels),
 * used to eliminate stray top-level conversations while preserving existing storage/streams.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS direct_messages (
        conversation_id VARCHAR(255) PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        dm_type VARCHAR(20) NOT NULL CHECK (dm_type IN ('user_agent', 'user_user')),

        -- user↔agent DMs
        user_id VARCHAR(255) NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_id VARCHAR(255) NULL REFERENCES agents(id) ON DELETE CASCADE,

        -- user↔user DMs (normalized pair: user_a_id < user_b_id)
        user_a_id VARCHAR(255) NULL REFERENCES users(id) ON DELETE CASCADE,
        user_b_id VARCHAR(255) NULL REFERENCES users(id) ON DELETE CASCADE,

        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

        CHECK (
          (dm_type = 'user_agent' AND user_id IS NOT NULL AND agent_id IS NOT NULL AND user_a_id IS NULL AND user_b_id IS NULL)
          OR
          (dm_type = 'user_user' AND user_id IS NULL AND agent_id IS NULL AND user_a_id IS NOT NULL AND user_b_id IS NOT NULL AND user_a_id < user_b_id)
        )
      );
    `);

    // Listing
    await client.query(`CREATE INDEX IF NOT EXISTS idx_direct_messages_starship_id ON direct_messages(starship_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_direct_messages_user_id ON direct_messages(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_direct_messages_agent_id ON direct_messages(agent_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_direct_messages_user_pair ON direct_messages(user_a_id, user_b_id);`);

    // Uniqueness per starship
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_direct_messages_starship_user_agent
         ON direct_messages(starship_id, user_id, agent_id)
       WHERE dm_type = 'user_agent';`
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_direct_messages_starship_user_pair
         ON direct_messages(starship_id, user_a_id, user_b_id)
       WHERE dm_type = 'user_user';`
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
    await client.query('DROP TABLE IF EXISTS direct_messages;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
