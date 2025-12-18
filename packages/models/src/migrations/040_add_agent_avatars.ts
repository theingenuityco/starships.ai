import type { Client } from 'pg';

/**
 * Migration 040: Add agent + marketplace avatar fields
 *
 * Goals:
 * - Agents store an avatar as an Attachment (S3-backed, auth-scoped)
 * - Agent templates store a public avatar reference (S3-backed, publicly served by API)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Agents: link to an attachment row (avatar image)
    await client.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS avatar_attachment_id VARCHAR(255) REFERENCES attachments(id) ON DELETE SET NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_avatar_attachment_id
      ON agents(avatar_attachment_id);
    `);

    // Agent templates: store S3 pointer for a public avatar (do not expose raw S3 key to clients)
    await client.query(`
      ALTER TABLE agent_templates
      ADD COLUMN IF NOT EXISTS avatar_s3_key VARCHAR(1000),
      ADD COLUMN IF NOT EXISTS avatar_mime_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_templates_avatar_updated_at
      ON agent_templates(avatar_updated_at);
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
      DROP INDEX IF EXISTS idx_agents_avatar_attachment_id;
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_agent_templates_avatar_updated_at;
    `);

    await client.query(`
      ALTER TABLE agents
      DROP COLUMN IF EXISTS avatar_attachment_id
    `);

    await client.query(`
      ALTER TABLE agent_templates
      DROP COLUMN IF EXISTS avatar_s3_key,
      DROP COLUMN IF EXISTS avatar_mime_type,
      DROP COLUMN IF EXISTS avatar_updated_at
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
