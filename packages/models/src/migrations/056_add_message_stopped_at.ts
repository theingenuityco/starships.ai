import type { Client } from 'pg';

/**
 * Migration 056: Add stopped_at column to messages table
 *
 * This migration adds a stopped_at timestamp field to track when messages
 * were stopped mid-stream. This allows the server to be authoritative about
 * stopped messages, eliminating the need for client-side _stopped flags.
 *
 * - stopped_at IS NULL: Message completed normally
 * - stopped_at IS NOT NULL: Message was stopped mid-stream at this timestamp
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Add stopped_at column (IF NOT EXISTS is not supported for columns, so we use DO block)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'messages' AND column_name = 'stopped_at'
        ) THEN
          ALTER TABLE messages 
          ADD COLUMN stopped_at TIMESTAMP WITH TIME ZONE NULL;
        END IF;
      END
      $$;
    `);

    // Create index for queries filtering by stopped messages
    // Using partial index since most messages won't be stopped
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_stopped_at 
      ON messages(stopped_at) 
      WHERE stopped_at IS NOT NULL;
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
    // Drop index first
    await client.query(`
      DROP INDEX IF EXISTS idx_messages_stopped_at;
    `);

    // Drop column
    await client.query(`
      ALTER TABLE messages 
      DROP COLUMN IF EXISTS stopped_at;
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
