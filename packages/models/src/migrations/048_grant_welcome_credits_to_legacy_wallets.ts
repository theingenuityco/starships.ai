import type { Client } from 'pg';

/**
 * Migration 048: Grant 200 welcome credits to legacy wallets (one-time, idempotent).
 *
 * Background:
 * - Migration 047 intentionally does NOT convert the legacy free $10 welcome credit.
 * - New users already receive 200 welcome credits via application code at starship creation.
 *
 * This migration targets legacy wallets (pre-credits-era) by requiring:
 * - wallet currency is already 'CREDITS' (i.e., after 047), AND
 * - wallet has legacy activity in `ledger_entries` (USD-era table), AND
 * - wallet does NOT already have a welcome-credit-like entry in `wallet_ledger`
 *
 * For each eligible wallet, we:
 * - add +200 to `wallets.balance`
 * - insert an `ADJUSTMENT` row into `wallet_ledger` with deterministic id (safe to rerun)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const welcomeCredits = 200;

    await client.query(
      `
      WITH eligible AS (
        SELECT
          w.id AS wallet_id,
          (w.balance::decimal) AS balance_before
        FROM wallets w
        WHERE w.currency = 'CREDITS'
          -- Heuristic: legacy wallets should have history in the pre-credits ledger table
          AND EXISTS (SELECT 1 FROM ledger_entries le WHERE le.wallet_id = w.id)
          -- Do not double-grant if a welcome credit already exists in the new ledger
          AND NOT EXISTS (
            SELECT 1
            FROM wallet_ledger wl
            WHERE wl.wallet_id = w.id
              AND wl.type = 'ADJUSTMENT'
              AND (wl.meta->>'reason') IN ('WELCOME_CREDIT', 'WELCOME_CREDIT_BACKFILL', 'WELCOME_CREDIT_MIGRATION_048')
          )
      ),
      inserted AS (
        INSERT INTO wallet_ledger (
          id,
          wallet_id,
          type,
          amount,
          balance_after,
          meta,
          created_at
        )
        SELECT
          ('welcome-credit-migration-048-' || e.wallet_id) AS id,
          e.wallet_id,
          'ADJUSTMENT' AS type,
          $1::decimal AS amount,
          (e.balance_before + $1::decimal) AS balance_after,
          jsonb_build_object(
            'reason', 'WELCOME_CREDIT_MIGRATION_048',
            'source', 'MIGRATION_048',
            'initialCredits', $1::decimal
          ) AS meta,
          NOW() AS created_at
        FROM eligible e
        ON CONFLICT (id) DO NOTHING
        RETURNING wallet_id
      )
      UPDATE wallets w
         SET balance = (w.balance::decimal + $1::decimal),
             updated_at = NOW()
        FROM inserted i
       WHERE w.id = i.wallet_id
      `,
      [welcomeCredits]
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
    const welcomeCredits = 200;

    await client.query(
      `
      WITH deleted AS (
        DELETE FROM wallet_ledger
        WHERE id LIKE 'welcome-credit-migration-048-%'
        RETURNING wallet_id
      )
      UPDATE wallets w
         SET balance = (w.balance::decimal - $1::decimal),
             updated_at = NOW()
        FROM (SELECT DISTINCT wallet_id FROM deleted) d
       WHERE w.id = d.wallet_id
      `,
      [welcomeCredits]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
