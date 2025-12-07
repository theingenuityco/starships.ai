import type { Client } from 'pg';

/**
 * Migration 019: Add publication workflow fields to tools
 *
 * Goal:
 * - Mirror the agent publication workflow for tools so that tool instances
 *   can be promoted into/upgraded from marketplace tool templates via an
 *   explicit publish + admin approval flow.
 *
 * Fields:
 * - publication_status: 'draft' | 'pending_approval' | 'published' | 'rejected'
 * - publication_requested_by: user who requested publish
 * - publication_approved_by: instance admin who approved/rejected
 * - publication_approved_at: timestamp of approval
 * - publication_version_bump: 'patch' | 'minor' | 'major'
 * - publication_requested_version: semantic version string requested by user
 * - publication_changelog: free-form changelog text
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE tools
      ADD COLUMN IF NOT EXISTS publication_status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (publication_status IN ('draft', 'pending_approval', 'published', 'rejected')),
      ADD COLUMN IF NOT EXISTS publication_requested_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS publication_approved_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS publication_approved_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS publication_version_bump VARCHAR(10)
        CHECK (publication_version_bump IN ('patch', 'minor', 'major')),
      ADD COLUMN IF NOT EXISTS publication_requested_version VARCHAR(20),
      ADD COLUMN IF NOT EXISTS publication_changelog TEXT
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tools_publication_status
      ON tools(publication_status);
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
      DROP INDEX IF EXISTS idx_tools_publication_status;
    `);

    await client.query(`
      ALTER TABLE tools
      DROP COLUMN IF EXISTS publication_status,
      DROP COLUMN IF EXISTS publication_requested_by,
      DROP COLUMN IF EXISTS publication_approved_by,
      DROP COLUMN IF EXISTS publication_approved_at,
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


