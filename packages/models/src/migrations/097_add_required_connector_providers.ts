import { getConnection } from '@/helpers/database';
import type { PostgresConnection } from '@/helpers/database';
import { extractRequiredConnectorProviders } from '@/utils/extractRequiredConnectorProviders';

/**
 * Migration 097: Add required_connector_providers to tool_templates and tools.
 *
 * Extracts connector provider identifiers from connector_action nodes in blueprints.
 * Enables "Connect these connectors" UX when deploying agents.
 */
export async function up(connection?: PostgresConnection): Promise<void> {
  const conn = connection ?? getConnection();
  await conn.transaction(async (client) => {
    console.log('[097] Adding required_connector_providers columns...');

    await client.query(`
      ALTER TABLE tool_templates
      ADD COLUMN IF NOT EXISTS required_connector_providers TEXT[] DEFAULT '{}'
    `);

    await client.query(`
      ALTER TABLE tools
      ADD COLUMN IF NOT EXISTS required_connector_providers TEXT[] DEFAULT '{}'
    `);

    console.log('[097] Backfilling tool_templates...');
    const templateResult = await client.query('SELECT id, blueprint FROM tool_templates');
    const templates = (templateResult.rows || []) as Array<{
      id: string;
      blueprint: unknown;
    }>;
    let templatesUpdated = 0;

    for (const row of templates) {
      const providers = extractRequiredConnectorProviders(
        row.blueprint as Parameters<typeof extractRequiredConnectorProviders>[0]
      );
      await client.query(
        'UPDATE tool_templates SET required_connector_providers = $1 WHERE id = $2',
        [providers, row.id]
      );
      templatesUpdated++;
    }

    console.log(`[097] Backfilled ${templatesUpdated} tool_templates`);

    console.log('[097] Backfilling tools from templates...');
    await client.query(`
      UPDATE tools t
      SET required_connector_providers = tt.required_connector_providers
      FROM tool_templates tt
      WHERE t.source_template_id = tt.id
    `);

    console.log('[097] Backfilling tools without source_template_id...');
    const toolResult = await client.query(
      'SELECT id, blueprint FROM tools WHERE source_template_id IS NULL'
    );
    const tools = (toolResult.rows || []) as Array<{ id: string; blueprint: unknown }>;
    let toolsParsed = 0;

    for (const row of tools) {
      const providers = extractRequiredConnectorProviders(
        row.blueprint as Parameters<typeof extractRequiredConnectorProviders>[0]
      );
      await client.query('UPDATE tools SET required_connector_providers = $1 WHERE id = $2', [
        providers,
        row.id,
      ]);
      toolsParsed++;
    }

    console.log(`[097] Parsed blueprint for ${toolsParsed} template-less tools`);
    console.log('[097] Migration completed successfully');
  });
}

export async function down(conn?: PostgresConnection): Promise<void> {
  const connection = conn ?? getConnection();
  await connection.transaction(async (client) => {
    await client.query('ALTER TABLE tools DROP COLUMN IF EXISTS required_connector_providers');
    await client.query('ALTER TABLE tool_templates DROP COLUMN IF EXISTS required_connector_providers');
    console.log('[097] Rollback completed');
  });
}
