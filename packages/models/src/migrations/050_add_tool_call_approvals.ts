import type { Client } from 'pg';

/**
 * Migration 050: Tool call approvals
 *
 * Stores ask-first tool approvals so the UI can approve/deny and the server can
 * resume execution deterministically.
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS tool_call_approvals (
      id VARCHAR(255) PRIMARY KEY,
      starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
      conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      tool_slug VARCHAR(100) NOT NULL,
      tool_call_id VARCHAR(255) NOT NULL,
      args_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMP WITH TIME ZONE NULL,

      UNIQUE(conversation_id, tool_call_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tool_call_approvals_conversation
      ON tool_call_approvals(conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tool_call_approvals_starship
      ON tool_call_approvals(starship_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tool_call_approvals_status
      ON tool_call_approvals(status, created_at DESC);
  `;
  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    DROP TABLE IF EXISTS tool_call_approvals;
  `;
  await client.query(sql);
}


