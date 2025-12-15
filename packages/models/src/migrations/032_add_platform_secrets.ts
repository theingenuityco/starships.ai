import type { Client } from 'pg';

/**
 * Add a DB-backed encrypted store for platform-wide secrets/config.
 *
 * This is used to move connector-template "host env" secrets (OAuth client IDs,
 * client secrets, Discord bot token, etc.) out of process environment variables
 * and into the database, while still allowing safe encryption at rest.
 *
 * NOTE: Values are encrypted application-side using ENCRYPTION_KEY.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Creating platform_secrets table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_secrets (
        id VARCHAR(255) PRIMARY KEY,
        key VARCHAR(255) NOT NULL UNIQUE,
        encrypted_value TEXT NOT NULL,
        description VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) NOT NULL DEFAULT 'system',
        updated_by VARCHAR(255) NOT NULL DEFAULT 'system'
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_platform_secrets_key ON platform_secrets(key)`);

    await client.query('COMMIT');
    console.log('✅ platform_secrets table created');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to create platform_secrets table:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Dropping platform_secrets table...');
    await client.query('DROP TABLE IF EXISTS platform_secrets');
    await client.query('COMMIT');
    console.log('✅ platform_secrets table dropped');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
