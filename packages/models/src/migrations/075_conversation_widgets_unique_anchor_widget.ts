type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

/**
 * Migration 075: Prevent duplicate widget associations per anchor message.
 *
 * Ensures we can't associate the same widget multiple times to the same anchor message,
 * which otherwise can lead to duplicate renders (same widget id) and React key collisions.
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_widgets_conversation_anchor_widget
      ON conversation_widgets(conversation_id, anchor_message_id, widget_id)
      WHERE anchor_message_id IS NOT NULL;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
