import type { PoolClient } from 'pg';

/**
 * Migration 190: Remove credits system tables and billing columns.
 *
 * Drops the wallet/ledger/topup infrastructure that enforced usage limits.
 * The `usage` table is kept intact for analytics — only billing-specific
 * columns (billed_at, billed_ledger_id) are removed from it.
 */
export async function up(client: PoolClient): Promise<void> {
  // 1. Drop billing-only columns from usage before dropping ledger_entries
  await client.query(`ALTER TABLE usage DROP COLUMN IF EXISTS billed_ledger_id`);
  await client.query(`ALTER TABLE usage DROP COLUMN IF EXISTS billed_at`);

  // 2. Drop the newer wallet_ledger table (created in migration 046)
  await client.query(`DROP TABLE IF EXISTS wallet_ledger CASCADE`);

  // 3. Drop the legacy ledger_entries table
  await client.query(`DROP TABLE IF EXISTS ledger_entries CASCADE`);

  // 4. Drop topups (payment records)
  await client.query(`DROP TABLE IF EXISTS topups CASCADE`);

  // 5. Drop wallets (balance store)
  await client.query(`DROP TABLE IF EXISTS wallets CASCADE`);

  // 6. Drop promo redemption records (rewards were tied to wallet credits)
  await client.query(`DROP TABLE IF EXISTS promo_redemptions CASCADE`);
}

export async function down(client: PoolClient): Promise<void> {
  // Recreate wallets
  await client.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      starship_id VARCHAR(255) NOT NULL UNIQUE REFERENCES starships(id) ON DELETE CASCADE,
      currency VARCHAR(10) NOT NULL DEFAULT 'CREDITS',
      balance DECIMAL(18,6) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Recreate topups
  await client.query(`
    CREATE TABLE IF NOT EXISTS topups (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      wallet_id VARCHAR(255) NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      amount_usd DECIMAL(18,4) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      stripe_session_id VARCHAR(255),
      stripe_payment_intent VARCHAR(255),
      stripe_charge_id VARCHAR(255),
      credits_granted DECIMAL(18,6),
      idempotency_key VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Recreate ledger_entries
  await client.query(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      wallet_id VARCHAR(255) NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL,
      amount DECIMAL(18,6) NOT NULL,
      balance_after DECIMAL(18,6) NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Recreate wallet_ledger
  await client.query(`
    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      wallet_id VARCHAR(255) NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL,
      amount DECIMAL(18,6) NOT NULL,
      balance_after DECIMAL(18,6) NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Restore billing columns to usage
  await client.query(`ALTER TABLE usage ADD COLUMN IF NOT EXISTS billed_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE usage ADD COLUMN IF NOT EXISTS billed_ledger_id VARCHAR(255)`);

  // Recreate promo_redemptions
  await client.query(`
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
      promo_code VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'success',
      reward_amount DECIMAL(18,6),
      stripe_coupon_id VARCHAR(255),
      stripe_promotion_id VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
