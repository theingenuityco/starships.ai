import type { Client } from 'pg';

/**
 * Migration 097:
 * Create conversation_summaries table (no backfill).
 *
 * This table stores server-managed rolling conversation summaries and the cursor boundary
 * for what the summary covers. It replaces legacy storage of summary fields in conversations.state.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        conversation_id VARCHAR(255) PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        summary TEXT NOT NULL DEFAULT '',
        summary_before_created_at TIMESTAMPTZ NULL,
        summary_before_message_id VARCHAR(255) NULL REFERENCES messages(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        version INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Cursor consistency: either both cursor fields are NULL or both are non-NULL.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'ck_conversation_summaries_cursor_consistency'
        ) THEN
          ALTER TABLE conversation_summaries
            ADD CONSTRAINT ck_conversation_summaries_cursor_consistency
            CHECK (
              (summary_before_created_at IS NULL AND summary_before_message_id IS NULL)
              OR
              (summary_before_created_at IS NOT NULL AND summary_before_message_id IS NOT NULL)
            );
        END IF;
      END $$;
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_summaries_updated_at ON conversation_summaries(updated_at DESC);`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('DROP INDEX IF EXISTS idx_conversation_summaries_updated_at;');
    await client.query('ALTER TABLE conversation_summaries DROP CONSTRAINT IF EXISTS ck_conversation_summaries_cursor_consistency;');
    await client.query('DROP TABLE IF EXISTS conversation_summaries;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

