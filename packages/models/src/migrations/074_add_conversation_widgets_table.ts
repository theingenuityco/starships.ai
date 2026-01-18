type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

/**
 * Migration 074: Add conversation_widgets table
 *
 * Persists "rendered widget" associations so widgets can be replayed across reloads
 * and anchored to an existing message within a turn.
 *
 * We intentionally persist widgets (not generic ui_actions) because many ui_actions
 * are ephemeral (toasts, highlights) and should not be durable by default.
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_widgets (
        id TEXT PRIMARY KEY,
        starship_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        widget_id TEXT NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
        turn_id TEXT REFERENCES turns(id) ON DELETE SET NULL,
        anchor_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
        tool_call_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_widgets_conversation_id ON conversation_widgets(conversation_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_widgets_turn_id ON conversation_widgets(turn_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_widgets_widget_id ON conversation_widgets(widget_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversation_widgets_anchor_message_id ON conversation_widgets(anchor_message_id);`);

    // Prevent duplicates when the same tool call is retried/replayed.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_widgets_conversation_tool_call
      ON conversation_widgets(conversation_id, tool_call_id)
      WHERE tool_call_id IS NOT NULL;
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
