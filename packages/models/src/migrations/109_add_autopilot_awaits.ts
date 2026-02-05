import type { Client } from 'pg';

/**
 * Autopilot Awaits
 *
 * Durable checkpoint records for headless "await" semantics.
 * A workflow emits an await request, the host persists an await row, and execution ends.
 * Later, when a matching connector_event arrives, the server resumes by starting a new
 * execution using the stored blueprint + persisted state snapshot.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS autopilot_awaits (
        id TEXT PRIMARY KEY,
        starship_id TEXT NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','resuming','completed','cancelled','failed')),
        spec_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        blueprint_json JSONB NOT NULL DEFAULT '{}'::jsonb,
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

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP TABLE IF EXISTS autopilot_awaits`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

