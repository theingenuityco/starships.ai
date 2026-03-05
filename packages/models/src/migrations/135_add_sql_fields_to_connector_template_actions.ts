import type { Client } from 'pg';

/**
 * Add SQL fields to connector_template_actions
 *
 * Enables non-HTTP connector actions (starting with native SQL for Postgres)
 * while remaining backwards compatible with existing HTTP actions.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE connector_template_actions
        ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'http',
        ADD COLUMN IF NOT EXISTS driver TEXT,
        ADD COLUMN IF NOT EXISTS sql_text TEXT,
        ADD COLUMN IF NOT EXISTS sql_mode TEXT,
        ADD COLUMN IF NOT EXISTS row_limit INT,
        ADD COLUMN IF NOT EXISTS read_only BOOLEAN
    `);

    // Backfill kind for older rows (defensive; default already handles new inserts).
    await client.query(`UPDATE connector_template_actions SET kind = 'http' WHERE kind IS NULL`);

    // Add constraints for new fields.
    // Postgres does NOT support "ADD CONSTRAINT IF NOT EXISTS", so we guard manually.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_connector_template_actions_kind'
        ) THEN
          ALTER TABLE connector_template_actions
            ADD CONSTRAINT chk_connector_template_actions_kind
              CHECK (kind IN ('http','sql'));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_connector_template_actions_sql_mode'
        ) THEN
          ALTER TABLE connector_template_actions
            ADD CONSTRAINT chk_connector_template_actions_sql_mode
              CHECK (sql_mode IS NULL OR sql_mode IN ('query','execute'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_template_actions_template_kind
        ON connector_template_actions(template_id, kind)
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('DROP INDEX IF EXISTS idx_connector_template_actions_template_kind');
    await client.query('ALTER TABLE connector_template_actions DROP CONSTRAINT IF EXISTS chk_connector_template_actions_sql_mode');
    await client.query('ALTER TABLE connector_template_actions DROP CONSTRAINT IF EXISTS chk_connector_template_actions_kind');

    await client.query(`
      ALTER TABLE connector_template_actions
        DROP COLUMN IF EXISTS read_only,
        DROP COLUMN IF EXISTS row_limit,
        DROP COLUMN IF EXISTS sql_mode,
        DROP COLUMN IF EXISTS sql_text,
        DROP COLUMN IF EXISTS driver,
        DROP COLUMN IF EXISTS kind
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

