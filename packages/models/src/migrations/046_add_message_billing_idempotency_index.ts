import type { Client } from 'pg';

/**
 * Migration 046: Create credits ledger table (wallet_ledger) + idempotency indexes.
 *
 * We keep the legacy `ledger_entries` table intact for historical/audit purposes.
 * All new credit transactions are written to `wallet_ledger`.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_ledger (
        id VARCHAR(255) PRIMARY KEY,
        wallet_id VARCHAR(255) NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
        type VARCHAR(30) NOT NULL CHECK (type IN ('TOPUP','USAGE','REFUND','ADJUSTMENT')),
        amount DECIMAL(18,6) NOT NULL,
        balance_after DECIMAL(18,6) NOT NULL,
        meta JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_created_at ON wallet_ledger (wallet_id, created_at DESC)`);

    // Idempotency: one per-message debit per wallet
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_message_wallet_unique
      ON wallet_ledger (wallet_id, (meta->>'messageId'))
      WHERE type = 'USAGE' AND (meta ? 'messageId')
    `);

    // Optional safety: one per-usage debit per wallet (legacy/compat only; not used by the new credit system)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_usage_wallet_unique
      ON wallet_ledger (wallet_id, (meta->>'usageId'))
      WHERE type = 'USAGE' AND (meta ? 'usageId')
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
    await client.query(`DROP INDEX IF EXISTS idx_wallet_ledger_usage_wallet_unique`);
    await client.query(`DROP INDEX IF EXISTS idx_wallet_ledger_message_wallet_unique`);
    await client.query(`DROP INDEX IF EXISTS idx_wallet_ledger_wallet_created_at`);
    await client.query(`DROP TABLE IF EXISTS wallet_ledger`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
