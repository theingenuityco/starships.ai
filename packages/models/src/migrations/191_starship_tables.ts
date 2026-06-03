import type { Client } from 'pg';

/**
 * Migration 191: Restructure "datasets" into the per-starship Database of Tables.
 *
 * Greenfield/destructive: the JSONB dataset tables are dropped (no backfill).
 * Each starship's Database is a schema `db_<starshipId>` (provisioned at runtime
 * by StarshipDatabaseProvisioner); each Table is a real Postgres table inside it.
 *
 * `starship_tables` is the registry. Structural truth (column types/constraints)
 * lives in the real per-starship tables; `columns_meta_json` holds the authored
 * column definitions (semantic metadata: format, enum, reference, description).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Drop the JSONB-era tables (room_datasets first: it FKs starship_datasets).
    await client.query('DROP TABLE IF EXISTS room_datasets CASCADE;');
    await client.query('DROP TABLE IF EXISTS starship_dataset_autoincrement CASCADE;');
    await client.query('DROP TABLE IF EXISTS starship_dataset_rows CASCADE;');
    await client.query('DROP TABLE IF EXISTS starship_datasets CASCADE;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS starship_tables (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        description VARCHAR(2000) NOT NULL DEFAULT '',
        schema_name VARCHAR(63) NOT NULL,
        physical_table VARCHAR(63) NOT NULL,
        columns_meta_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        primary_key VARCHAR(100) NULL,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE (starship_id, slug),
        UNIQUE (schema_name, physical_table)
      );

      CREATE INDEX IF NOT EXISTS idx_starship_tables_starship_id ON starship_tables(starship_id);
      CREATE INDEX IF NOT EXISTS idx_starship_tables_starship_archived ON starship_tables(starship_id, archived);
      CREATE INDEX IF NOT EXISTS idx_starship_tables_starship_created_at ON starship_tables(starship_id, created_at);

      CREATE TABLE IF NOT EXISTS room_tables (
        room_conversation_id VARCHAR(255) NOT NULL,
        table_id VARCHAR(255) NOT NULL REFERENCES starship_tables(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) NULL,

        PRIMARY KEY (room_conversation_id, table_id)
      );

      CREATE INDEX IF NOT EXISTS idx_room_tables_table_id ON room_tables(table_id);
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
    await client.query('DROP TABLE IF EXISTS room_tables CASCADE;');
    await client.query('DROP TABLE IF EXISTS starship_tables CASCADE;');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
