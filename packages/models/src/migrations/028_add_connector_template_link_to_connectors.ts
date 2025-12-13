import type { Client } from 'pg';

/**
 * Extend connectors with a link to connector_templates (template_id + version),
 * mirroring the tool_templates -> tools and agent_templates -> agents pattern.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Adding template linkage columns to connectors...');

    await client.query(`
      ALTER TABLE connectors
      ADD COLUMN IF NOT EXISTS template_id TEXT REFERENCES connector_templates(id),
      ADD COLUMN IF NOT EXISTS version TEXT
    `);

    await client.query('COMMIT');
    console.log('✅ connectors table extended with template linkage columns');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to extend connectors table with template linkage columns:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Dropping template linkage columns from connectors...');

    await client.query(`
      ALTER TABLE connectors
      DROP COLUMN IF EXISTS template_id,
      DROP COLUMN IF EXISTS version
    `);

    await client.query('COMMIT');
    console.log('✅ Template linkage columns dropped from connectors');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}


