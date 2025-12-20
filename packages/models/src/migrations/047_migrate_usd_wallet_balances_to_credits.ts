import type { Client } from 'pg';

/**
 * Migration 047: Convert legacy USD wallets to credits, excluding free welcome credit.
 *
 * Background:
 * - Historically, `wallets.balance` and `ledger_entries.amount/balance_after` were USD.
 * - After the credits migration, those same numeric columns represent "credits".
 *
 * This migration:
 * - Removes the legacy free $10 welcome credit by NOT converting existing wallet balances.
 * - Converts only user-paid deposits by summing completed Stripe topups (topups.amount_usd).
 * - Sets wallet balance to: sum(completed_topups.amount_usd) * creditsPerUsd
 * - Flips `wallets.currency` to 'CREDITS'
 * - Leaves legacy ledger history intact in `ledger_entries` (historical audit).
 *   New credit ledger entries are written to `wallet_ledger`.
 *
 * NOTE:
 * - New wallets created after the code change are already `currency='CREDITS'` and are NOT touched.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Read the pricing constant directly to avoid cross-package imports in migrations.
    // Keep aligned with server/config/credits.ts default (200 credits per $1).
    const creditsPerUsd = 200;

    // 1) For legacy USD wallets, compute paid USD from completed topups and set credits balance.
    await client.query(
      `
      WITH paid AS (
        SELECT
          w.id AS wallet_id,
          COALESCE(SUM(t.amount_usd), 0)::decimal AS paid_usd
        FROM wallets w
        LEFT JOIN topups t
          ON t.wallet_id = w.id
         AND t.status = 'completed'
        WHERE w.currency = 'USD'
        GROUP BY w.id
      )
      UPDATE wallets w
         SET balance = (paid.paid_usd * $1::decimal),
             currency = 'CREDITS',
             updated_at = NOW()
        FROM paid
       WHERE w.id = paid.wallet_id
      `,
      [creditsPerUsd]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Best-effort reversal:
    // - We can flip wallets back to USD and restore their "paid USD" balance
    // - We cannot restore deleted ledger history.
    await client.query(
      `
      WITH paid AS (
        SELECT
          w.id AS wallet_id,
          COALESCE(SUM(t.amount_usd), 0)::decimal AS paid_usd
        FROM wallets w
        LEFT JOIN topups t
          ON t.wallet_id = w.id
         AND t.status = 'completed'
        WHERE w.currency = 'CREDITS'
        GROUP BY w.id
      )
      UPDATE wallets w
         SET balance = paid.paid_usd,
             currency = 'USD',
             updated_at = NOW()
        FROM paid
       WHERE w.id = paid.wallet_id
      `,
      []
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
