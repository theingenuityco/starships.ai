import type { Client } from 'pg';

/**
 * Migration 164: Room tools become unordered assignments (not pins)
 *
 * Reshapes `room_tools` away from pin semantics (position/order/created_by) to align with
 * starship-level tool assignments.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Drop pin-only unique index first (if present) so we can drop `position`.
    await client.query(`DROP INDEX IF EXISTS uq_room_tools_room_position;`);

    // Add updated_at for symmetry with other join tables and to track permission changes.
    await client.query(`
      ALTER TABLE room_tools
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    `);

    // Backfill updated_at if it existed but was nullable in a previous schema.
    await client.query(`
      UPDATE room_tools
         SET updated_at = COALESCE(updated_at, created_at, NOW());
    `);

    // Remove pin-only columns.
    await client.query(`
      ALTER TABLE room_tools
        DROP COLUMN IF EXISTS position,
        DROP COLUMN IF EXISTS created_by;
    `);

    // Index to support listing/filtering by permission remains (added in 163).
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Re-introduce pin columns (best-effort). Ordering data cannot be reconstructed.
    await client.query(`
      ALTER TABLE room_tools
        ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) NULL;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_room_tools_room_position ON room_tools(room_conversation_id, position);
    `);
    await client.query(`
      ALTER TABLE room_tools
        DROP COLUMN IF EXISTS updated_at;
    `);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

