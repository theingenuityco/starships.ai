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

    await client.query(
      `
      UPDATE connector_templates
      SET
        auth_type = 'oauth2',
        updated_at = NOW()
      WHERE provider = 'github'
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
