import type { Client } from 'pg';

/**
 * Migration 083: Add starship_invite_tokens table (email-link invites)
 *
 * Stores one-time invite tokens to join a starship.
 *
 * Security:
 * - token is unique and consumed atomically during acceptance.
 * - invited_email is stored for email-match enforcement at acceptance time.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS starship_invite_tokens (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        token VARCHAR(64) UNIQUE NOT NULL,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        invited_email VARCHAR(255) NOT NULL,
        invited_by_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'collaborator' CHECK (role IN ('collaborator', 'admin')),
        consumed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
        consumed_at TIMESTAMP WITH TIME ZONE
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_starship_invite_tokens_starship_id ON starship_invite_tokens(starship_id);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_starship_invite_tokens_invited_email_ci ON starship_invite_tokens(lower(invited_email));`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_starship_invite_tokens_expires_at ON starship_invite_tokens(expires_at);`
    );
    // Fast lookup for active tokens (token itself is unique, but this helps some planners)
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_starship_invite_tokens_token_active ON starship_invite_tokens(token) WHERE NOT consumed;`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP TABLE IF EXISTS starship_invite_tokens;`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  await client.query('COMMIT');
}

