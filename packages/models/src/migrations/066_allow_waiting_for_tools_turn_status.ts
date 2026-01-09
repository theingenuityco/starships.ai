import type { Client } from 'pg';

/**
 * Migration 066: Allow waiting_for_tools turn status.
 *
 * This enables server-authoritative snapshot state during tool approval flows
 * (turn is paused awaiting user approval).
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE turns
      DROP CONSTRAINT IF EXISTS turns_status_check;

    ALTER TABLE turns
      ADD CONSTRAINT turns_status_check
      CHECK (status IN ('active', 'waiting_for_tools', 'completed', 'cancelled', 'failed'));
  `;
  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE turns
      DROP CONSTRAINT IF EXISTS turns_status_check;

    ALTER TABLE turns
      ADD CONSTRAINT turns_status_check
      CHECK (status IN ('active', 'completed', 'cancelled', 'failed'));
  `;
  await client.query(sql);
}

