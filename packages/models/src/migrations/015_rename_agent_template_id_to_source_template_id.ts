import type { Client } from 'pg';

/**
 * Migration 015: Rename agents.template_id → source_template_id
 *
 * Goal:
 * - Clarify semantics of the agent's source template link.
 *
 * Notes:
 * - This only affects agents; tool templateId remains unchanged.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Rename column if it exists and source_template_id does not already exist
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'agents' AND column_name = 'template_id'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'agents' AND column_name = 'source_template_id'
        ) THEN
          ALTER TABLE agents RENAME COLUMN template_id TO source_template_id;
        END IF;
      END
      $$;
    `);

    // -- Optionally rename index for clarity; index definition follows column rename automatically
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_class
          WHERE relname = 'idx_agents_template_id'
        ) THEN
          ALTER INDEX idx_agents_template_id RENAME TO idx_agents_source_template_id;
        END IF;
      END
      $$;
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
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'agents' AND column_name = 'source_template_id'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'agents' AND column_name = 'template_id'
        ) THEN
          ALTER TABLE agents RENAME COLUMN source_template_id TO template_id;
        END IF;
      END
      $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_class
          WHERE relname = 'idx_agents_source_template_id'
        ) THEN
          ALTER INDEX idx_agents_source_template_id RENAME TO idx_agents_template_id;
        END IF;
      END
      $$;
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
