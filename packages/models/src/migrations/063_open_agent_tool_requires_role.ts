import type { Client } from 'pg';
import { agentOpenToolTemplate } from '@/seeders/tools/open-agent';

/**
 * Migration 063: Ensure the seeded open-agent tool exposes the required `role` parameter
 * and updated blueprint so agent creation requests include it.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query<{ id: string }>(`SELECT id FROM tool_templates WHERE slug = 'open-agent' LIMIT 1;`);
    const row = res.rows?.[0];

    if (!row) {
      await client.query('COMMIT');
      return;
    }

    const template = agentOpenToolTemplate;

    await client.query(
      `
        UPDATE tool_templates
        SET
          parameters = $1::jsonb,
          blueprint = $2::jsonb,
          description = $3,
          version = $4,
          example_usage = $5,
          updated_at = NOW()
        WHERE id = $6
      `,
      [
        JSON.stringify(template.parameters),
        JSON.stringify(template.blueprint),
        template.description,
        template.version,
        template.exampleUsage ?? null,
        row.id,
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // No-op rollback: keeping the corrected template is safer than restoring stale schema.
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
