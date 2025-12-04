import type { Client } from 'pg';

/**
 * Migration 013: Add publication workflow fields to agents
 *
 * Goal:
 * - Track publication lifecycle for agents so they can be published
 *   only after instance admin approval.
 *
 * Fields:
 * - publication_status: 'draft' | 'pending_approval' | 'published' | 'rejected'
 * - publication_requested_by: user who requested publish
 * - publication_approved_by: instance admin who approved/rejected
 * - publication_approved_at: timestamp of approval
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS publication_status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (publication_status IN ('draft', 'pending_approval', 'published', 'rejected')),
      ADD COLUMN IF NOT EXISTS publication_requested_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS publication_approved_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS publication_approved_at TIMESTAMPTZ NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_publication_status
      ON agents(publication_status);
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
      DROP INDEX IF EXISTS idx_agents_publication_status;
    `);

    await client.query(`
      ALTER TABLE agents
      DROP COLUMN IF EXISTS publication_status,
      DROP COLUMN IF EXISTS publication_requested_by,
      DROP COLUMN IF EXISTS publication_approved_by,
      DROP COLUMN IF EXISTS publication_approved_at
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}


