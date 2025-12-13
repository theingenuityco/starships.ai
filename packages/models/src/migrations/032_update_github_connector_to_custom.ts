import type { Client } from 'pg';

/**
 * Update the GitHub connector template to use auth_type = 'custom' instead of
 * 'oauth2'. This allows the GitHub App installation flow to be driven entirely
 * by a provider-specific connect blueprint while keeping token minting and
 * secrets in the host.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Updating GitHub connector template to auth_type = custom...');

    // Expand auth_type check constraint to allow 'custom' in addition to the
    // existing values ('oauth2', 'api_key', 'none'). This matches the updated
    // ConnectorTemplateEntity validation and ConnectorAuthType union.
    await client.query(
      `
      ALTER TABLE connector_templates
      DROP CONSTRAINT IF EXISTS connector_templates_auth_type_check;
      `
    );

    await client.query(
      `
      ALTER TABLE connector_templates
      ADD CONSTRAINT connector_templates_auth_type_check
      CHECK (auth_type IN ('oauth2', 'api_key', 'custom', 'none'));
      `
    );

    await client.query(
      `
      UPDATE connector_templates
      SET
        auth_type = 'custom',
        updated_at = NOW()
      WHERE provider = 'github'
      `
    );

    await client.query('COMMIT');
    console.log('✅ GitHub connector template updated to auth_type = custom');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to update GitHub connector template to auth_type = custom:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Reverting GitHub connector template auth_type back to oauth2...');

    // First, revert GitHub template auth_type so it satisfies the stricter
    // constraint we are about to restore.

    await client.query(
      `
      UPDATE connector_templates
      SET
        auth_type = 'oauth2',
        updated_at = NOW()
      WHERE provider = 'github'
      `
    );

    // Restore original auth_type check constraint (without 'custom').
    await client.query(
      `
      ALTER TABLE connector_templates
      DROP CONSTRAINT IF EXISTS connector_templates_auth_type_check;
      `
    );

    await client.query(
      `
      ALTER TABLE connector_templates
      ADD CONSTRAINT connector_templates_auth_type_check
      CHECK (auth_type IN ('oauth2', 'api_key', 'none'));
      `
    );

    await client.query('COMMIT');
    console.log('✅ GitHub connector template auth_type reverted to oauth2');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to revert GitHub connector template auth_type to oauth2:', error);
    throw error;
  }
}
