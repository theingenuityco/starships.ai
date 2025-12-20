import type { Client } from 'pg';

/**
 * Migration 047: Convert legacy USD wallet balances to credits.
 *
 * Background:
 * - Historically, `wallets.balance` and `ledger_entries.amount/balance_after` were USD.
 * - After the credits migration, those same numeric columns represent "credits".
 *
 * This migration:
 * - Multiplies balances and ledger amounts for wallets currently marked `currency='USD'`
 * - Sets `wallets.currency='CREDITS'` for those wallets
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

    // 1) Convert ledger amounts for wallets that are still in USD.
    // Do this BEFORE flipping wallet currency.
    await client.query(
      `
      WITH usd_wallets AS (
        SELECT id FROM wallets WHERE currency = 'USD'
      )
      UPDATE ledger_entries le
         SET amount = (le.amount * $1::decimal),
             balance_after = (le.balance_after * $1::decimal)
        FROM usd_wallets uw
       WHERE le.wallet_id = uw.id
      `,
      [creditsPerUsd]
    );

    // 2) Convert wallet balances and flip currency.
    await client.query(
      `
      UPDATE wallets
         SET balance = (balance * $1::decimal),
             currency = 'CREDITS',
             updated_at = NOW()
       WHERE currency = 'USD'
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
    // Best-effort reversal: only revert wallets/ledger that are still clearly legacy-converted
    // (wallets.currency='CREDITS' but without any message-based billing entries).
    const creditsPerUsd = 200;

    await client.query(
      `
      WITH revert_wallets AS (
        SELECT w.id
          FROM wallets w
         WHERE w.currency = 'CREDITS'
           AND NOT EXISTS (
             SELECT 1
               FROM ledger_entries le
              WHERE le.wallet_id = w.id
                AND le.type = 'USAGE'
                AND (le.meta ? 'messageId')
           )
      )
      UPDATE ledger_entries le
         SET amount = (le.amount / $1::decimal),
             balance_after = (le.balance_after / $1::decimal)
        FROM revert_wallets rw
       WHERE le.wallet_id = rw.id
      `,
      [creditsPerUsd]
    );

    await client.query(
      `
      UPDATE wallets w
         SET balance = (w.balance / $1::decimal),
             currency = 'USD',
             updated_at = NOW()
       WHERE w.currency = 'CREDITS'
         AND NOT EXISTS (
           SELECT 1
             FROM ledger_entries le
            WHERE le.wallet_id = w.id
              AND le.type = 'USAGE'
              AND (le.meta ? 'messageId')
         )
      `,
      [creditsPerUsd]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
