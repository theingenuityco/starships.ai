import type { Client } from 'pg';

/**
 * Migration 089: Add agent template profile image fields
 *
 * Goals:
 * - Agent templates store public profile image references (S3-backed, publicly served by API)
 * - Profile images: problem_statements, capabilities, try_these_prompts
 * - Mirrors the avatar pattern (040_add_agent_avatars.ts)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Agent templates: store S3 pointers for public profile images (do not expose raw S3 key to clients)
    await client.query(`
      ALTER TABLE agent_templates
      ADD COLUMN IF NOT EXISTS problem_statements_s3_key VARCHAR(1000),
      ADD COLUMN IF NOT EXISTS problem_statements_mime_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS problem_statements_updated_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS capabilities_s3_key VARCHAR(1000),
      ADD COLUMN IF NOT EXISTS capabilities_mime_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS capabilities_updated_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS try_these_prompts_s3_key VARCHAR(1000),
      ADD COLUMN IF NOT EXISTS try_these_prompts_mime_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS try_these_prompts_updated_at TIMESTAMPTZ NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_templates_problem_statements_updated_at
      ON agent_templates(problem_statements_updated_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_templates_capabilities_updated_at
      ON agent_templates(capabilities_updated_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_templates_try_these_prompts_updated_at
      ON agent_templates(try_these_prompts_updated_at);
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
      DROP INDEX IF EXISTS idx_agent_templates_problem_statements_updated_at;
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_agent_templates_capabilities_updated_at;
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_agent_templates_try_these_prompts_updated_at;
    `);

    await client.query(`
      ALTER TABLE agent_templates
      DROP COLUMN IF EXISTS problem_statements_s3_key,
      DROP COLUMN IF EXISTS problem_statements_mime_type,
      DROP COLUMN IF EXISTS problem_statements_updated_at,
      DROP COLUMN IF EXISTS capabilities_s3_key,
      DROP COLUMN IF EXISTS capabilities_mime_type,
      DROP COLUMN IF EXISTS capabilities_updated_at,
      DROP COLUMN IF EXISTS try_these_prompts_s3_key,
      DROP COLUMN IF EXISTS try_these_prompts_mime_type,
      DROP COLUMN IF EXISTS try_these_prompts_updated_at
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
