import type { Client } from 'pg';

/**
 * Migration: Add owner_user_id to schedules
 *
 * Tracks which user owns/created a given schedule so that
 * scheduled runs can be executed under that user's JWT context.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE schedules
        ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE;
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
      ALTER TABLE schedules
        DROP COLUMN IF EXISTS owner_user_id;
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
