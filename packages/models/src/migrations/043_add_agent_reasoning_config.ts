import type { Client } from 'pg';

/**
 * Migration 043: Agents - add structured reasoning config
 *
 * Adds `agents.reasoning` as JSONB to persist the optional LLM reasoning configuration
 * (mirrors @starships/autopilot AgentParams.reasoning).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE agents
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
      ALTER TABLE agents
      DROP COLUMN IF EXISTS reasoning
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
