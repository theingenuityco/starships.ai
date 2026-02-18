import type { Client } from 'pg';

/**
 * Migration 121: Add 'channel' notification type
 *
 * Extends notifications.type CHECK constraint to include 'channel'.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;`);
    await client.query(
      `ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('dm', 'mention', 'reaction', 'channel'));`
    );
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;`);
    await client.query(`ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('dm', 'mention', 'reaction'));`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

