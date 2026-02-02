import type { Client } from 'pg';

/**
 * Migration 099: Add starship-level tool permissions
 *
 * Adds a starship↔tool join table that defines default permissions for tools
 * available to ALL agents in a starship at runtime.
 *
 * Effective permission precedence (enforced in code):
 * - agent_tools.permission (agent override) wins if present
 * - else starship_tools.permission (starship default)
 * - else null (no access)
 *
 * Notes:
 * - We use VARCHAR + CHECK (matching agent_tools) to avoid enum migration churn.
 * - starship_tools references tools(id); tools are already scoped to starship_id.
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS starship_tools (
      starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
      tool_id VARCHAR(255) NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
      permission VARCHAR(10) NOT NULL DEFAULT 'ask'
        CHECK (permission IN ('allow', 'ask', 'deny')),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (starship_id, tool_id)
    );

    CREATE INDEX IF NOT EXISTS idx_starship_tools_starship_id ON starship_tools(starship_id);
    CREATE INDEX IF NOT EXISTS idx_starship_tools_tool_id ON starship_tools(tool_id);
    CREATE INDEX IF NOT EXISTS idx_starship_tools_starship_permission ON starship_tools(starship_id, permission);
  `;

  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    DROP TABLE IF EXISTS starship_tools;
  `;
  await client.query(sql);
}
