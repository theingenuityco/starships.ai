import type { Client } from 'pg';

/**
 * Migration 056: Add required `role` field to agents and agent_templates.
 *
 * - Backfills existing rows to 'Assistant'
 * - Enforces NOT NULL to align with API contract (role required on create)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Add columns with safe default for existing rows.
    await client.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS role VARCHAR(255) NOT NULL DEFAULT 'Assistant';
    `);

    await client.query(`
      ALTER TABLE agent_templates
      ADD COLUMN IF NOT EXISTS role VARCHAR(255) NOT NULL DEFAULT 'Assistant';
    `);

    // Ensure any legacy NULLs are backfilled (defensive).
    await client.query(`UPDATE agents SET role = 'Assistant' WHERE role IS NULL OR TRIM(role) = '';`);
    await client.query(`UPDATE agent_templates SET role = 'Assistant' WHERE role IS NULL OR TRIM(role) = '';`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`ALTER TABLE agents DROP COLUMN IF EXISTS role;`);
    await client.query(`ALTER TABLE agent_templates DROP COLUMN IF EXISTS role;`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
