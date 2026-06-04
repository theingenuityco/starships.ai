import type { Client } from 'pg';

/**
 * Migration 196: Drop the "tools" product abstraction.
 *
 * Agents now act through connector actions (search_actions / run_action) on the
 * code-native CLI loop; the legacy tools data model is fully removed. This drops:
 *   - the per-starship tool instances (`tools`)
 *   - the assignment/permission junctions (`agent_tools`, `starship_tools`, `room_tools`)
 *
 * The tool-call approvals system is KEPT. `tool_call_approvals` previously had a
 * `tool_id -> tools(id)` FK; we drop only that constraint so the table can stand
 * on its own. The `tool_id` and `tool_slug` columns are intentionally retained
 * (nullable/orphaned) — the live CLI approval path uses `tool_name`.
 *
 * The template/catalog tables (`tool_templates`, `agent_template_tool_templates`)
 * were already dropped by migration 183 and are not touched here.
 *
 * Destructive and irreversible for data: all tool instances and their
 * assignments are discarded. `down()` is a no-op.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // 1. Drop the approvals -> tools FK (keep the columns). The constraint name
    //    is environment-stable but resolve it dynamically to be safe.
    await client.query(`
      DO $$
      DECLARE
        fk_name text;
      BEGIN
        SELECT con.conname INTO fk_name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'tool_call_approvals'
          AND con.contype = 'f'
          AND 'tool_id' = ANY (
            SELECT a.attname
            FROM pg_attribute a
            WHERE a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
          );
        IF fk_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE tool_call_approvals DROP CONSTRAINT %I', fk_name);
        END IF;
      END $$;
    `);

    // 2. Drop the junction tables (children reference tools ON DELETE CASCADE).
    await client.query(`DROP TABLE IF EXISTS agent_tools`);
    await client.query(`DROP TABLE IF EXISTS starship_tools`);
    await client.query(`DROP TABLE IF EXISTS room_tools`);

    // 3. Drop the tools table itself.
    await client.query(`DROP TABLE IF EXISTS tools`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(): Promise<void> {
  // No-op: this removal is destructive and irreversible. The tools tables and
  // their data are gone for good; there is nothing meaningful to recreate.
}
