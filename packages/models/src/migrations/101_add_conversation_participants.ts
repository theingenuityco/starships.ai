import type { Client } from 'pg';

/**
 * Migration 101: Add conversation_participants table
 *
 * Unifies human + agent participation in conversations.
 *
 * Backfill sources:
 * - conversation_members (humans)
 * - conversation_agents (agents)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_id VARCHAR(255) NULL REFERENCES agents(id) ON DELETE CASCADE,
        role VARCHAR(20) NULL CHECK (role IN ('member', 'admin')),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        CHECK (
          (user_id IS NOT NULL AND agent_id IS NULL)
          OR
          (user_id IS NULL AND agent_id IS NOT NULL)
        )
      );
    `);

    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_participants_agent_id ON conversation_participants(agent_id);`);

    // Ensure uniqueness per conversation for each kind of participant.
    //
    // IMPORTANT:
    // Do NOT use partial unique indexes here. `ON CONFLICT (conversation_id, user_id)` cannot infer
    // a partial index unless the ON CONFLICT includes a matching WHERE clause.
    // We rely on NULL semantics (NULLs do not conflict) + the table CHECK constraint instead.
    await client.query(`DROP INDEX IF EXISTS uq_conversation_participants_conversation_user;`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_participants_conversation_user
         ON conversation_participants(conversation_id, user_id);`
    );
    await client.query(`DROP INDEX IF EXISTS uq_conversation_participants_conversation_agent;`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_participants_conversation_agent
         ON conversation_participants(conversation_id, agent_id);`
    );

    // Backfill humans from conversation_members.
    await client.query(`
      INSERT INTO conversation_participants (conversation_id, user_id, role, created_at, created_by)
      SELECT conversation_id, user_id, role, created_at, created_by
        FROM conversation_members
       WHERE user_id IS NOT NULL
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    `);

    // Backfill agents from conversation_agents.
    await client.query(`
      INSERT INTO conversation_participants (conversation_id, agent_id, created_at)
      SELECT conversation_id, agent_id, linked_at
        FROM conversation_agents
       WHERE agent_id IS NOT NULL
      ON CONFLICT (conversation_id, agent_id) DO NOTHING;
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
    await client.query(`DROP TABLE IF EXISTS conversation_participants;`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
