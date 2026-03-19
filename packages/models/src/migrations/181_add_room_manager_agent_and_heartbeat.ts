import type { Client } from 'pg';

/**
 * Migration 181: Add room manager agent + heartbeat.
 *
 * - manager_agent_id: room-scoped default/fallback agent (nullable)
 * - manager_agent_heartbeat_at: last-seen timestamp for the manager agent (nullable)
 *
 * Notes:
 * - Heartbeat is updated by runtime execution, not by room edits; do not bump rooms.updated_at.
 * - FK is SET NULL on agent delete.
 */
export async function up(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS manager_agent_id VARCHAR(255) NULL REFERENCES agents(id) ON DELETE SET NULL
  `);

  await client.query(`
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS manager_agent_heartbeat_at TIMESTAMP WITH TIME ZONE NULL
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_rooms_manager_agent_id ON rooms(manager_agent_id);`);
}

export async function down(client: Client): Promise<void> {
  await client.query(`DROP INDEX IF EXISTS idx_rooms_manager_agent_id;`);
  await client.query(`
    ALTER TABLE rooms
    DROP COLUMN IF EXISTS manager_agent_heartbeat_at
  `);
  await client.query(`
    ALTER TABLE rooms
    DROP COLUMN IF EXISTS manager_agent_id
  `);
}

