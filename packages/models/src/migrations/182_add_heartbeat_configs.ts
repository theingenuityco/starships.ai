import type { Client } from 'pg';

/**
 * Migration 182: Add heartbeat_configs and heartbeat_runs tables.
 *
 * heartbeat_configs stores per-room-agent heartbeat configuration (interval,
 * prompt, active hours, scheduling state). One optional row per (agent, room)
 * pair; missing rows mean heartbeat is disabled for that combination.
 *
 * heartbeat_runs is an audit log of individual heartbeat executions for
 * observability and debugging.
 */
export async function up(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS heartbeat_configs (
      id                    VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      agent_id              VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      room_conversation_id  VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      starship_id           VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
      owner_user_id         VARCHAR(255) NOT NULL,
      is_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
      interval_minutes      INTEGER NOT NULL DEFAULT 30,
      prompt                TEXT NOT NULL DEFAULT 'Check if everything is running smoothly. If all is well, reply HEARTBEAT_OK. Otherwise, describe any issues.',
      ack_max_chars         INTEGER NOT NULL DEFAULT 300,
      active_hours_start    VARCHAR(5) NULL,
      active_hours_end      VARCHAR(5) NULL,
      active_hours_timezone VARCHAR(100) NULL,
      last_run_at           TIMESTAMP WITH TIME ZONE NULL,
      next_run_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      last_run_status       VARCHAR(50) NULL,
      last_conversation_id  VARCHAR(255) NULL,
      last_alert_text       TEXT NULL,
      last_alert_at         TIMESTAMP WITH TIME ZONE NULL,
      created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_heartbeat_configs_agent_room UNIQUE (agent_id, room_conversation_id)
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_starship_id ON heartbeat_configs(starship_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_room ON heartbeat_configs(room_conversation_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_due ON heartbeat_configs(is_enabled, next_run_at) WHERE is_enabled = TRUE`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS heartbeat_runs (
      id                  VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      heartbeat_config_id VARCHAR(255) NOT NULL REFERENCES heartbeat_configs(id) ON DELETE CASCADE,
      agent_id            VARCHAR(255) NOT NULL,
      starship_id         VARCHAR(255) NOT NULL,
      status              VARCHAR(50) NOT NULL,
      result              VARCHAR(100) NULL,
      duration_ms         INTEGER NULL,
      conversation_id     VARCHAR(255) NULL,
      started_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      completed_at        TIMESTAMP WITH TIME ZONE NULL
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_config_id ON heartbeat_runs(heartbeat_config_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_started_at ON heartbeat_runs(started_at DESC)`);
}

export async function down(client: Client): Promise<void> {
  await client.query(`DROP TABLE IF EXISTS heartbeat_runs`);
  await client.query(`DROP TABLE IF EXISTS heartbeat_configs`);
}
