import type { Client } from 'pg';

/**
 * Migration 198: Agent heartbeats.
 *
 * Adds recurring, per-agent heartbeats around the dispatch loop. Each enabled
 * heartbeat fires every `interval_seconds`, creating an `agent_dispatches` row
 * carrying a user-authored command + payload that the agent picks up on its
 * next `pull_commands`.
 *
 *  - new table `agent_heartbeats`
 *  - new nullable `heartbeat_id` column on `agent_dispatches` so the scheduler
 *    can coalesce (skip firing while a prior beat is still pending)
 *
 * down() is a no-op (forward-only, matching the rest of the chain).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_heartbeats (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        name VARCHAR(255),
        command_type VARCHAR(64) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        interval_seconds INTEGER NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        last_fired_at TIMESTAMP WITH TIME ZONE,
        next_fire_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_by_user_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_agent ON agent_heartbeats(agent_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_starship ON agent_heartbeats(starship_id)`);
    // Partial index drives the scheduler's due-scan.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_due ON agent_heartbeats(next_fire_at) WHERE enabled`);

    // Link dispatches back to the heartbeat that produced them (coalesce guard).
    await client.query(`ALTER TABLE agent_dispatches ADD COLUMN IF NOT EXISTS heartbeat_id VARCHAR(255)`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_agent_dispatches_heartbeat ON agent_dispatches(heartbeat_id, ack_status) WHERE heartbeat_id IS NOT NULL`
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(): Promise<void> {
  // No-op: forward-only.
}
