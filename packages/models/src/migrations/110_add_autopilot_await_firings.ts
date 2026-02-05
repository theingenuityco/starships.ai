import type { Client } from 'pg';

/**
 * Autopilot Await Firings
 *
 * Idempotency + auditing for resuming awaits from connector events.
 *
 * A firing row represents: (await_id, connector_event_id) → at most one resume attempt.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
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

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP TABLE IF EXISTS autopilot_await_firings`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

