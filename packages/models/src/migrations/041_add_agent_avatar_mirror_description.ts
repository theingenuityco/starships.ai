import type { Client } from 'pg';

/**
 * Migration 041: Add agent avatar prompt
 *
 * Stores an agent-authored avatar prompt used to guide avatar generation.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS avatar_prompt TEXT
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
      DROP COLUMN IF EXISTS avatar_prompt
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
