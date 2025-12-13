import type { Client } from 'pg';
import { createGitHubAppConnectBlueprint } from '@/seeders/connectors/createConnectorBlueprints';

/**
 * Attach a custom connect_blueprint to the GitHub connector template.
 *
 * This blueprint is responsible for:
 * - phase: "start"    -> building the GitHub App installation URL
 * - phase: "complete" -> shaping metadata (e.g. githubInstallationId) and status
 *
 * Host code remains responsible for:
 * - Generating/validating state tokens
 * - Providing non-secret config/env (e.g. appSlug) via ConnectorConnectInput.config
 * - Persisting ConnectorConnectOutput via applyConnectOutput
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Seeding GitHub custom connect_blueprint into connector_templates...');

    const blueprint = createGitHubAppConnectBlueprint({
      name: 'GitHub App Connect',
      authType: 'custom',
      description: 'Compute ConnectorConnectOutput for GitHub App installation',
    });

    await client.query(
      `
      UPDATE connector_templates
      SET
        connect_blueprint = $1::jsonb,
        updated_at = NOW()
      WHERE provider = 'github'
      `,
      [JSON.stringify(blueprint)]
    );

    await client.query('COMMIT');
    console.log('✅ GitHub custom connect_blueprint seeded into connector_templates');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed GitHub custom connect_blueprint into connector_templates:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Removing GitHub custom connect_blueprint from connector_templates...');

    await client.query(
      `
      UPDATE connector_templates
      SET
        connect_blueprint = NULL,
        updated_at = NOW()
      WHERE provider = 'github'
      `
    );

    await client.query('COMMIT');
    console.log('✅ GitHub custom connect_blueprint removed from connector_templates');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to remove GitHub custom connect_blueprint from connector_templates:', error);
    throw error;
  }
}
