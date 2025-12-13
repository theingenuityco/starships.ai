import type { Client } from 'pg';

/**
 * Reconfigure the GitHub connector template to use the GitHub App
 * user-authorization (OAuth) flow instead of the custom GitHub App
 * installation flow.
 *
 * This migration:
 * - Sets auth_type = 'oauth2' for provider = 'github'
 * - Configures oauth_authorize_url, oauth_token_url, oauth_redirect_path, oauth_scopes
 * - Updates runtime_config to use GH_OAUTH_CLIENT_ID/SECRET and per-starship
 *   env keys for the user access/refresh tokens.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Updating GitHub connector template to use OAuth App user tokens...');

    await client.query(
      `
      UPDATE connector_templates
      SET
        auth_type = 'oauth2',
        oauth_authorize_url = 'https://github.com/login/oauth/authorize',
        oauth_token_url = 'https://github.com/login/oauth/access_token',
        oauth_redirect_path = '/api/v1/connectors/github/callback',
        oauth_scopes = ARRAY['repo', 'read:org'],
        runtime_config = jsonb_build_object(
          'clientIdEnvKey', 'GH_OAUTH_CLIENT_ID',
          'clientSecretEnvKey', 'GH_OAUTH_CLIENT_SECRET',
          'accessTokenEnvKey', 'GITHUB_USER_ACCESS_TOKEN',
          'refreshTokenEnvKey', 'GITHUB_USER_REFRESH_TOKEN'
        ),
        connect_blueprint = NULL,
        updated_at = NOW()
      WHERE provider = 'github'
      `
    );

    await client.query('COMMIT');
    console.log('✅ GitHub connector template updated to use OAuth App user tokens');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to update GitHub connector template to use OAuth App user tokens:', error);
    throw error;
  }
}

/**
 * Down migration: best-effort revert to the previous GitHub template shape.
 * We restore auth_type and runtime_config to the original GitHub App
 * installation-based configuration seeded in 027_add_connector_templates.
 */
export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Reverting GitHub connector template to previous App-install configuration...');

    await client.query(
      `
      UPDATE connector_templates
      SET
        auth_type = 'oauth2',
        oauth_authorize_url = NULL,
        oauth_token_url = NULL,
        oauth_redirect_path = NULL,
        oauth_scopes = NULL,
        runtime_config = jsonb_build_object(
          'appIdEnvKey', 'GITHUB_APP_ID',
          'privateKeyEnvKey', 'GITHUB_APP_PRIVATE_KEY_BASE64'
        ),
        connect_blueprint = NULL,
        updated_at = NOW()
      WHERE provider = 'github'
      `
    );

    await client.query('COMMIT');
    console.log('✅ GitHub connector template reverted to App-install configuration');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to revert GitHub connector template to App-install configuration:', error);
    throw error;
  }
}
