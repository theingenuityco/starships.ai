import type { Client } from 'pg';

/**
 * Migration 107: Remove navigation onboarding (feature removed)
 *
 * - Drops navigation_onboarding_completed from users table
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS navigation_onboarding_completed
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
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS navigation_onboarding_completed BOOLEAN NOT NULL DEFAULT false
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
