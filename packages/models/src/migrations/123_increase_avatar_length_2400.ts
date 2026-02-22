import type { Client } from 'pg';

/**
 * Migration 123: Increase avatar column lengths to 2400 chars
 *
 * - users.avatar
 * - messages.user_avatar (added in migration 088)
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE users
      ALTER COLUMN avatar TYPE VARCHAR(2400);

    ALTER TABLE messages
      ALTER COLUMN IF EXISTS user_avatar TYPE VARCHAR(2400);
  `;

  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE messages
      ALTER COLUMN IF EXISTS user_avatar TYPE VARCHAR(500);

    ALTER TABLE users
      ALTER COLUMN avatar TYPE VARCHAR(500);
  `;

  await client.query(sql);
}

