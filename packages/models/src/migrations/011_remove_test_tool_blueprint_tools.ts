import type { Client } from 'pg';

/**
 * Migration 011: Remove test-tool-blueprint tools
 *
 * Goal:
 * - Unassign any tools whose slug starts with "test-tool-blueprint"
 *   from Gaia and Daedalus agents across all starships
 * - Then delete those tool instances from the starships
 *
 * Notes:
 * - Relationships from other agents will be removed automatically via
 *   ON DELETE CASCADE when the tools are deleted.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Unassign test-tool-blueprint* tools from Gaia and Daedalus agents
    await client.query(`
      DELETE FROM agent_tools at
      USING tools t, agents a
      WHERE at.tool_id = t.id
        AND at.agent_id = a.id
        AND t.slug LIKE 'test-tool-blueprint%'
        AND a.template_id IN (
          SELECT id
          FROM agent_templates
          WHERE slug IN ('gaia', 'daedalus')
        );
    `);

    // Delete all test-tool-blueprint* tools from starships
    await client.query(`
      DELETE FROM tools
      WHERE slug LIKE 'test-tool-blueprint%';
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(_client: Client): Promise<void> {
  // Irreversible: we cannot recover deleted tools or relationships
}


