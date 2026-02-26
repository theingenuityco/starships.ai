import type { Client } from 'pg';

/**
 * Migration 129: Replace legacy views.layout with dynamic views.root
 *
 * Breaking change (no legacy retention):
 * - Deletes existing views
 * - Drops `layout` JSONB column + related index
 * - Adds:
 *   - root JSONB (widget tree)
 *   - runtime_config JSONB
 *   - version INT
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // No legacy retention: remove any existing view rows (layout cannot be rendered anymore).
    await client.query(`DELETE FROM views;`);

    // Drop legacy layout column + index.
    await client.query(`DROP INDEX IF EXISTS idx_views_layout;`);
    await client.query(`ALTER TABLE views DROP COLUMN IF EXISTS layout;`);

    // Add new dynamic view fields.
    await client.query(`
      ALTER TABLE views
        ADD COLUMN IF NOT EXISTS root JSONB NOT NULL DEFAULT '{"id":"root","type":"Box","props":{},"children":[]}'::jsonb,
        ADD COLUMN IF NOT EXISTS runtime_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
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
    // Best-effort down: reintroduce layout; root/runtime_config/version will be dropped.
    await client.query(`ALTER TABLE views ADD COLUMN IF NOT EXISTS layout JSONB NOT NULL DEFAULT '{"cols":3,"items":[]}'::jsonb;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_views_layout ON views USING GIN(layout);`);

    await client.query(`ALTER TABLE views DROP COLUMN IF EXISTS root;`);
    await client.query(`ALTER TABLE views DROP COLUMN IF EXISTS runtime_config;`);
    await client.query(`ALTER TABLE views DROP COLUMN IF EXISTS version;`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

