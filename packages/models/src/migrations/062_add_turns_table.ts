import type { Client } from 'pg';

/**
 * Migration 062: Introduce turns table + turn-scoped message idempotency.
 *
 * - Adds `turns` table (1 conversation -> many turns)
 * - Adds `messages.turn_id` + `messages.turn_seq`
 * - Enforces idempotency for new writes via:
 *   - UNIQUE constraint on (turn_id, turn_seq) (NULLs allowed and do not conflict)
 *   - UNIQUE(conversation_id, tool_call_id) for tool messages (partial index)
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

    -- ------------------------------------------------------------------------
    -- Data cleanup: existing installations may already have duplicate tool result rows
    -- for the same (conversation_id, tool_call_id). We must dedupe before adding uniqueness.
    -- Keep the newest row and delete older duplicates.
    -- ------------------------------------------------------------------------
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY conversation_id, tool_call_id
          ORDER BY created_at DESC, id DESC
        ) AS rn
      FROM messages
      WHERE tool_call_id IS NOT NULL
        AND role = 'tool'
    )
    DELETE FROM messages m
    USING ranked r
    WHERE m.id = r.id
      AND r.rn > 1;

    -- Prevent duplicate tool result messages by tool_call_id within a conversation (tool messages only)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_tool_call_id_unique
      ON messages(conversation_id, tool_call_id)
      WHERE tool_call_id IS NOT NULL AND role = 'tool';

    -- ------------------------------------------------------------------------
    -- Turn-scoped idempotency: one message per (turn_id, turn_seq)
    --
    -- Postgres cannot always infer partial unique indexes for ON CONFLICT(column_list).
    -- Use a real UNIQUE constraint so callers can reliably use:
    --   ON CONFLICT ON CONSTRAINT uq_messages_turn_id_turn_seq
    -- ------------------------------------------------------------------------

    -- Defensive dedupe (should be a no-op on fresh installs)
    WITH ranked_turn AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY turn_id, turn_seq
          ORDER BY created_at DESC, id DESC
        ) AS rn
      FROM messages
      WHERE turn_id IS NOT NULL AND turn_seq IS NOT NULL
    )
    DELETE FROM messages m
    USING ranked_turn r
    WHERE m.id = r.id
      AND r.rn > 1;

    -- Drop any prior partial index (if present) before adding the constraint
    DROP INDEX IF EXISTS idx_messages_turn_id_turn_seq_unique;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_messages_turn_id_turn_seq'
      ) THEN
        ALTER TABLE messages
          ADD CONSTRAINT uq_messages_turn_id_turn_seq UNIQUE (turn_id, turn_seq);
      END IF;
    END $$;
  `;
  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS uq_messages_turn_id_turn_seq;
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
