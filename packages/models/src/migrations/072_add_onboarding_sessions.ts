import type { Client } from 'pg';

/**
 * Migration 072: Add onboarding sessions
 *
 * Persists onboarding progress for the hybrid onboarding wizard.
 * Each user has at most one active session (primary key user_id).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS onboarding_sessions (
        user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        starship_id VARCHAR(255) REFERENCES starships(id) ON DELETE SET NULL,
        step VARCHAR(50) NOT NULL DEFAULT 'welcome',
        goals JSONB NOT NULL DEFAULT '[]'::jsonb,
        selected_connector_providers JSONB NOT NULL DEFAULT '[]'::jsonb,
        selected_agent_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        primary_agent_template_id VARCHAR(255),
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_starship_id ON onboarding_sessions(starship_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_completed_at ON onboarding_sessions(completed_at);
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
    await client.query('DROP TABLE IF EXISTS onboarding_sessions');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

