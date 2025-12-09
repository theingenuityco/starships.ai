import type { Client } from 'pg';

/**
 * Migration: Add is_recurring flag to schedules
 *
 * Distinguishes one-shot schedules from recurring schedules.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE schedules
      ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;
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
      DROP COLUMN IF EXISTS is_recurring;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
