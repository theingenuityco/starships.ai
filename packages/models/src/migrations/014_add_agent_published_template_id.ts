import type { Client } from 'pg';

/**
 * Migration 014: Add published_template_id to agents
 *
 * Goal:
 * - Track which agent_template row an agent is published into.
 *
 * Notes:
 * - This is separate from template_id (source template the agent was created from).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS published_template_id VARCHAR(255) REFERENCES agent_templates(id) ON DELETE SET NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_published_template_id
      ON agents(published_template_id);
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
    await client.query(`
      DROP INDEX IF EXISTS idx_agents_published_template_id;
    `);

    await client.query(`
      ALTER TABLE agents
      DROP COLUMN IF EXISTS published_template_id
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}


