import type { Client } from 'pg';

/**
 * Migration 012: Add instance admin flag to users
 *
 * Goal:
 * - Introduce a simple, global/instance-level admin flag on users
 * - Flag is stored as users.is_instance_admin (boolean, default false)
 *
 * Notes:
 * - Backwards compatible: existing users default to non-admin
 * - Application code reads this as `isInstanceAdmin` via camelCase mapping
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_instance_admin BOOLEAN NOT NULL DEFAULT false
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
      DROP COLUMN IF EXISTS is_instance_admin
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}



