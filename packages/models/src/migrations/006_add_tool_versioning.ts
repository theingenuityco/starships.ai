import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Adding versioning fields to tool templates and tools...');

    // 1. Add version to tool_templates
    await client.query(`
      ALTER TABLE tool_templates
      ADD COLUMN IF NOT EXISTS version VARCHAR(20) NOT NULL DEFAULT '1.0.0'
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tool_templates_version
      ON tool_templates(version)
    `);

    // 2. Add version and snapshot timestamp to tools
    await client.query(`
      ALTER TABLE tools
      ADD COLUMN IF NOT EXISTS version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
      ADD COLUMN IF NOT EXISTS template_snapshot_at TIMESTAMP WITH TIME ZONE
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tools_version ON tools(version)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tools_template_snapshot_at
      ON tools(template_snapshot_at)
    `);

    // 3. Set template_snapshot_at for existing template-based tools
    // Note: The version column already has default '1.0.0' applied automatically by ALTER TABLE
    // Only need to set template_snapshot_at which has no default
    await client.query(`
      UPDATE tools
      SET template_snapshot_at = created_at
      WHERE template_id IS NOT NULL
        AND template_snapshot_at IS NULL
    `);

    // 4. Verify data integrity for template-based tools
    // Version can't be NULL (has NOT NULL constraint), but template_snapshot_at can be NULL
    const nullCheck = await client.query(`
      SELECT COUNT(*) as count
      FROM tools
      WHERE template_id IS NOT NULL
        AND template_snapshot_at IS NULL
    `);

    const count = nullCheck?.rows?.[0]?.count || '0';
    if (parseInt(count) > 0) {
      throw new Error(`Found ${count} template-based tools with NULL template_snapshot_at after migration`);
    }

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully: Added tool versioning fields');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Rolling back tool versioning fields...');

    await client.query('DROP INDEX IF EXISTS idx_tools_template_snapshot_at');
    await client.query('DROP INDEX IF EXISTS idx_tools_version');
    await client.query('DROP INDEX IF EXISTS idx_tool_templates_version');

    await client.query('ALTER TABLE tools DROP COLUMN IF EXISTS template_snapshot_at');
    await client.query('ALTER TABLE tools DROP COLUMN IF EXISTS version');
    await client.query('ALTER TABLE tool_templates DROP COLUMN IF EXISTS version');

    await client.query('COMMIT');
    console.log('✅ Rollback completed');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
