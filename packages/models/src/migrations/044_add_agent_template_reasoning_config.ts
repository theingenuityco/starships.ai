import type { Client } from 'pg';

/**
 * Migration 044: Agent templates - add structured reasoning config
 *
 * Adds `agent_templates.reasoning` as JSONB to persist the optional LLM reasoning configuration
 * (mirrors @starships/autopilot AgentParams.reasoning).
 *
 * Note: Public marketplace/template endpoints intentionally strip this field from responses.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE agent_templates
      ADD COLUMN IF NOT EXISTS reasoning JSONB
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
      ALTER TABLE agent_templates
      DROP COLUMN IF EXISTS reasoning
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
