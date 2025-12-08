import type { Client } from 'pg';

/**
 * Migration: Add schedules table
 *
 * Stores scheduled agent runs that materialize as new conversations.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        cron_expression VARCHAR(255) NOT NULL,
        timezone VARCHAR(255) NOT NULL,
        next_run_at TIMESTAMPTZ NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_run_at TIMESTAMPTZ NULL,
        last_run_conversation_id VARCHAR(255) NULL REFERENCES conversations(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_schedules_active_next_run_at
        ON schedules (is_active, next_run_at);

      CREATE INDEX IF NOT EXISTS idx_schedules_starship_id
        ON schedules (starship_id);
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('DROP TABLE IF EXISTS schedules CASCADE');
}


