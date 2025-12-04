import type { Client } from 'pg';

/**
 * Migration 016: Add additional publication metadata to agents
 *
 * Goal:
 * - Store user-selected version bump type and requested version
 * - Store a human-readable changelog for the publication request
 *
 * Fields:
 * - publication_version_bump: 'patch' | 'minor' | 'major'
 * - publication_requested_version: semantic version string requested by user
 * - publication_changelog: free-form changelog text
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS publication_version_bump VARCHAR(10)
        CHECK (publication_version_bump IN ('patch', 'minor', 'major')),
      ADD COLUMN IF NOT EXISTS publication_requested_version VARCHAR(20),
      ADD COLUMN IF NOT EXISTS publication_changelog TEXT
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
      ALTER TABLE agents
      DROP COLUMN IF EXISTS publication_version_bump,
      DROP COLUMN IF EXISTS publication_requested_version,
      DROP COLUMN IF EXISTS publication_changelog
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
