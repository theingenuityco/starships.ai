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
 * - Drop connector_templates.endpoints_json after backfill (no legacy storage)
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

    // Backfill from connector_templates.endpoints_json (if column exists).
    // We guard with a dynamic column existence check to keep this migration
    // safe across environments.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'connector_templates'
            AND column_name = 'endpoints_json'
        ) THEN
          INSERT INTO connector_template_actions (
            id,
            template_id,
            action_name,
            ordinal,
            method,
            path,
            description,
            base_url_override,
            timeout_ms,
            request_style,
            parameters_json,
            mapping_json,
            response_json,
            created_at,
            updated_at
          )
          SELECT
            (ct.id || ':' || (elem->>'name')) AS id,
            ct.id AS template_id,
            (elem->>'name') AS action_name,
            (ord - 1)::int AS ordinal,
            (elem->>'method') AS method,
            (elem->>'path') AS path,
            NULLIF(elem->>'description', '') AS description,
            NULLIF(elem->>'baseUrlOverride', '') AS base_url_override,
            NULLIF(elem->>'timeoutMs', '')::int AS timeout_ms,
            NULLIF(elem->>'requestStyle', '') AS request_style,
            (CASE WHEN elem ? 'parameters' THEN elem->'parameters' ELSE NULL END) AS parameters_json,
            (CASE WHEN elem ? 'mapping' THEN elem->'mapping' ELSE NULL END) AS mapping_json,
            (CASE WHEN elem ? 'response' THEN elem->'response' ELSE NULL END) AS response_json,
            NOW(),
            NOW()
          FROM connector_templates ct
          CROSS JOIN LATERAL (
            SELECT e.elem, e.ord
            FROM jsonb_array_elements(ct.endpoints_json) WITH ORDINALITY AS e(elem, ord)
          ) AS e
          WHERE ct.endpoints_json IS NOT NULL
            AND jsonb_typeof(ct.endpoints_json) = 'array'
            AND COALESCE(NULLIF((e.elem->>'name'), ''), '') <> ''
            AND COALESCE(NULLIF((e.elem->>'method'), ''), '') <> ''
            AND COALESCE(NULLIF((e.elem->>'path'), ''), '') <> ''
          ON CONFLICT (id) DO NOTHING;
        END IF;
      END $$;
    `);

    // Drop legacy endpoints_json column now that actions are in the new table.
    await client.query(`
      ALTER TABLE connector_templates
      DROP COLUMN IF EXISTS endpoints_json
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
    // Best-effort revert: re-add endpoints_json and repack rows into array.
    await client.query(`
      ALTER TABLE connector_templates
        ADD COLUMN IF NOT EXISTS endpoints_json JSONB NOT NULL DEFAULT '[]'::jsonb
    `);

    // Repack actions into endpoints_json (ordered).
    await client.query(`
      UPDATE connector_templates ct
      SET endpoints_json = COALESCE((
        SELECT jsonb_agg(
          jsonb_strip_nulls(
            jsonb_build_object(
              'name', a.action_name,
              'description', a.description,
              'method', a.method,
              'path', a.path,
              'baseUrlOverride', a.base_url_override,
              'timeoutMs', a.timeout_ms,
              'requestStyle', a.request_style,
              'parameters', a.parameters_json,
              'mapping', a.mapping_json,
              'response', a.response_json
            )
          )
          ORDER BY a.ordinal
        )
        FROM connector_template_actions a
        WHERE a.template_id = ct.id
      ), '[]'::jsonb),
      updated_at = NOW()
    `);

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

