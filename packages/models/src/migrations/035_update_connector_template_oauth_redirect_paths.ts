import type { Client } from 'pg';

/**
 * Normalize OAuth redirect paths for connector_templates.
 *
 * Historical connector templates used:
 *   /api/v1/connectors/:provider/oauth/callback
 *
 * The server now treats the canonical path as:
 *   /api/v1/connectors/:provider/callback
 *
 * (and keeps /oauth/callback as a backwards-compatible alias).
 *
 * This migration updates existing rows so the computed OAuth `redirect_uri`
 * matches the canonical route and is consistent across providers.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Normalizing connector_templates oauth_redirect_path values...');

    await client.query(`
      UPDATE connector_templates
      SET
        oauth_redirect_path = REGEXP_REPLACE(oauth_redirect_path, '/oauth/callback$', '/callback'),
        updated_at = NOW()
      WHERE oauth_redirect_path LIKE '/api/v1/connectors/%/oauth/callback'
    `);

    await client.query('COMMIT');
    console.log('✅ connector_templates oauth_redirect_path normalized');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to normalize connector_templates oauth_redirect_path:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Reverting connector_templates oauth_redirect_path normalization...');

    await client.query(`
      UPDATE connector_templates
      SET
        oauth_redirect_path = REGEXP_REPLACE(oauth_redirect_path, '/callback$', '/oauth/callback'),
        updated_at = NOW()
      WHERE oauth_redirect_path ~ '^/api/v1/connectors/[^/]+/callback$'
    `);

    await client.query('COMMIT');
    console.log('✅ connector_templates oauth_redirect_path normalization reverted');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to revert connector_templates oauth_redirect_path normalization:', error);
    throw error;
  }
}
