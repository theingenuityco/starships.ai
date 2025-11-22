import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Creating connectors table and linking environments...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS connectors (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'pending', 'connected', 'error')),
        metadata JSONB DEFAULT '{}'::jsonb,
        last_error TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (starship_id, provider)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connectors_starship_id
      ON connectors(starship_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connectors_provider
      ON connectors(provider)
    `);

    // Link environments to connectors via optional foreign key
    await client.query(`
      ALTER TABLE environments
      ADD COLUMN IF NOT EXISTS connector_id VARCHAR(255) REFERENCES connectors(id) ON DELETE SET NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_environments_connector_id
      ON environments(connector_id)
    `);

    await client.query('COMMIT');
    console.log('✅ connectors table and environment linkage created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to create connectors table and linkage:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Dropping connectors table and unlinking environments...');

    await client.query('DROP INDEX IF EXISTS idx_environments_connector_id');
    await client.query('ALTER TABLE environments DROP COLUMN IF EXISTS connector_id');

    await client.query('DROP INDEX IF EXISTS idx_connectors_provider');
    await client.query('DROP INDEX IF EXISTS idx_connectors_starship_id');
    await client.query('DROP TABLE IF EXISTS connectors');

    await client.query('COMMIT');
    console.log('✅ connectors table and environment linkage dropped successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
