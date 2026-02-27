import type { Client } from 'pg';

/**
 * Migration 143: Add starship datasets (tabular data) tables
 *
 * Starship-scoped tabular datasets used by humans and agents.
 *
 * Notes:
 * - Dataset schema is stored as JSONB (`columns_json`) for flexibility.
 * - Rows are stored as JSONB (`data_json`) with optional `row_key` for upsert semantics.
 * - Pagination uses (dataset_id, created_at, id) indexes for common access patterns.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS starship_datasets (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        description VARCHAR(2000) NOT NULL DEFAULT '',
        columns_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        primary_key VARCHAR(100) NULL,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE (starship_id, slug)
      );

      CREATE INDEX IF NOT EXISTS idx_starship_datasets_starship_id ON starship_datasets(starship_id);
      CREATE INDEX IF NOT EXISTS idx_starship_datasets_starship_archived ON starship_datasets(starship_id, archived);
      CREATE INDEX IF NOT EXISTS idx_starship_datasets_starship_created_at ON starship_datasets(starship_id, created_at);

      CREATE TABLE IF NOT EXISTS starship_dataset_rows (
        id VARCHAR(255) PRIMARY KEY,
        dataset_id VARCHAR(255) NOT NULL REFERENCES starship_datasets(id) ON DELETE CASCADE,
        row_key TEXT NULL,
        data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE (dataset_id, row_key)
      );

      CREATE INDEX IF NOT EXISTS idx_starship_dataset_rows_dataset_created_at
        ON starship_dataset_rows(dataset_id, created_at, id);

      CREATE INDEX IF NOT EXISTS idx_starship_dataset_rows_dataset_updated_at
        ON starship_dataset_rows(dataset_id, updated_at, id);
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
    await client.query('DROP TABLE IF EXISTS starship_dataset_rows CASCADE;');
    await client.query('DROP TABLE IF EXISTS starship_datasets CASCADE;');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

