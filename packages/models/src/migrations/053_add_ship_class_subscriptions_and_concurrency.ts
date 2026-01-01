import type { Client } from 'pg';

/**
 * Migration 053: Ship classes (scout/frigate), per-starship concurrency, subscriptions, and retroactive Scout downgrade.
 *
 * Adds:
 * - starships.ship_class ('scout' | 'frigate') default 'scout'
 * - starships.max_concurrent_turns default 1
 * - starships.max_agents default 5 (Scout limit)
 * - starship_subscriptions table (Stripe subscription ↔ starship mapping)
 * - starship_turn_leases table (DB-backed concurrency leases per starship)
 * - idempotency index for monthly credit grants keyed by Stripe invoice id in wallet_ledger meta
 *
 * Backfill:
 * - Retroactively downgrade all non-frigate starships to Scout entitlements WITHOUT deleting agents:
 *   max_agents = LEAST(max_agents, 5)
 *   max_concurrent_turns = 1
 *   ship_class = 'scout'
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // 1) Starship class + concurrency columns
    await client.query(`
      ALTER TABLE starships
        ADD COLUMN IF NOT EXISTS ship_class VARCHAR(20) NOT NULL DEFAULT 'scout' CHECK (ship_class IN ('scout','frigate'));
    `);

    await client.query(`
      ALTER TABLE starships
        ADD COLUMN IF NOT EXISTS max_concurrent_turns INTEGER NOT NULL DEFAULT 1;
    `);

    // Ensure Scout defaults for new starships
    await client.query(`
      ALTER TABLE starships
        ALTER COLUMN max_agents SET DEFAULT 5;
    `);

    // 2) Subscriptions mapping table (one active subscription per starship)
    await client.query(`
      CREATE TABLE IF NOT EXISTS starship_subscriptions (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stripe_customer_id VARCHAR(255) NOT NULL,
        stripe_subscription_id VARCHAR(255) NOT NULL,
        status VARCHAR(30) NOT NULL,
        current_period_start TIMESTAMP WITH TIME ZONE,
        current_period_end TIMESTAMP WITH TIME ZONE,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE(starship_id),
        UNIQUE(stripe_subscription_id)
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_starship_subscriptions_starship_id ON starship_subscriptions(starship_id)`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_starship_subscriptions_user_id ON starship_subscriptions(user_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_starship_subscriptions_status ON starship_subscriptions(status)`
    );

    // 3) DB-backed starship turn leases (for cross-replica concurrency limiting)
    await client.query(`
      CREATE TABLE IF NOT EXISTS starship_turn_leases (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        conversation_id VARCHAR(255),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_starship_turn_leases_starship_expires ON starship_turn_leases(starship_id, expires_at)`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_starship_turn_leases_expires_at ON starship_turn_leases(expires_at)`);

    // 4) Idempotency for subscription credit grants: one grant per (wallet, invoiceId)
    // wallet_ledger was introduced in migration 046.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_invoice_wallet_unique
      ON wallet_ledger (wallet_id, (meta->>'invoiceId'))
      WHERE type = 'ADJUSTMENT' AND (meta ? 'invoiceId');
    `);

    // 5) Retroactive downgrade for all non-frigate starships (do NOT delete agents)
    await client.query(`
      UPDATE starships
         SET ship_class = 'scout',
             max_agents = LEAST(max_agents, 5),
             max_concurrent_turns = 1,
             updated_at = NOW()
       WHERE ship_class IS DISTINCT FROM 'frigate';
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
    await client.query(`DROP INDEX IF EXISTS idx_wallet_ledger_invoice_wallet_unique`);
    await client.query(`DROP TABLE IF EXISTS starship_turn_leases`);
    await client.query(`DROP TABLE IF EXISTS starship_subscriptions`);

    // Best-effort reversal of schema additions.
    await client.query(`
      ALTER TABLE starships
        DROP COLUMN IF EXISTS max_concurrent_turns;
    `);
    await client.query(`
      ALTER TABLE starships
        DROP COLUMN IF EXISTS ship_class;
    `);
    // Revert default to previous schema default (historically 3 in 000 schema).
    await client.query(`
      ALTER TABLE starships
        ALTER COLUMN max_agents SET DEFAULT 3;
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}


