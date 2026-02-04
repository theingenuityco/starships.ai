import type { Client } from 'pg';

/**
 * Migration 106: Exclude reaction notifications from per-message de-dupe
 *
 * Prior behavior:
 * - UNIQUE (user_id, type, message_id) WHERE message_id IS NOT NULL
 *   This caused reaction notifications to be created at most once per message per user.
 *
 * New behavior:
 * - Keep de-dupe for 'dm' and 'mention' only (reaction can create multiple rows per message).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP INDEX IF EXISTS uq_notifications_user_type_message;`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_type_message
        ON notifications(user_id, type, message_id)
       WHERE message_id IS NOT NULL AND type IN ('dm', 'mention');
    `);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP INDEX IF EXISTS uq_notifications_user_type_message;`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_type_message
        ON notifications(user_id, type, message_id)
       WHERE message_id IS NOT NULL;
    `);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
