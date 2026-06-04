import type { Client } from 'pg';

/**
 * Migration 194: Allow tool approvals that are not backed by a `tools` row.
 *
 * The code-native CLI agent (@starships/autopilot-cli) runs system tools and
 * connector actions that are NOT rows in the `tools` table, so an ask-first
 * approval for one cannot carry a `tool_id`. This makes `tool_id` nullable and
 * adds a free-text `tool_name` (the system-tool/connector-action name) so the
 * UI and resume logic can identify the call without a tools-table FK.
 *
 * Additive and backward compatible: existing blueprint approvals keep their
 * tool_id; CLI approvals set tool_name and leave tool_id null.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`ALTER TABLE tool_call_approvals ALTER COLUMN tool_id DROP NOT NULL;`);
    await client.query(`ALTER TABLE tool_call_approvals ADD COLUMN IF NOT EXISTS tool_name VARCHAR(255);`);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`ALTER TABLE tool_call_approvals DROP COLUMN IF EXISTS tool_name;`);
    // tool_id is intentionally left nullable: rows created by the CLI agent have
    // no tool_id, so restoring NOT NULL could fail. This is a safe no-op revert.
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}
