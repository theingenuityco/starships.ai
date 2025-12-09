import type { Client } from 'pg';

/**
 * Migration: Add end conditions to schedules
 *
 * Adds:
 * - ends_at: optional timestamp boundary for future next_run_at values
 * - max_occurrences: optional cap on how many times a recurring schedule should run
 * - run_count: number of completed runs so far
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE schedules
      ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS max_occurrences INTEGER NULL CHECK (max_occurrences IS NULL OR max_occurrences > 0),
      ADD COLUMN IF NOT EXISTS run_count INTEGER NOT NULL DEFAULT 0;
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
      DROP COLUMN IF EXISTS ends_at,
      DROP COLUMN IF EXISTS max_occurrences,
      DROP COLUMN IF EXISTS run_count;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
