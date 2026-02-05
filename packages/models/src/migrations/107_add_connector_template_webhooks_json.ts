import type { Client } from 'pg';

/**
 * Connector templates: webhook/event ingestion config (DB-driven connectors)
 *
 * Adds an optional JSONB column on connector_templates to describe how inbound
 * webhooks/events should be verified and normalized.
 *
 * This is intentionally server-consumed only (runner does not need it).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE connector_templates
        ADD COLUMN IF NOT EXISTS webhooks_json JSONB
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
      ALTER TABLE connector_templates
        DROP COLUMN IF EXISTS webhooks_json
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

