type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

/**
 * Migration 082: Remove list-connectors tool template
 *
 * Removes the deprecated `list-connectors` tool template and all related data:
 * - Deletes tool instances created from this template
 * - Removes agent-template-tool-template relationships
 * - Deletes the tool template itself
 *
 * This tool has been replaced by `search-connector` which provides search functionality
 * instead of returning all connectors.
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // Find the list-connectors tool template(s)
    const templateRes = await client.query(
      `SELECT id, name, slug FROM tool_templates WHERE slug LIKE 'list-connectors%'`
    );
    const templates = toRows<{ id: string; name: string; slug: string }>(templateRes);

    if (templates.length === 0) {
      console.log('[MIGRATION-082] No list-connectors tool template found, skipping');
      await client.query('COMMIT');
      return;
    }

    let deletedToolInstances = 0;
    let deletedRelationships = 0;

    for (const template of templates) {
      console.log(`[MIGRATION-082] Processing template: ${template.name} (${template.slug}, id: ${template.id})`);

      // 1. Delete tool instances created from this template
      const toolInstancesRes = await client.query(
        `DELETE FROM tools WHERE source_template_id = $1 RETURNING id`,
        [template.id]
      );
      const deletedTools = toRows<{ id: string }>(toolInstancesRes);
      deletedToolInstances += deletedTools.length;
      if (deletedTools.length > 0) {
        console.log(`[MIGRATION-082] Deleted ${deletedTools.length} tool instance(s) from template ${template.slug}`);
      }

      // 2. Delete agent-template-tool-template relationships
      const relationshipsRes = await client.query(
        `DELETE FROM agent_template_tool_templates WHERE tool_template_id = $1 RETURNING agent_template_id`,
        [template.id]
      );
      const deletedRels = toRows<{ agent_template_id: string }>(relationshipsRes);
      deletedRelationships += deletedRels.length;
      if (deletedRels.length > 0) {
        console.log(`[MIGRATION-082] Removed ${deletedRels.length} agent-template relationship(s) for template ${template.slug}`);
      }

      // 3. Delete the tool template itself
      await client.query(`DELETE FROM tool_templates WHERE id = $1`, [template.id]);
      console.log(`[MIGRATION-082] Deleted tool template: ${template.name} (${template.slug})`);
    }

    console.log(
      `[MIGRATION-082] Summary: Deleted ${templates.length} tool template(s), ${deletedToolInstances} tool instance(s), ${deletedRelationships} relationship(s)`
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(_client: DbClient): Promise<void> {
  // This migration is intentionally irreversible.
  // The list-connectors tool template has been removed from the seeders,
  // so we cannot restore it. If needed, it would need to be re-added to
  // the seeders and re-seeded.
  console.log('[MIGRATION-082] Rollback not supported - list-connectors tool template has been removed from seeders');
}
