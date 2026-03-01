import type { Client } from 'pg';

/**
 * Migration 153: Add dataset autoincrement state table
 *
 * Stores per-(dataset_id, column_name) counters so autoincrement values can be
 * allocated atomically, even under concurrent writes.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS starship_dataset_autoincrement (
        dataset_id VARCHAR(255) NOT NULL REFERENCES starship_datasets(id) ON DELETE CASCADE,
        column_name VARCHAR(100) NOT NULL,
        next_value BIGINT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        PRIMARY KEY (dataset_id, column_name)
      );

      CREATE INDEX IF NOT EXISTS idx_starship_dataset_autoincrement_dataset_id
        ON starship_dataset_autoincrement(dataset_id);
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
    await client.query('DROP TABLE IF EXISTS starship_dataset_autoincrement CASCADE;');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

