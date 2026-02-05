import type { Client } from 'pg';

/**
 * Connector Webhook Bindings
 *
 * Maps a provider-derived external account/installation identifier
 * to one-or-more connector instances (fanout).
 *
 * Routing key: (provider, external_account_id) -> connector_id[]
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS connector_webhook_bindings (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        external_account_id TEXT NOT NULL,
        connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
        starship_id TEXT NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (provider, external_account_id, connector_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_webhook_bindings_provider_external_account
        ON connector_webhook_bindings(provider, external_account_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_webhook_bindings_connector_id
        ON connector_webhook_bindings(connector_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_webhook_bindings_starship_id
        ON connector_webhook_bindings(starship_id)
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
    await client.query('DROP INDEX IF EXISTS idx_connector_webhook_bindings_starship_id');
    await client.query('DROP INDEX IF EXISTS idx_connector_webhook_bindings_connector_id');
    await client.query('DROP INDEX IF EXISTS idx_connector_webhook_bindings_provider_external_account');
    await client.query('DROP TABLE IF EXISTS connector_webhook_bindings');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

