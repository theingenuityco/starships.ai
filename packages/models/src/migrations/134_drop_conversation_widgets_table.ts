type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

/**
 * Migration 134: Drop conversation_widgets table
 *
 * Inline widget rendering in conversations has been removed. This table is no longer used.
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // Drop table (indexes are dropped automatically, but this is safe if they exist independently)
    await client.query('DROP TABLE IF EXISTS conversation_widgets;');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

