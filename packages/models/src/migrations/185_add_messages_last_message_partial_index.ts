import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Supports the DISTINCT ON (conversation_id) ORDER BY conversation_id, created_at DESC
    // query used by findByStarshipWithAgents when includeLastMessage is true.
    // Partial filter eliminates deleted and non-agent-response rows at index time.
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_last_agent_response
      ON messages (conversation_id, created_at DESC)
      WHERE role = 'assistant'
        AND message_type = 'agent_response'
        AND content <> ''
        AND content <> '__deleted__'
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP INDEX IF EXISTS idx_messages_last_agent_response`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
