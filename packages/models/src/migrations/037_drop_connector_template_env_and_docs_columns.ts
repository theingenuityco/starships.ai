import type { Client } from 'pg';

/**
 * Connector templates cleanup + runtime_config structure.
 *
 * 1) Structure connector_templates.runtime_config by grouping OAuth settings into a single object:
 *    - runtime_config.oauth: {
 *        clientId, clientSecret, accessToken, refreshToken, apiKey,
 *        authorizeUrl, tokenUrl, redirectPath, scopes,
 *        metadataFromQuery, params
 *      }
 *
 * 2) Drop legacy connector_templates columns:
 * - required_env_keys
 * - optional_env_keys
 * - docs_slug
 *
 * Rationale: env vars are already linked to connectors via environments.connector_id,
 * and docs links can be handled elsewhere without persisting per-template slugs.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Structuring connector_templates.runtime_config (oauth)...');

    await client.query(`
      UPDATE connector_templates
      SET
        runtime_config =
          (runtime_config - 'envKeys')
          || jsonb_build_object(
            'oauth',
            (
              -- defaults derived from dedicated oauth_* columns + legacy root keys
              jsonb_strip_nulls(
                jsonb_build_object(
                  -- env var key names (preferred final shape)
                  'clientId', runtime_config->>'clientIdEnvKey',
                  'clientSecret', runtime_config->>'clientSecretEnvKey',
                  'accessToken', runtime_config->>'accessTokenEnvKey',
                  'refreshToken', runtime_config->>'refreshTokenEnvKey',
                  'apiKey', runtime_config->>'envKey',
                  -- OAuth endpoints + behavior
                  'authorizeUrl', oauth_authorize_url,
                  'tokenUrl', oauth_token_url,
                  'redirectPath', oauth_redirect_path,
                  'scopes', to_jsonb(oauth_scopes),
                  'metadataFromQuery', runtime_config->'metadataFromQuery',
                  'params', jsonb_strip_nulls(
                    jsonb_build_object(
                      'accessType', runtime_config->>'accessType',
                      'prompt', runtime_config->>'prompt',
                      'permissions', runtime_config->'permissions'
                    )
                  )
                )
              )
              -- existing oauth (if present) should override defaults
              || COALESCE(runtime_config->'oauth', '{}'::jsonb)
            )
          ),
        updated_at = NOW()
      WHERE
        auth_type = 'oauth2'
        OR runtime_config ?| ARRAY[
          'clientIdEnvKey',
          'clientSecretEnvKey',
          'accessTokenEnvKey',
          'refreshTokenEnvKey',
          'metadataFromQuery',
          'accessType',
          'prompt',
          'permissions',
          'envKey'
        ]
        OR runtime_config ?| ARRAY[
          'envKeys',
          'oauth'
        ]
    `);

    console.log('🚀 Dropping legacy connector_templates env/docs columns...');

    await client.query(`
      ALTER TABLE connector_templates
      DROP COLUMN IF EXISTS required_env_keys,
      DROP COLUMN IF EXISTS optional_env_keys,
      DROP COLUMN IF EXISTS docs_slug
    `);

    await client.query('COMMIT');
    console.log('✅ connector_templates structured + cleaned up');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to structure/clean connector_templates:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Restoring legacy connector_templates env/docs columns...');

    await client.query(`
      ALTER TABLE connector_templates
      ADD COLUMN IF NOT EXISTS required_env_keys TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS optional_env_keys TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS docs_slug TEXT
    `);

    console.log('🔄 Removing structured oauth from connector_templates.runtime_config...');

    await client.query(`
      UPDATE connector_templates
      SET
        runtime_config = runtime_config - 'oauth',
        updated_at = NOW()
    `);

    await client.query('COMMIT');
    console.log('✅ connector_templates cleanup reverted');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to revert connector_templates cleanup:', error);
    throw error;
  }
}

