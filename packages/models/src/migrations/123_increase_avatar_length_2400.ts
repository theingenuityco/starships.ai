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

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'user_avatar'
      ) THEN
        ALTER TABLE messages
          ALTER COLUMN user_avatar TYPE VARCHAR(2400);
      END IF;
    END $$;
  `;

  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'user_avatar'
      ) THEN
        ALTER TABLE messages
          ALTER COLUMN user_avatar TYPE VARCHAR(500);
      END IF;
    END $$;

    ALTER TABLE users
      ALTER COLUMN avatar TYPE VARCHAR(500);
  `;

  await client.query(sql);
}
