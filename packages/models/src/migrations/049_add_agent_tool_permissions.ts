import type { Client } from 'pg';

/**
 * Migration 049: Add permission column to agent_tools join table
 *
 * Adds a tri-state permission for agent→tool triggering:
 * - allow: tool can be invoked
 * - ask: tool can be invoked but requires confirmation (UI-level for now)
 * - deny: tool cannot be invoked
 *
 * Notes:
 * - Default is 'allow' for existing relationships to preserve current behavior.
 * - We keep this as a plain VARCHAR + CHECK to avoid enum migration pain.
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE agent_tools
      ADD COLUMN IF NOT EXISTS permission VARCHAR(10) NOT NULL DEFAULT 'allow'
      CHECK (permission IN ('allow', 'ask', 'deny'));
  `;
  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE agent_tools
      DROP COLUMN IF EXISTS permission;
  `;
  await client.query(sql);
}
