import type { Client } from 'pg';

/**
 * Migration 115: Add agent template marketplace marketing rendering flag
 *
 * Allows instance admins to disable rendering of generated marketing sections
 * on the public marketplace agent details page (ISR).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE agent_templates
      ADD COLUMN IF NOT EXISTS marketplace_marketing_rendering_disabled BOOLEAN NOT NULL DEFAULT false
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
      DROP COLUMN IF EXISTS marketplace_marketing_rendering_disabled
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

