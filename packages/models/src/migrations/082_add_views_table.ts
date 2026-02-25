import type { Client } from 'pg';

/**
 * Migration: Add views table
 *
 * A "view" is a persisted, starship-scoped grid layout of widgets.
 * We store a JSONB layout payload containing:
 * - cols: fixed number of columns
 * - items: placed widget references (widgetId + row/col + spans)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS views (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        description VARCHAR(1000) NOT NULL DEFAULT '',
        layout JSONB NOT NULL DEFAULT '{"cols":3,"items":[]}'::jsonb,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_views_starship_id ON views(starship_id);
      CREATE INDEX IF NOT EXISTS idx_views_slug ON views(slug);
      CREATE INDEX IF NOT EXISTS idx_views_starship_slug ON views(starship_id, slug);
      CREATE INDEX IF NOT EXISTS idx_views_layout ON views USING GIN(layout);
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('DROP TABLE IF EXISTS views CASCADE');
}

