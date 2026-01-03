import type { Client } from 'pg';

/**
 * Migration 060: Tool call approvals reference tools by id (not slug)
 *
 * Why:
 * - Tool instance slugs are now regenerated and only unique per starship.
 * - Approvals must be stable across slug changes → reference tools by immutable id.
 *
 * Changes:
 * - Add tool_id FK to tools(id)
 * - Backfill tool_id by joining on (starship_id, tool_slug) → tools(starship_id, slug)
 * - Drop NOT NULL on tool_slug so new rows can omit it
 * - Enforce tool_id NOT NULL (after backfill) and index it
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE tool_call_approvals
        ADD COLUMN IF NOT EXISTS tool_id VARCHAR(255) REFERENCES tools(id) ON DELETE CASCADE;
    `);

    // Backfill where possible
    await client.query(`
      UPDATE tool_call_approvals tca
      SET tool_id = t.id
      FROM tools t
      WHERE tca.tool_id IS NULL
        AND tca.starship_id = t.starship_id
        AND tca.tool_slug = t.slug;
    `);

    // Any approvals we can't backfill are no longer actionable; delete them.
    await client.query(`
      DELETE FROM tool_call_approvals
      WHERE tool_id IS NULL;
    `);

    // Allow tool_slug to be optional going forward (we no longer rely on it as an identifier).
    await client.query(`
      ALTER TABLE tool_call_approvals
        ALTER COLUMN tool_slug DROP NOT NULL;
    `);

    // Enforce tool_id as required going forward.
    await client.query(`
      ALTER TABLE tool_call_approvals
        ALTER COLUMN tool_id SET NOT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tool_call_approvals_tool_id
      ON tool_call_approvals(tool_id);
    `);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Revert to slug-required schema (WARNING: new rows may have NULL tool_slug, so this may fail)
    await client.query(`DROP INDEX IF EXISTS idx_tool_call_approvals_tool_id;`);
    await client.query(`
      ALTER TABLE tool_call_approvals
        ALTER COLUMN tool_id DROP NOT NULL;
    `);
    await client.query(`
      ALTER TABLE tool_call_approvals
        ALTER COLUMN tool_slug SET NOT NULL;
    `);
    await client.query(`
      ALTER TABLE tool_call_approvals
        DROP COLUMN IF EXISTS tool_id;
    `);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}


