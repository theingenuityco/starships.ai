import type { Client } from 'pg';

/**
 * Drop redundant OAuth columns from connector_templates.
 *
 * OAuth configuration is now sourced exclusively from connector_templates.runtime_config.oauth.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Dropping redundant connector_templates oauth_* columns...');

    await client.query(`
      ALTER TABLE connector_templates
      DROP COLUMN IF EXISTS oauth_authorize_url,
      DROP COLUMN IF EXISTS oauth_token_url,
      DROP COLUMN IF EXISTS oauth_scopes,
      DROP COLUMN IF EXISTS oauth_redirect_path
    `);

    await client.query('COMMIT');
    console.log('✅ connector_templates oauth_* columns dropped');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to drop connector_templates oauth_* columns:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Restoring connector_templates oauth_* columns...');

    await client.query(`
      ALTER TABLE connector_templates
      ADD COLUMN IF NOT EXISTS oauth_authorize_url TEXT,
      ADD COLUMN IF NOT EXISTS oauth_token_url TEXT,
      ADD COLUMN IF NOT EXISTS oauth_scopes TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS oauth_redirect_path TEXT
    `);

    await client.query('COMMIT');
    console.log('✅ connector_templates oauth_* columns restored');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to restore connector_templates oauth_* columns:', error);
    throw error;
  }
}
