import type { Client } from 'pg';

/**
 * Normalize connector_templates.runtime_config oauth.metadataFromQuery.
 *
 * Goals:
 * - Remove legacy top-level runtime_config.metadataFromQuery
 * - Ensure runtime_config.oauth.metadataFromQuery is always present as an array (default: [])
 *
 * This migration is the ONLY place we support legacy top-level runtime_config.metadataFromQuery:
 * we coalesce it once into runtime_config.oauth.metadataFromQuery, then delete the legacy key.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      UPDATE connector_templates
      SET
        runtime_config =
          jsonb_set(
            -- Ensure runtime_config.oauth is an object and drop legacy top-level key.
            (
              (COALESCE(runtime_config, '{}'::jsonb) - 'metadataFromQuery' - 'oauth')
              || jsonb_build_object(
                'oauth',
                CASE
                  WHEN jsonb_typeof(COALESCE(runtime_config, '{}'::jsonb)->'oauth') = 'object'
                    THEN (COALESCE(runtime_config, '{}'::jsonb)->'oauth')
                  ELSE '{}'::jsonb
                END
              )
            ),
            '{oauth,metadataFromQuery}',
            CASE
              WHEN jsonb_typeof(COALESCE(runtime_config, '{}'::jsonb)->'oauth'->'metadataFromQuery') = 'array'
                THEN (COALESCE(runtime_config, '{}'::jsonb)->'oauth'->'metadataFromQuery')
              WHEN jsonb_typeof(COALESCE(runtime_config, '{}'::jsonb)->'metadataFromQuery') = 'array'
                THEN (COALESCE(runtime_config, '{}'::jsonb)->'metadataFromQuery')
              -- Default for Discord if nothing is configured (keeps behavior consistent post-legacy cleanup)
              WHEN provider = 'discord'
                THEN '["guild_id","permissions"]'::jsonb
              ELSE '[]'::jsonb
            END,
            true
          ),
        updated_at = NOW()
      WHERE
        auth_type = 'oauth2'
        OR (COALESCE(runtime_config, '{}'::jsonb) ? 'oauth')
        OR (COALESCE(runtime_config, '{}'::jsonb) ? 'metadataFromQuery')
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function down(_client: Client): Promise<void> {
  // Best-effort no-op: we can't reliably restore removed legacy keys.
}
