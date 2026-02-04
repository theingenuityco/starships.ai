import type { Client } from 'pg';

/**
 * Migration 105: Add reaction notifications
 *
 * - Extends notifications.type CHECK constraint to include 'reaction'
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Drop existing CHECK constraint (created by migration 100) and recreate with the new type.
    // Default name for the inline CHECK in Postgres is typically: notifications_type_check
    await client.query(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;`);
    await client.query(`ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('dm', 'mention', 'reaction'));`);
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
    await client.query(`ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('dm', 'mention'));`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

