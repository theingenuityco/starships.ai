import type { Client } from 'pg';

/**
 * Migration 122: Include 'channel' notifications in per-message de-dupe
 *
 * We dedupe by (user_id, type, message_id) for:
 * - dm
 * - mention
 * - channel
 *
 * Reactions are intentionally excluded (multiple reactions per message should create multiple rows).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP INDEX IF EXISTS uq_notifications_user_type_message;`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_type_message
        ON notifications(user_id, type, message_id)
       WHERE message_id IS NOT NULL AND type IN ('dm', 'mention', 'channel');
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
       WHERE message_id IS NOT NULL AND type IN ('dm', 'mention');
    `);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

