import type { Client } from 'pg';

/**
 * Migration 163: Add room-level tool permissions
 *
 * Adds a tri-state permission to room tool pins so rooms can override starship defaults.
 *
 * Effective precedence (implemented in code):
 * - agent_tools.permission (agent override)
 * - room_tools.permission (room override)
 * - starship_tools.permission (starship default)
 * - else null (no access)
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE room_tools
      ADD COLUMN IF NOT EXISTS permission VARCHAR(10) NOT NULL DEFAULT 'allow'
      CHECK (permission IN ('allow', 'ask', 'deny'));

    CREATE INDEX IF NOT EXISTS idx_room_tools_room_permission ON room_tools(room_conversation_id, permission);
  `;
  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    DROP INDEX IF EXISTS idx_room_tools_room_permission;
    ALTER TABLE room_tools DROP COLUMN IF EXISTS permission;
  `;
  await client.query(sql);
}

