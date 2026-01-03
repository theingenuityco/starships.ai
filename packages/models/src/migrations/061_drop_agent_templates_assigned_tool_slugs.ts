/**
 * Drop legacy `agent_templates.assigned_tool_slugs`.
 *
 * Tool assignments for templates are represented by the junction table:
 * `agent_template_tool_templates (agent_template_id, tool_template_id)`.
 *
 * The API-level field `assignedToolSlugs` is populated dynamically from that junction table
 * and is not persisted as a column on `agent_templates`.
 */
type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE agent_templates
      DROP COLUMN IF EXISTS assigned_tool_slugs;
    `);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

export async function down(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // Best-effort rollback: re-add the column (values cannot be reconstructed reliably).
    await client.query(`
      ALTER TABLE agent_templates
      ADD COLUMN IF NOT EXISTS assigned_tool_slugs TEXT[] DEFAULT ARRAY[]::TEXT[];
    `);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}


