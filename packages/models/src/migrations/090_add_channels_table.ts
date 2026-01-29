import type { Client } from 'pg';

/**
 * Migration 090: Add channels table (conversation-backed)
 *
 * Channels reuse `conversations` as the message container and SSE key, but store
 * identity/visibility in a first-class table for strong constraints and efficient queries.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS channels (
        conversation_id VARCHAR(255) PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        slug VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        is_private BOOLEAN NOT NULL DEFAULT false,
        topic TEXT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // Fast starship channel listing
    await client.query(`CREATE INDEX IF NOT EXISTS idx_channels_starship_id ON channels(starship_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_channels_is_private ON channels(is_private);`);

    // Enforce Slack-like slug uniqueness per starship (case-insensitive)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_channels_starship_slug_ci ON channels(starship_id, lower(slug));`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP TABLE IF EXISTS channels;`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

