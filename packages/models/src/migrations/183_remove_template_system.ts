import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Drop indexes on FK columns before dropping the columns
    await client.query(`
      DROP INDEX IF EXISTS idx_agents_source_template_id;
      DROP INDEX IF EXISTS idx_agents_published_template_id;
      DROP INDEX IF EXISTS idx_agents_template_id;
      DROP INDEX IF EXISTS idx_agents_publication_status;
      DROP INDEX IF EXISTS idx_tools_source_template_id;
      DROP INDEX IF EXISTS idx_tools_published_template_id;
      DROP INDEX IF EXISTS idx_tools_template_id;
      DROP INDEX IF EXISTS idx_tools_publication_status;
    `);

    // Drop FK columns on agents that reference agent_templates
    await client.query(`
      ALTER TABLE agents
        DROP COLUMN IF EXISTS source_template_id,
        DROP COLUMN IF EXISTS published_template_id
    `);

    // Drop FK columns on tools that reference tool_templates
    await client.query(`
      ALTER TABLE tools
        DROP COLUMN IF EXISTS source_template_id,
        DROP COLUMN IF EXISTS published_template_id
    `);

    // Drop junction table (has FKs into both template tables)
    await client.query(`DROP TABLE IF EXISTS agent_template_tool_templates`);

    // Drop the template tables
    await client.query(`DROP TABLE IF EXISTS agent_templates`);
    await client.query(`DROP TABLE IF EXISTS tool_templates`);

    // Drop remaining publication workflow columns from agents
    await client.query(`
      ALTER TABLE agents
        DROP COLUMN IF EXISTS publication_status,
        DROP COLUMN IF EXISTS publication_requested_by,
        DROP COLUMN IF EXISTS publication_approved_by,
        DROP COLUMN IF EXISTS publication_approved_at,
        DROP COLUMN IF EXISTS publication_version_bump,
        DROP COLUMN IF EXISTS publication_requested_version,
        DROP COLUMN IF EXISTS publication_changelog
    `);

    // Drop remaining publication workflow columns from tools
    await client.query(`
      ALTER TABLE tools
        DROP COLUMN IF EXISTS publication_status,
        DROP COLUMN IF EXISTS publication_requested_by,
        DROP COLUMN IF EXISTS publication_approved_by,
        DROP COLUMN IF EXISTS publication_approved_at,
        DROP COLUMN IF EXISTS publication_version_bump,
        DROP COLUMN IF EXISTS publication_requested_version,
        DROP COLUMN IF EXISTS publication_changelog
    `);

    // Delete marketing_content rows belonging to templates (table is shared with connector_templates)
    await client.query(`
      DELETE FROM marketing_content
      WHERE entity_type IN ('agent_template', 'tool_template')
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(_client: Client): Promise<void> {
  // Intentionally not reversible — re-run earlier migrations to restore the template system
}
