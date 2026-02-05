import type { Client } from 'pg';

/**
 * Connector Events
 *
 * Normalized, deduped inbound connector events (webhooks / poll results).
 *
 * This is the canonical persistence layer for connector-driven triggers.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS connector_events (
        id TEXT PRIMARY KEY,
        starship_id TEXT NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        event_type TEXT NOT NULL,
        external_event_id TEXT,
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        raw_payload_json JSONB,
        headers_json JSONB,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Idempotency/dedupe when a provider supplies a stable external id.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_connector_events_connector_external_event_id
        ON connector_events(connector_id, external_event_id)
        WHERE external_event_id IS NOT NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_events_starship_provider_received_at
        ON connector_events(starship_id, provider, received_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_events_connector_received_at
        ON connector_events(connector_id, received_at DESC)
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
    await client.query(`DROP TABLE IF EXISTS connector_events`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

