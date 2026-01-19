import type { Client } from 'pg';

/**
 * Migration 071: Add onboarding completion flag to users
 *
 * Goal:
 * - Introduce a required boolean `users.onboarding_completed` (default false)
 * - Used to gate the mandatory onboarding flow after authentication
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false
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
      DROP COLUMN IF EXISTS onboarding_completed
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

