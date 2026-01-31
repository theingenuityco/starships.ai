import type { Client } from 'pg';

/**
 * Migration 088: Add agent profile image attachment fields
 *
 * Goals:
 * - Agents store three profile images as Attachments (S3-backed, auth-scoped)
 * - Profile images: problem_statements, capabilities, try_these_prompts
 * - Each profile image is stored as an Attachment with FK reference on agent
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Agents: link to attachment rows (profile images)
    await client.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS problem_statements_attachment_id VARCHAR(255) REFERENCES attachments(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS capabilities_attachment_id VARCHAR(255) REFERENCES attachments(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS try_these_prompts_attachment_id VARCHAR(255) REFERENCES attachments(id) ON DELETE SET NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_problem_statements_attachment_id
      ON agents(problem_statements_attachment_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_capabilities_attachment_id
      ON agents(capabilities_attachment_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_try_these_prompts_attachment_id
      ON agents(try_these_prompts_attachment_id);
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      DROP INDEX IF EXISTS idx_agents_problem_statements_attachment_id;
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_agents_capabilities_attachment_id;
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_agents_try_these_prompts_attachment_id;
    `);

    await client.query(`
      ALTER TABLE agents
      DROP COLUMN IF EXISTS problem_statements_attachment_id,
      DROP COLUMN IF EXISTS capabilities_attachment_id,
      DROP COLUMN IF EXISTS try_these_prompts_attachment_id
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
