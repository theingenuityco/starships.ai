import type { Client } from 'pg';
import { createOAuthConnectBlueprint } from '@/seeders/connectors/createConnectorBlueprints';

/**
 * Remove default OAuth connect_blueprints from connector_templates while
 * preserving test_blueprints. This lets the TypeScript host fully control
 * OAuth start/complete flows unless a connector explicitly configures its own
 * connect_blueprint.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Removing default OAuth connect_blueprints from connector_templates...');

    // Limit to the known OAuth2 providers that were seeded in 029:
    // LinkedIn, Discord, Google Drive, GitHub.
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

    await client.query('COMMIT');
    console.log('✅ OAuth connect_blueprints removed from connector_templates');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to remove OAuth connect_blueprints from connector_templates:', error);
    throw error;
  }
}

/**
 * Down migration: restore the shared OAuth connect_blueprint for the same set
 * of providers. This mirrors the behavior of 029_seed_connector_template_blueprints
 * but only re-applies the connect_blueprint (leaving any existing test_blueprint
 * values intact).
 */
export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Restoring default OAuth connect_blueprints on connector_templates...');

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
    console.log('✅ OAuth connect_blueprints restored on connector_templates');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to restore OAuth connect_blueprints on connector_templates:', error);
    throw error;
  }
}
