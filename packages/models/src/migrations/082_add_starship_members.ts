import type { Client } from 'pg';

/**
 * Migration 082: Add starship_members table (collaborator access)
 *
 * Adds a membership table to support non-owner access to a starship.
 *
 * Notes:
 * - Primary key is (starship_id, user_id) to prevent duplicates.
 * - role is forward-compatible (collaborator/admin), but initial product behavior
 *   treats all non-owners as collaborators.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS starship_members (
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'collaborator' CHECK (role IN ('collaborator', 'admin')),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        PRIMARY KEY (starship_id, user_id)
      );
    `);

    // Helpful indexes for access checks / listings
    await client.query(`CREATE INDEX IF NOT EXISTS idx_starship_members_starship_id ON starship_members(starship_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_starship_members_user_id ON starship_members(user_id);`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP TABLE IF EXISTS starship_members;`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  await client.query('COMMIT');
}

