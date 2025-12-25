import type { Client } from 'pg';

/**
 * Connector Templates V2
 *
 * Replace legacy connector_templates.runtime_config (+ inline blueprints) with
 * explicit root columns for runtime execution:
 * - base_url
 * - auth_json
 * - variables_json
 * - endpoints_json
 * - rate_limit_json
 * - metadata_schema_json
 *
 * This migration is intentionally breaking: it drops legacy columns and removes
 * legacy auth_type values (e.g. 'custom').
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Rename display_name -> name (breaking, no fallback).
    // We add name first to allow safe backfill before dropping display_name.
    await client.query(`
      ALTER TABLE connector_templates
        ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      UPDATE connector_templates
      SET
        name = COALESCE(NULLIF(name, ''), NULLIF(display_name, ''), ''),
        updated_at = NOW()
      WHERE (name = '' OR name IS NULL)
    `);

    // Add new root runtime columns (use *_json suffix to avoid collisions with generic SQL keywords).
    await client.query(`
      ALTER TABLE connector_templates
        ADD COLUMN IF NOT EXISTS base_url TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS auth_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS variables_json JSONB,
        ADD COLUMN IF NOT EXISTS endpoints_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS rate_limit_json JSONB,
        ADD COLUMN IF NOT EXISTS metadata_schema_json JSONB
    `);

    // Drop legacy auth_type values before tightening the constraint.
    // No fallback: map custom -> oauth2 (declarative oauth2) so the constraint can be applied.
    await client.query(`
      UPDATE connector_templates
      SET
        auth_type = 'oauth2',
        updated_at = NOW()
      WHERE auth_type = 'custom'
    `);

    // Update auth_type constraint to the new declarative set.
    await client.query(`
      ALTER TABLE connector_templates
      DROP CONSTRAINT IF EXISTS connector_templates_auth_type_check
    `);
    await client.query(`
      ALTER TABLE connector_templates
      ADD CONSTRAINT connector_templates_auth_type_check
      CHECK (auth_type IN ('oauth2', 'api_key', 'platform_jwt', 'none'))
    `);

    // Backfill base_url from legacy runtime_config.apiBaseUrl when present.
    await client.query(`
      UPDATE connector_templates
      SET
        base_url = COALESCE(NULLIF(base_url, ''), NULLIF(runtime_config->>'apiBaseUrl', ''), ''),
        updated_at = NOW()
      WHERE (base_url = '' OR base_url IS NULL)
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'connector_templates'
            AND column_name = 'runtime_config'
        )
    `);

    // Helper: convert oauth.params (jsonb object) into a jsonb object of strings.
    // This keeps template auth config stable and predictable for server-side OAuth URL construction.
    await client.query(`
      WITH params AS (
        SELECT
          id,
          CASE
            WHEN jsonb_typeof(runtime_config->'oauth'->'params') = 'object'
              THEN (
                SELECT jsonb_object_agg(k, to_jsonb(trim(both '"' from v::text)))
                FROM jsonb_each(runtime_config->'oauth'->'params') AS e(k, v)
              )
            ELSE NULL
          END AS params_str
        FROM connector_templates
      )
      UPDATE connector_templates ct
      SET
        auth_json =
          jsonb_strip_nulls(
            jsonb_build_object(
              'type', 'oauth2',
              'clientIdRef', ct.runtime_config->'oauth'->'clientId',
              'clientSecretRef', ct.runtime_config->'oauth'->'clientSecret',
              'authorizationUrl', ct.runtime_config->'oauth'->>'authorizeUrl',
              'tokenUrl', ct.runtime_config->'oauth'->>'tokenUrl',
              'scopes', ct.runtime_config->'oauth'->'scopes',
              'scopeDelimiter', ' ',
              'extraAuthorizeParams', p.params_str,
              'accessTokenRef', ct.runtime_config->'oauth'->'accessToken',
              'refreshTokenRef', ct.runtime_config->'oauth'->'refreshToken',
              'injection',
                jsonb_strip_nulls(
                  jsonb_build_object(
                    'style', 'header',
                    'headerName', COALESCE(ct.runtime_config->'oauth'->>'authHeaderName', 'Authorization'),
                    'tokenPrefix', COALESCE(ct.runtime_config->'oauth'->>'authPrefix', 'Bearer')
                  )
                )
            )
          ),
        updated_at = NOW()
      FROM params p
      WHERE ct.id = p.id
        AND ct.auth_type = 'oauth2'
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'connector_templates'
            AND column_name = 'runtime_config'
        )
    `);

    // Starships internal connector: declarative platform_jwt.
    // base_url is dynamic; HostRuntime will evaluate `{{ runtimeEnv.SERVER_URL }}`.
    await client.query(`
      UPDATE connector_templates
      SET
        auth_type = 'platform_jwt',
        base_url = '{{ runtimeEnv.SERVER_URL }}/api/v1',
        auth_json = jsonb_build_object(
          'type', 'platform_jwt',
          'headerName', 'Authorization',
          'tokenPrefix', 'Bearer'
        ),
        endpoints_json = jsonb_build_array(
          jsonb_build_object(
            'name', 'authorize-and-maybe-execute-tool',
            'description', 'Authorize and optionally execute a tool call via the Starships API',
            'method', 'POST',
            'path', '/conversations/{conversationId}/tool-calls/authorize-and-maybe-execute',
            'parameters', jsonb_build_object(
              'type', 'object',
              'required', jsonb_build_array('agentId','toolSlug','toolCallId','args'),
              'properties', jsonb_build_object(
                'agentId', jsonb_build_object('type','string'),
                'toolSlug', jsonb_build_object('type','string'),
                'toolCallId', jsonb_build_object('type','string'),
                'args', jsonb_build_object('type','object'),
                'conversationId', jsonb_build_object('type','string')
              ),
              'additionalProperties', false
            ),
            'mapping', jsonb_build_object(
              'path', jsonb_build_object('conversationId', '{{ String(runtimeEnv.CONVERSATION_ID ?? args.conversationId ?? "") }}'),
              'body', jsonb_build_object(
                'agentId', '{{ String(args.agentId ?? "") }}',
                'toolSlug', '{{ String(args.toolSlug ?? "") }}',
                'toolCallId', '{{ String(args.toolCallId ?? "") }}',
                'args', '{{ args.args ?? {} }}'
              )
            ),
            'requestStyle', 'json',
            'timeoutMs', 120000
          )
        ),
        updated_at = NOW()
      WHERE provider = 'starships'
    `);

    // Seed minimal endpoint catalogs for other built-ins so endpoints_json is non-empty.
    // These can be expanded later; this migration only ensures v2 has at least one action.
    await client.query(`
      UPDATE connector_templates
      SET
        endpoints_json = jsonb_build_array(
          jsonb_build_object(
            'name', 'health',
            'description', 'Basic endpoint used to verify connectivity/credentials',
            'method', 'GET',
            'path', '/health',
            'parameters', jsonb_build_object('type','object','properties', jsonb_build_object()),
            'requestStyle', 'query'
          )
        ),
        updated_at = NOW()
      WHERE provider IN ('github','google_drive','discord','linkedin')
        AND (endpoints_json IS NULL OR jsonb_typeof(endpoints_json) <> 'array' OR jsonb_array_length(endpoints_json) = 0)
    `);

    // Fail fast if any enabled template is missing critical runtime fields after backfill.
    await client.query(`
      DO $$
      DECLARE
        bad_count INT;
      BEGIN
        SELECT COUNT(*) INTO bad_count
        FROM connector_templates
        WHERE is_enabled = true
          AND (
            name IS NULL OR name = ''
            OR base_url IS NULL OR base_url = ''
            OR auth_json IS NULL OR auth_json = '{}'::jsonb
            OR endpoints_json IS NULL
            OR jsonb_typeof(endpoints_json) <> 'array'
            OR jsonb_array_length(endpoints_json) = 0
          );

        IF bad_count > 0 THEN
          RAISE EXCEPTION 'Connector template v2 migration failed: % enabled connector_templates rows missing name/base_url/auth_json/endpoints_json', bad_count;
        END IF;
      END $$;
    `);

    // Drop legacy columns (no fallback/legacy).
    await client.query(`
      ALTER TABLE connector_templates
        DROP COLUMN IF EXISTS runtime_config,
        DROP COLUMN IF EXISTS display_name,
        DROP COLUMN IF EXISTS connect_blueprint,
        DROP COLUMN IF EXISTS refresh_blueprint,
        DROP COLUMN IF EXISTS test_blueprint
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
    // Best-effort revert: re-add legacy columns and drop v2 columns.
    await client.query(`
      ALTER TABLE connector_templates
        ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS runtime_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS connect_blueprint JSONB,
        ADD COLUMN IF NOT EXISTS refresh_blueprint JSONB,
        ADD COLUMN IF NOT EXISTS test_blueprint JSONB
    `);

    await client.query(`
      ALTER TABLE connector_templates
      DROP CONSTRAINT IF EXISTS connector_templates_auth_type_check
    `);
    await client.query(`
      ALTER TABLE connector_templates
      ADD CONSTRAINT connector_templates_auth_type_check
      CHECK (auth_type IN ('oauth2', 'api_key', 'custom', 'none'))
    `);

    await client.query(`
      ALTER TABLE connector_templates
        DROP COLUMN IF EXISTS base_url,
        DROP COLUMN IF EXISTS auth_json,
        DROP COLUMN IF EXISTS variables_json,
        DROP COLUMN IF EXISTS endpoints_json,
        DROP COLUMN IF EXISTS rate_limit_json,
        DROP COLUMN IF EXISTS metadata_schema_json,
        DROP COLUMN IF EXISTS name
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
