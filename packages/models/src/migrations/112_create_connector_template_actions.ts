import type { Client } from 'pg';

/**
 * Connector Template Actions
 *
 * Split connector_templates.endpoints_json (JSONB array of ConnectorEndpointV2)
 * into a dedicated table with one row per action/endpoint.
 *
 * We intentionally:
 * - Unwrap high-signal, indexable fields into typed columns (method/path/etc.)
 * - Keep flexible structures (mapping/parameters/response) as JSONB for parity
 * - Keep connector_templates.endpoints_json (legacy) for manual migration
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS connector_template_actions (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES connector_templates(id) ON DELETE CASCADE,
        action_name TEXT NOT NULL,
        ordinal INT NOT NULL DEFAULT 0,

        method TEXT NOT NULL,
        path TEXT NOT NULL,
        description TEXT,
        base_url_override TEXT,
        timeout_ms INT,
        request_style TEXT,

        parameters_json JSONB,
        mapping_json JSONB,
        response_json JSONB,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE (template_id, action_name),
        CHECK (action_name <> ''),
        CHECK (method IN ('GET','POST','PUT','PATCH','DELETE','HEAD')),
        CHECK (request_style IS NULL OR request_style IN ('auto','query','json','form','multipart'))
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_template_actions_template_ordinal
        ON connector_template_actions(template_id, ordinal)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_template_actions_template_action
        ON connector_template_actions(template_id, action_name)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_template_actions_template_method
        ON connector_template_actions(template_id, method)
    `);

    // IMPORTANT:
    // We do NOT backfill from connector_templates.endpoints_json here.
    // Migration from legacy endpoints_json -> connector_template_actions is triggered
    // manually via an admin UI action.

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('DROP INDEX IF EXISTS idx_connector_template_actions_template_method');
    await client.query('DROP INDEX IF EXISTS idx_connector_template_actions_template_action');
    await client.query('DROP INDEX IF EXISTS idx_connector_template_actions_template_ordinal');
    await client.query('DROP TABLE IF EXISTS connector_template_actions');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

