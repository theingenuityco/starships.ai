import type { Client } from 'pg';

/**
 * Migration 042: Tools - split template linkage into source vs published
 *
 * Goal:
 * - Mirror the agent pattern:
 *   - source_template_id: where a tool instance was created from (deployed from marketplace)
 *   - published_template_id: where a tool instance is promoted into on publish
 *
 * Notes:
 * - Backwards compatible at the DB layer: we rename tools.template_id -> source_template_id
 * - Application code should treat the old "templateId" concept as sourceTemplateId going forward.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // 1) Rename tools.template_id -> source_template_id if needed
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'tools' AND column_name = 'template_id'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'tools' AND column_name = 'source_template_id'
        ) THEN
          ALTER TABLE tools RENAME COLUMN template_id TO source_template_id;
        END IF;
      END
      $$;
    `);

    // 2) Rename index if it exists (optional)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_class
          WHERE relname = 'idx_tools_template_id'
        ) THEN
          ALTER INDEX idx_tools_template_id RENAME TO idx_tools_source_template_id;
        END IF;
      END
      $$;
    `);

    // 3) Add published_template_id (Tool → ToolTemplate) for publish workflow
    await client.query(`
      ALTER TABLE tools
      ADD COLUMN IF NOT EXISTS published_template_id VARCHAR(255) REFERENCES tool_templates(id) ON DELETE SET NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tools_source_template_id
      ON tools(source_template_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tools_published_template_id
      ON tools(published_template_id);
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
    // Drop published_template_id + index
    await client.query('DROP INDEX IF EXISTS idx_tools_published_template_id;');
    await client.query('ALTER TABLE tools DROP COLUMN IF EXISTS published_template_id;');

    // Rename source_template_id back to template_id if needed
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'tools' AND column_name = 'source_template_id'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'tools' AND column_name = 'template_id'
        ) THEN
          ALTER TABLE tools RENAME COLUMN source_template_id TO template_id;
        END IF;
      END
      $$;
    `);

    // Rename index back if it exists
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_class
          WHERE relname = 'idx_tools_source_template_id'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_class
          WHERE relname = 'idx_tools_template_id'
        ) THEN
          ALTER INDEX idx_tools_source_template_id RENAME TO idx_tools_template_id;
        END IF;
      END
      $$;
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

