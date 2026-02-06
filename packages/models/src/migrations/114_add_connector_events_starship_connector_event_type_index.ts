import type { Client } from 'pg';

/**
 * Connector Events: add index for common lookup pattern.
 *
 * Supports queries filtering by:
 * - starship_id
 * - connector_id
 * - event_type
 * with newest events first (received_at DESC).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_events_starship_connector_event_type_received_at
        ON connector_events(starship_id, connector_id, event_type, received_at DESC)
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
    await client.query(`
      DROP INDEX IF EXISTS idx_connector_events_starship_connector_event_type_received_at
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

