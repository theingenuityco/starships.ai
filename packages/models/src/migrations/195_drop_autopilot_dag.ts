import type { Client } from 'pg';

/**
 * Migration 195: Drop the autopilot DAG engine's residual schema.
 *
 * The `@starships/autopilot` DAG engine and event-triggered automations were
 * removed; agents now run via the code-native loop (@starships/autopilot-cli).
 * This drops what they left behind:
 *   - the automation/await tables (`autopilot_await_firings`, `autopilot_awaits`)
 *   - the per-row DAG blueprints (`tools.blueprint`, `agents.blueprint`)
 *
 * Destructive and irreversible for data: any await checkpoints and stored
 * blueprints are discarded. `down()` recreates the structures empty.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Firings reference awaits (ON DELETE CASCADE), so drop firings first.
    await client.query(`DROP TABLE IF EXISTS autopilot_await_firings`);
    await client.query(`DROP TABLE IF EXISTS autopilot_awaits`);

    await client.query(`ALTER TABLE tools DROP COLUMN IF EXISTS blueprint`);
    await client.query(`ALTER TABLE agents DROP COLUMN IF EXISTS blueprint`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Recreate the blueprint columns (empty/nullable; original DAGs are gone).
    await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS blueprint JSONB`);
    await client.query(`ALTER TABLE tools ADD COLUMN IF NOT EXISTS blueprint JSONB`);

    // Recreate the await tables (structure only; original rows are gone).
    await client.query(`
      CREATE TABLE IF NOT EXISTS autopilot_awaits (
        id TEXT PRIMARY KEY,
        starship_id TEXT NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','resuming','completed','cancelled','failed')),
        spec_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        blueprint_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        execution_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        state_json JSONB,
        expires_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_autopilot_awaits_starship_status
        ON autopilot_awaits(starship_id, status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_autopilot_awaits_status_expires
        ON autopilot_awaits(status, expires_at)
        WHERE status = 'waiting' AND expires_at IS NOT NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS autopilot_await_firings (
        id TEXT PRIMARY KEY,
        await_id TEXT NOT NULL REFERENCES autopilot_awaits(id) ON DELETE CASCADE,
        connector_event_id TEXT NOT NULL REFERENCES connector_events(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
        run_request_id TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_autopilot_await_firings_await_event
        ON autopilot_await_firings(await_id, connector_event_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_autopilot_await_firings_await_status
        ON autopilot_await_firings(await_id, status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_autopilot_await_firings_status
        ON autopilot_await_firings(status, created_at DESC)
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
