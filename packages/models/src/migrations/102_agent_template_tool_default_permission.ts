import type { Client } from 'pg';

/**
 * Migration 102: Add default_permission column to agent_template_tool_templates
 *
 * Stores the publisher's tool permission (allow/ask/deny) as the default when
 * users deploy the agent template from the marketplace.
 *
 * - allow: default to allow
 * - ask: default to ask first
 * - deny: default to deny
 *
 * Existing rows get 'ask'; no backfill needed.
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE agent_template_tool_templates
      ADD COLUMN IF NOT EXISTS default_permission VARCHAR(10) NOT NULL DEFAULT 'ask'
      CHECK (default_permission IN ('allow', 'ask', 'deny'));
  `;
  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE agent_template_tool_templates
      DROP COLUMN IF EXISTS default_permission;
  `;
  await client.query(sql);
}
