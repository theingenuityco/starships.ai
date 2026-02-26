import type { Client } from 'pg';

/**
 * Migration 137: Add stable content hashes to agents/tools for import conflict detection.
 *
 * Notes:
 * - Hash values are computed at the application layer (Node) and stored in DB.
 * - We keep these columns nullable to allow lazy backfill.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE tools
      ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)
    `);

    await client.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tools_starship_content_hash
      ON tools(starship_id, content_hash)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_starship_content_hash
      ON agents(starship_id, content_hash)
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
    await client.query('DROP INDEX IF EXISTS idx_agents_starship_content_hash');
    await client.query('DROP INDEX IF EXISTS idx_tools_starship_content_hash');
    await client.query('ALTER TABLE agents DROP COLUMN IF EXISTS content_hash');
    await client.query('ALTER TABLE tools DROP COLUMN IF EXISTS content_hash');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

