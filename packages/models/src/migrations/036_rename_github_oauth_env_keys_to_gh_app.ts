import type { Client } from 'pg';

/**
 * Rename GitHub connector env-key strings to the GH_* convention.
 *
 * Why: these values are persisted in DB rows (connector_templates.runtime_config
 * and environments.key), so code-only renames do not update existing installs.
 *
 * Renames:
 * - GITHUB_APP_CLIENT_ID     -> GH_APP_CLIENT_ID
 * - GITHUB_APP_CLIENT_SECRET -> GH_APP_CLIENT_SECRET
 * - GITHUB_APP_ACCESS_TOKEN  -> GH_APP_ACCESS_TOKEN
 * - GITHUB_APP_REFRESH_TOKEN -> GH_APP_REFRESH_TOKEN
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Renaming GitHub OAuth env keys to GH_APP_*...');

    // Update connector template configuration for GitHub (existing rows).
    await client.query(`
      UPDATE connector_templates
      SET
        required_env_keys = array_replace(required_env_keys, 'GITHUB_APP_ACCESS_TOKEN', 'GH_APP_ACCESS_TOKEN'),
        optional_env_keys = array_replace(optional_env_keys, 'GITHUB_APP_REFRESH_TOKEN', 'GH_APP_REFRESH_TOKEN'),
        runtime_config = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                runtime_config,
                '{clientIdEnvKey}',
                to_jsonb(
                  CASE
                    WHEN runtime_config->>'clientIdEnvKey' = 'GITHUB_APP_CLIENT_ID' THEN 'GH_APP_CLIENT_ID'
                    ELSE COALESCE(runtime_config->>'clientIdEnvKey', 'GH_APP_CLIENT_ID')
                  END
                ),
                true
              ),
              '{clientSecretEnvKey}',
              to_jsonb(
                CASE
                  WHEN runtime_config->>'clientSecretEnvKey' = 'GITHUB_APP_CLIENT_SECRET' THEN 'GH_APP_CLIENT_SECRET'
                  ELSE COALESCE(runtime_config->>'clientSecretEnvKey', 'GH_APP_CLIENT_SECRET')
                END
              ),
              true
            ),
            '{accessTokenEnvKey}',
            to_jsonb(
              CASE
                WHEN runtime_config->>'accessTokenEnvKey' = 'GITHUB_APP_ACCESS_TOKEN' THEN 'GH_APP_ACCESS_TOKEN'
                ELSE COALESCE(runtime_config->>'accessTokenEnvKey', 'GH_APP_ACCESS_TOKEN')
              END
            ),
            true
          ),
          '{refreshTokenEnvKey}',
          to_jsonb(
            CASE
              WHEN runtime_config->>'refreshTokenEnvKey' = 'GITHUB_APP_REFRESH_TOKEN' THEN 'GH_APP_REFRESH_TOKEN'
              ELSE COALESCE(runtime_config->>'refreshTokenEnvKey', 'GH_APP_REFRESH_TOKEN')
            END
          ),
          true
        ),
        updated_at = NOW()
      WHERE provider = 'github'
    `);

    // Rename per-starship environments keys. Handle duplicates safely under UNIQUE(starship_id, key).
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

    await client.query('COMMIT');
    console.log('✅ GitHub OAuth env keys renamed to GH_APP_*');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to rename GitHub OAuth env keys:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Reverting GH_APP_* GitHub OAuth env key rename...');

    await client.query(`
      UPDATE connector_templates
      SET
        required_env_keys = array_replace(required_env_keys, 'GH_APP_ACCESS_TOKEN', 'GITHUB_APP_ACCESS_TOKEN'),
        optional_env_keys = array_replace(optional_env_keys, 'GH_APP_REFRESH_TOKEN', 'GITHUB_APP_REFRESH_TOKEN'),
        runtime_config = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                runtime_config,
                '{clientIdEnvKey}',
                to_jsonb(
                  CASE
                    WHEN runtime_config->>'clientIdEnvKey' = 'GH_APP_CLIENT_ID' THEN 'GITHUB_APP_CLIENT_ID'
                    ELSE runtime_config->>'clientIdEnvKey'
                  END
                ),
                true
              ),
              '{clientSecretEnvKey}',
              to_jsonb(
                CASE
                  WHEN runtime_config->>'clientSecretEnvKey' = 'GH_APP_CLIENT_SECRET' THEN 'GITHUB_APP_CLIENT_SECRET'
                  ELSE runtime_config->>'clientSecretEnvKey'
                END
              ),
              true
            ),
            '{accessTokenEnvKey}',
            to_jsonb(
              CASE
                WHEN runtime_config->>'accessTokenEnvKey' = 'GH_APP_ACCESS_TOKEN' THEN 'GITHUB_APP_ACCESS_TOKEN'
                ELSE runtime_config->>'accessTokenEnvKey'
              END
            ),
            true
          ),
          '{refreshTokenEnvKey}',
          to_jsonb(
            CASE
              WHEN runtime_config->>'refreshTokenEnvKey' = 'GH_APP_REFRESH_TOKEN' THEN 'GITHUB_APP_REFRESH_TOKEN'
              ELSE runtime_config->>'refreshTokenEnvKey'
            END
          ),
          true
        ),
        updated_at = NOW()
      WHERE provider = 'github'
    `);

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

    await client.query('COMMIT');
    console.log('✅ GH_APP_* GitHub OAuth env key rename reverted');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to revert GH_APP_* GitHub OAuth env key rename:', error);
    throw error;
  }
}
