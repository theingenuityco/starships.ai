import type { Client } from 'pg';

/**
 * Migration 062: Introduce turns table + turn-scoped message idempotency.
 *
 * - Adds `turns` table (1 conversation -> many turns)
 * - Adds `messages.turn_id` + `messages.turn_seq`
 * - Enforces idempotency for new writes via unique indexes:
 *   - UNIQUE(turn_id, turn_seq) (partial: only when both are non-null)
 *   - UNIQUE(conversation_id, tool_call_id) (partial: only when tool_call_id is non-null)
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    -- ------------------------------------------------------------------------
    -- Turns
    -- ------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS turns (
      id VARCHAR(255) PRIMARY KEY,
      conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
      started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE NULL,
      stop_reason VARCHAR(50) NULL,
      created_by_message_id VARCHAR(255) NULL REFERENCES messages(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_turns_conversation_id ON turns(conversation_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_turns_status ON turns(status, started_at DESC);

    -- ------------------------------------------------------------------------
    -- Messages: add turn linkage + per-turn sequencing
    -- ------------------------------------------------------------------------
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS turn_id VARCHAR(255) NULL REFERENCES turns(id) ON DELETE SET NULL;

    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS turn_seq INTEGER NULL;

    CREATE INDEX IF NOT EXISTS idx_messages_turn_id ON messages(turn_id, created_at DESC);

    -- Prevent duplicate tool result messages by tool_call_id within a conversation
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_tool_call_id_unique
      ON messages(conversation_id, tool_call_id)
      WHERE tool_call_id IS NOT NULL;

    -- Turn-scoped idempotency: one message per (turn_id, turn_seq)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_turn_id_turn_seq_unique
      ON messages(turn_id, turn_seq)
      WHERE turn_id IS NOT NULL AND turn_seq IS NOT NULL;
  `;
  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    DROP INDEX IF EXISTS idx_messages_turn_id_turn_seq_unique;
    DROP INDEX IF EXISTS idx_messages_conversation_tool_call_id_unique;
    DROP INDEX IF EXISTS idx_messages_turn_id;

    ALTER TABLE messages DROP COLUMN IF EXISTS turn_seq;
    ALTER TABLE messages DROP COLUMN IF EXISTS turn_id;

    DROP INDEX IF EXISTS idx_turns_status;
    DROP INDEX IF EXISTS idx_turns_conversation_id;
    DROP TABLE IF EXISTS turns;
  `;
  await client.query(sql);
}


