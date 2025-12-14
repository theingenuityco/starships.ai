import type { Client } from 'pg';
import { createOAuthConnectBlueprint } from '@/seeders/connectors/createConnectorBlueprints';

/**
 * SQUASH of migrations 031..038.
 *
 * Net effects:
 * - Ensure connector_templates.auth_type supports 'custom' (constraint widened).
 * - Remove default OAuth connect_blueprints from common OAuth providers.
 * - Normalize oauth_redirect_path: /oauth/callback -> /callback.
 * - Ensure GitHub template is configured for OAuth App user-token flow.
 * - Rename persisted env keys for GitHub user tokens: GITHUB_APP_* -> GH_APP_* (environments + runtime_config keys).
 * - Structure connector_templates.runtime_config.oauth and drop legacy columns.
 * - Clear connector_templates.test_blueprint and drop redundant oauth_* columns.
 *
 * Important: this migration is written to be safe if executed on a DB that already
 * applied the original 031..038 migrations (guards around dropped columns).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 [squash 031..038] connector_templates oauth cleanup...');

    // 032: expand auth_type check constraint to allow 'custom'.
    await client.query(`
      ALTER TABLE connector_templates
      DROP CONSTRAINT IF EXISTS connector_templates_auth_type_check
    `);
    await client.query(`
      ALTER TABLE connector_templates
      ADD CONSTRAINT connector_templates_auth_type_check
      CHECK (auth_type IN ('oauth2', 'api_key', 'custom', 'none'))
    `);

    // 031: remove default OAuth connect_blueprints from connector_templates for known providers.
    const oauthProviders = ['linkedin', 'discord', 'google_drive', 'github'];
    await client.query(
      `
      UPDATE connector_templates
      SET
        connect_blueprint = NULL,
        updated_at = NOW()
      WHERE provider = ANY($1::text[])
      `,
      [oauthProviders]
    );

    // 035: normalize redirect path only if the legacy column still exists.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'connector_templates'
            AND column_name = 'oauth_redirect_path'
        ) THEN
          UPDATE connector_templates
          SET
            oauth_redirect_path = REGEXP_REPLACE(oauth_redirect_path, '/oauth/callback$', '/callback'),
            updated_at = NOW()
          WHERE oauth_redirect_path LIKE '/api/v1/connectors/%/oauth/callback';
        END IF;
      END $$;
    `);

    // 034 + 036 (folded): ensure GitHub template is configured and uses GH_APP_* env key names.
    // Guarded so it won't fail if oauth_* or legacy env columns were already dropped.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'connector_templates'
            AND column_name = 'oauth_authorize_url'
        ) THEN
          UPDATE connector_templates
          SET
            auth_type = 'oauth2',
            oauth_authorize_url = 'https://github.com/login/oauth/authorize',
            oauth_token_url = 'https://github.com/login/oauth/access_token',
            oauth_redirect_path = '/api/v1/connectors/github/callback',
            oauth_scopes = ARRAY['repo', 'read:org'],
            connect_blueprint = NULL,
            runtime_config =
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      COALESCE(runtime_config, '{}'::jsonb),
                      '{clientIdEnvKey}',
                      to_jsonb('GH_APP_CLIENT_ID'::text),
                      true
                    ),
                    '{clientSecretEnvKey}',
                    to_jsonb('GH_APP_CLIENT_SECRET'::text),
                    true
                  ),
                  '{accessTokenEnvKey}',
                  to_jsonb('GH_APP_ACCESS_TOKEN'::text),
                  true
                ),
                '{refreshTokenEnvKey}',
                to_jsonb('GH_APP_REFRESH_TOKEN'::text),
                true
              ),
            updated_at = NOW()
          WHERE provider = 'github';
        ELSE
          -- Even if oauth_* columns are gone, ensure runtime_config key strings match GH_APP_*.
          UPDATE connector_templates
          SET
            runtime_config =
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      COALESCE(runtime_config, '{}'::jsonb),
                      '{clientIdEnvKey}',
                      to_jsonb('GH_APP_CLIENT_ID'::text),
                      true
                    ),
                    '{clientSecretEnvKey}',
                    to_jsonb('GH_APP_CLIENT_SECRET'::text),
                    true
                  ),
                  '{accessTokenEnvKey}',
                  to_jsonb('GH_APP_ACCESS_TOKEN'::text),
                  true
                ),
                '{refreshTokenEnvKey}',
                to_jsonb('GH_APP_REFRESH_TOKEN'::text),
                true
              ),
            updated_at = NOW()
          WHERE provider = 'github';
        END IF;
      END $$;
    `);

    // 036: rename per-starship environment keys. Handle duplicates safely under UNIQUE(starship_id, key).
    await client.query(`
      WITH to_update AS (
        SELECT e.id
        FROM environments e
        WHERE e.key = 'GITHUB_APP_ACCESS_TOKEN'
          AND NOT EXISTS (
            SELECT 1
            FROM environments e2
            WHERE e2.starship_id = e.starship_id
              AND e2.key = 'GH_APP_ACCESS_TOKEN'
          )
      )
      UPDATE environments
      SET key = 'GH_APP_ACCESS_TOKEN', updated_at = NOW()
      WHERE id IN (SELECT id FROM to_update)
    `);
    await client.query(`
      DELETE FROM environments e
      WHERE e.key = 'GITHUB_APP_ACCESS_TOKEN'
        AND EXISTS (
          SELECT 1
          FROM environments e2
          WHERE e2.starship_id = e.starship_id
            AND e2.key = 'GH_APP_ACCESS_TOKEN'
        )
    `);
    await client.query(`
      WITH to_update AS (
        SELECT e.id
        FROM environments e
        WHERE e.key = 'GITHUB_APP_REFRESH_TOKEN'
          AND NOT EXISTS (
            SELECT 1
            FROM environments e2
            WHERE e2.starship_id = e.starship_id
              AND e2.key = 'GH_APP_REFRESH_TOKEN'
          )
      )
      UPDATE environments
      SET key = 'GH_APP_REFRESH_TOKEN', updated_at = NOW()
      WHERE id IN (SELECT id FROM to_update)
    `);
    await client.query(`
      DELETE FROM environments e
      WHERE e.key = 'GITHUB_APP_REFRESH_TOKEN'
        AND EXISTS (
          SELECT 1
          FROM environments e2
          WHERE e2.starship_id = e.starship_id
            AND e2.key = 'GH_APP_REFRESH_TOKEN'
        )
    `);

    // 037: structure runtime_config.oauth (only if oauth_* columns still exist).
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'connector_templates'
            AND column_name = 'oauth_authorize_url'
        ) THEN
          UPDATE connector_templates
          SET
            runtime_config =
              (runtime_config - 'envKeys')
              || jsonb_build_object(
                'oauth',
                (
                  jsonb_strip_nulls(
                    jsonb_build_object(
                      'clientId', runtime_config->>'clientIdEnvKey',
                      'clientSecret', runtime_config->>'clientSecretEnvKey',
                      'accessToken', runtime_config->>'accessTokenEnvKey',
                      'refreshToken', runtime_config->>'refreshTokenEnvKey',
                      'apiKey', runtime_config->>'envKey',
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
            OR runtime_config ?| ARRAY['envKeys', 'oauth'];
        END IF;
      END $$;
    `);

    // 037: drop legacy columns (env/docs).
    await client.query(`
      ALTER TABLE connector_templates
      DROP COLUMN IF EXISTS required_env_keys,
      DROP COLUMN IF EXISTS optional_env_keys,
      DROP COLUMN IF EXISTS docs_slug
    `);

    // 038: remove default test_blueprint values (noop tests) for all templates.
    await client.query(`
      UPDATE connector_templates
      SET
        test_blueprint = NULL,
        updated_at = NOW()
      WHERE test_blueprint IS NOT NULL
    `);

    // 038: drop redundant oauth_* columns.
    await client.query(`
      ALTER TABLE connector_templates
      DROP COLUMN IF EXISTS oauth_authorize_url,
      DROP COLUMN IF EXISTS oauth_token_url,
      DROP COLUMN IF EXISTS oauth_scopes,
      DROP COLUMN IF EXISTS oauth_redirect_path
    `);

    await client.query('COMMIT');
    console.log('✅ [squash 031..038] complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [squash 031..038] failed:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 [squash 031..038] best-effort revert...');

    // Re-add removed columns (best-effort; does not restore prior values).
    await client.query(`
      ALTER TABLE connector_templates
      ADD COLUMN IF NOT EXISTS required_env_keys TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS optional_env_keys TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS docs_slug TEXT
    `);
    await client.query(`
      ALTER TABLE connector_templates
      ADD COLUMN IF NOT EXISTS oauth_authorize_url TEXT,
      ADD COLUMN IF NOT EXISTS oauth_token_url TEXT,
      ADD COLUMN IF NOT EXISTS oauth_scopes TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS oauth_redirect_path TEXT
    `);

    // Remove structured oauth object.
    await client.query(`
      UPDATE connector_templates
      SET
        runtime_config = COALESCE(runtime_config, '{}'::jsonb) - 'oauth',
        updated_at = NOW()
    `);

    // Revert env-key renames (tokens only), safely under UNIQUE(starship_id, key).
    await client.query(`
      WITH to_update AS (
        SELECT e.id
        FROM environments e
        WHERE e.key = 'GH_APP_ACCESS_TOKEN'
          AND NOT EXISTS (
            SELECT 1
            FROM environments e2
            WHERE e2.starship_id = e.starship_id
              AND e2.key = 'GITHUB_APP_ACCESS_TOKEN'
          )
      )
      UPDATE environments
      SET key = 'GITHUB_APP_ACCESS_TOKEN', updated_at = NOW()
      WHERE id IN (SELECT id FROM to_update)
    `);
    await client.query(`
      DELETE FROM environments e
      WHERE e.key = 'GH_APP_ACCESS_TOKEN'
        AND EXISTS (
          SELECT 1
          FROM environments e2
          WHERE e2.starship_id = e.starship_id
            AND e2.key = 'GITHUB_APP_ACCESS_TOKEN'
        )
    `);
    await client.query(`
      WITH to_update AS (
        SELECT e.id
        FROM environments e
        WHERE e.key = 'GH_APP_REFRESH_TOKEN'
          AND NOT EXISTS (
            SELECT 1
            FROM environments e2
            WHERE e2.starship_id = e.starship_id
              AND e2.key = 'GITHUB_APP_REFRESH_TOKEN'
          )
      )
      UPDATE environments
      SET key = 'GITHUB_APP_REFRESH_TOKEN', updated_at = NOW()
      WHERE id IN (SELECT id FROM to_update)
    `);
    await client.query(`
      DELETE FROM environments e
      WHERE e.key = 'GH_APP_REFRESH_TOKEN'
        AND EXISTS (
          SELECT 1
          FROM environments e2
          WHERE e2.starship_id = e.starship_id
            AND e2.key = 'GITHUB_APP_REFRESH_TOKEN'
        )
    `);

    // Revert oauth redirect path normalization (only on rows that match canonical pattern).
    await client.query(`
      UPDATE connector_templates
      SET
        oauth_redirect_path = REGEXP_REPLACE(oauth_redirect_path, '/callback$', '/oauth/callback'),
        updated_at = NOW()
      WHERE oauth_redirect_path ~ '^/api/v1/connectors/[^/]+/callback$'
    `);

    // Revert auth_type constraint only if safe (avoid failing if any rows use 'custom').
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM connector_templates WHERE auth_type = 'custom') THEN
          ALTER TABLE connector_templates
          DROP CONSTRAINT IF EXISTS connector_templates_auth_type_check;

          ALTER TABLE connector_templates
          ADD CONSTRAINT connector_templates_auth_type_check
          CHECK (auth_type IN ('oauth2', 'api_key', 'none'));
        END IF;
      END $$;
    `);

    // Restore default OAuth connect_blueprints for known providers (mirrors original 031 down).
    const oauthProviders = ['linkedin', 'discord', 'google_drive', 'github'];
    const oauthBlueprint = createOAuthConnectBlueprint({
      name: 'OAuth Connector Flow',
      authType: 'oauth2',
      description: 'Compute ConnectorConnectOutput for OAuth-based connectors',
    });
    await client.query(
      `
      UPDATE connector_templates
      SET
        connect_blueprint = $1::jsonb,
        updated_at = NOW()
      WHERE provider = ANY($2::text[])
      `,
      [JSON.stringify(oauthBlueprint), oauthProviders]
    );

    await client.query('COMMIT');
    console.log('✅ [squash 031..038] reverted (best-effort)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [squash 031..038] revert failed:', error);
    throw error;
  }
}
