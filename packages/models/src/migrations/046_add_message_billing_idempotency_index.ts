import type { Client } from 'pg';

/**
 * Migration 046: Add idempotency index for per-message billing.
 *
 * We bill fixed credits per user message by writing a USAGE ledger entry with:
 *   meta.messageId = <message id>
 *
 * This index prevents double-charging the same message under retries.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_message_wallet_unique
      ON ledger_entries (wallet_id, (meta->>'messageId'))
      WHERE type = 'USAGE' AND (meta ? 'messageId')
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
    await client.query(`DROP INDEX IF EXISTS idx_ledger_message_wallet_unique`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
