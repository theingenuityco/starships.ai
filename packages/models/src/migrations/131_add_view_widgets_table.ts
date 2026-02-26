import type { Client } from 'pg';

/**
 * Migration 131: Add view_widgets table
 *
 * Flavor A storage:
 * - views.root becomes structure-only (id + children)
 * - view_widgets stores per-node widget data (type/props/bindings/handlers/permissions)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS view_widgets (
        view_id VARCHAR(255) NOT NULL REFERENCES views(id) ON DELETE CASCADE,
        node_id VARCHAR(255) NOT NULL,
        type VARCHAR(200) NOT NULL,
        props JSONB NOT NULL DEFAULT '{}'::jsonb,
        bindings JSONB,
        handlers JSONB,
        permissions JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (view_id, node_id)
      );

      CREATE INDEX IF NOT EXISTS idx_view_widgets_view_id ON view_widgets(view_id);
      CREATE INDEX IF NOT EXISTS idx_view_widgets_type ON view_widgets(type);
      CREATE INDEX IF NOT EXISTS idx_view_widgets_props ON view_widgets USING GIN(props);
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
    await client.query('DROP TABLE IF EXISTS view_widgets CASCADE;');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

