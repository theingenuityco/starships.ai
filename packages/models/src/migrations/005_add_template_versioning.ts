import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Adding versioning fields to agent templates and agents...');

    // 1. Add version to agent_templates
    await client.query(`
      ALTER TABLE agent_templates
      ADD COLUMN IF NOT EXISTS version VARCHAR(20) NOT NULL DEFAULT '1.0.0'
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_templates_version
      ON agent_templates(version)
    `);

    // 2. Add version and snapshot timestamp to agents
    await client.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
      ADD COLUMN IF NOT EXISTS template_snapshot_at TIMESTAMP WITH TIME ZONE
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_version ON agents(version)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_template_snapshot_at
      ON agents(template_snapshot_at)
    `);

    // 3. Backfill versions for existing templates
    await client.query(`
      UPDATE agent_templates
      SET version = '1.0.0'
      WHERE version IS NULL OR version = ''
    `);

    // 4. Backfill versions for existing agents (only template-based agents)
    await client.query(`
      UPDATE agents
      SET version = '1.0.0',
          template_snapshot_at = created_at
      WHERE template_id IS NOT NULL
        AND (version IS NULL OR version = '')
    `);

    // 5. Verify no NULL values for template-based agents
    const nullCheck = await client.query(`
      SELECT COUNT(*) as count
      FROM agents
      WHERE template_id IS NOT NULL
        AND (version IS NULL OR template_snapshot_at IS NULL)
    `);

    const count = nullCheck?.rows?.[0]?.count || '0';
    if (parseInt(count) > 0) {
      throw new Error('Found template-based agents with NULL version after backfill');
    }

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully: Added versioning fields');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Rolling back versioning fields...');

    await client.query('DROP INDEX IF EXISTS idx_agents_template_snapshot_at');
    await client.query('DROP INDEX IF EXISTS idx_agents_version');
    await client.query('DROP INDEX IF EXISTS idx_agent_templates_version');

    await client.query('ALTER TABLE agents DROP COLUMN IF EXISTS template_snapshot_at');
    await client.query('ALTER TABLE agents DROP COLUMN IF EXISTS version');
    await client.query('ALTER TABLE agent_templates DROP COLUMN IF EXISTS version');

    await client.query('COMMIT');
    console.log('✅ Rollback completed');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
