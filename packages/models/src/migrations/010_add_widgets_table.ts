import type { Client } from 'pg';

/**
 * Migration: Add widgets table
 * Simplified design: widget_type column + props (no schema/data split)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS widgets (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        description VARCHAR(1000) NOT NULL DEFAULT '',
        widget_type VARCHAR(100) NOT NULL,
        props JSONB NOT NULL DEFAULT '{}'::jsonb,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_widgets_starship_id ON widgets(starship_id);
      CREATE INDEX IF NOT EXISTS idx_widgets_slug ON widgets(slug);
      CREATE INDEX IF NOT EXISTS idx_widgets_widget_type ON widgets(widget_type);
      CREATE INDEX IF NOT EXISTS idx_widgets_starship_slug ON widgets(starship_id, slug);
      CREATE INDEX IF NOT EXISTS idx_widgets_props ON widgets USING GIN(props);
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('DROP TABLE IF EXISTS widgets CASCADE');
}
