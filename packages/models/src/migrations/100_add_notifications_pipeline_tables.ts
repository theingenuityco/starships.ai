import type { Client } from 'pg';

/**
 * Migration 100: Add notifications pipeline tables
 *
 * Adds:
 * - conversation_read_states (per user per conversation)
 * - message_mentions (mentions index, supports users + agents)
 * - notifications (durable inbox rows for DM + @mention)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // -----------------------------------------------------------------------
    // conversation_read_states
    // -----------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_read_states (
        conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_read_message_id VARCHAR(255) REFERENCES messages(id) ON DELETE SET NULL,
        last_read_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (conversation_id, user_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_read_states_user_id ON conversation_read_states(user_id);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_conversation_read_states_conversation_id ON conversation_read_states(conversation_id);`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_read_states_updated_at ON conversation_read_states(updated_at DESC);`);

    // -----------------------------------------------------------------------
    // message_mentions
    // -----------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_mentions (
        message_id VARCHAR(255) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('user', 'agent')),
        target_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (message_id, target_type, target_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_message_mentions_message_id ON message_mentions(message_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_message_mentions_conversation_id ON message_mentions(conversation_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_message_mentions_starship_id ON message_mentions(starship_id);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_message_mentions_target ON message_mentions(target_type, target_id, created_at DESC);`
    );

    // -----------------------------------------------------------------------
    // notifications
    // -----------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('dm', 'mention')),
        conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        message_id VARCHAR(255) REFERENCES messages(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        seen_at TIMESTAMP WITH TIME ZONE,
        read_at TIMESTAMP WITH TIME ZONE
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_notifications_starship_user ON notifications(starship_id, user_id, created_at DESC);`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_conversation ON notifications(conversation_id, created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;`);
    // De-dupe per user per message per type (DM vs mention).
    // Note: Postgres UNIQUE allows multiple NULLs; that's fine because our pipeline only de-dupes rows with message_id set.
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_type_message ON notifications(user_id, type, message_id);`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP TABLE IF EXISTS notifications;`);
    await client.query(`DROP TABLE IF EXISTS message_mentions;`);
    await client.query(`DROP TABLE IF EXISTS conversation_read_states;`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
