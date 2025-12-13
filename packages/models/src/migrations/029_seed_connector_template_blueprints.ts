import type { Client } from 'pg';
import {
  createOAuthConnectBlueprint,
  createApiKeyConnectBlueprint,
  createNoopTestBlueprint,
} from '@/seeders/connectors/createConnectorBlueprints';

/**
 * Seed common inline blueprints onto connector_templates.
 *
 * This migration attaches shared blueprints (OAuth connect, API-key connect,
 * and a basic test blueprint) to existing connector_templates rows based on
 * their auth_type.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Seeding connector_templates with common inline blueprints...');

    // OAuth2 connectors: LinkedIn, Discord, Google Drive, GitHub
    const oauthProviders = ['linkedin', 'discord', 'google_drive', 'github'];
    const oauthBlueprint = createOAuthConnectBlueprint({
      name: 'OAuth Connector Flow',
      authType: 'oauth2',
      description: 'Compute ConnectorConnectOutput for OAuth-based connectors',
    });

    const oauthTestBlueprint = createNoopTestBlueprint({
      name: 'Test OAuth Connector',
      description: 'Basic sanity check for OAuth-based connector env configuration',
    });

    for (const provider of oauthProviders) {
      await client.query(
        `
        UPDATE connector_templates
        SET
          connect_blueprint = $1::jsonb,
          test_blueprint = $2::jsonb,
          updated_at = NOW()
        WHERE provider = $3
        `,
        [JSON.stringify(oauthBlueprint), JSON.stringify(oauthTestBlueprint), provider]
      );
    }

    // API-key-based connectors (none seeded yet, but keep pattern for future)
    const apiKeyBlueprint = createApiKeyConnectBlueprint({
      name: 'API Key Connector Flow',
      authType: 'api_key',
      description: 'Compute ConnectorConnectOutput for API-key-based connectors',
    });

    const apiKeyTestBlueprint = createNoopTestBlueprint({
      name: 'Test API Key Connector',
      description: 'Basic sanity check for API-key-based connector env configuration',
    });

    await client.query(
      `
      UPDATE connector_templates
      SET
        connect_blueprint = $1::jsonb,
        test_blueprint = $2::jsonb,
        updated_at = NOW()
      WHERE auth_type = 'api_key'
      `,
      [JSON.stringify(apiKeyBlueprint), JSON.stringify(apiKeyTestBlueprint)]
    );

    await client.query('COMMIT');
    console.log('✅ connector_templates updated with common inline blueprints');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed connector_templates with inline blueprints:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Clearing common inline blueprints from connector_templates...');

    await client.query(
      `
      UPDATE connector_templates
      SET
        connect_blueprint = NULL,
        test_blueprint = NULL,
        updated_at = NOW()
      `
    );

    await client.query('COMMIT');
    console.log('✅ Common inline blueprints cleared from connector_templates');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
