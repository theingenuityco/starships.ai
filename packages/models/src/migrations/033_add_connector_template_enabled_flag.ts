import type { Client } from 'pg';

/**
 * Add a simple enable/disable flag for connector templates.
 *
 * When disabled, connectors should not be offered to starships (except where an
 * existing connector instance already exists and needs to be managed).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE connector_templates
      ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);

    // Ensure existing rows are explicitly enabled (helps older DBs).
    await client.query(`
      UPDATE connector_templates
      SET is_enabled = TRUE
      WHERE is_enabled IS NULL
    `);

    await client.query('COMMIT');
    console.log('✅ Added connector_templates.is_enabled');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to add connector_templates.is_enabled:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE connector_templates
      DROP COLUMN IF EXISTS is_enabled
    `);

    await client.query('COMMIT');
    console.log('✅ Dropped connector_templates.is_enabled');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to drop connector_templates.is_enabled:', error);
    throw error;
  }
}
