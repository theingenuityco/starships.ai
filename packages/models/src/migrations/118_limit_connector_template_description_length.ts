import type { Client } from 'pg';

/**
 * Limit connector template description length at the DB level.
 *
 * - Trims any existing connector_templates.description values to 120 chars
 * - Adds a CHECK constraint so future writes cannot exceed 120 chars
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Trim existing rows to avoid constraint violations.
    await client.query(`
      UPDATE connector_templates
      SET
        description = LEFT(description, 120),
        updated_at = NOW()
      WHERE char_length(description) > 120
    `);

    // Enforce at DB level (keep column type as TEXT; apply explicit constraint).
    await client.query(`
      ALTER TABLE connector_templates
      DROP CONSTRAINT IF EXISTS connector_templates_description_length_check
    `);
    await client.query(`
      ALTER TABLE connector_templates
      ADD CONSTRAINT connector_templates_description_length_check
      CHECK (char_length(description) <= 120)
    `);

    // Fail fast if anything still violates the constraint.
    await client.query(`
      DO $$
      DECLARE
        bad_count INT;
      BEGIN
        SELECT COUNT(*) INTO bad_count
        FROM connector_templates
        WHERE char_length(description) > 120;

        IF bad_count > 0 THEN
          RAISE EXCEPTION 'connector_templates.description length constraint failed: % rows still > 120 chars', bad_count;
        END IF;
      END $$;
    `);

    await client.query('COMMIT');
    console.log('✅ Limited connector_templates.description to 120 chars (DB constraint applied)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to limit connector_templates.description length:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE connector_templates
      DROP CONSTRAINT IF EXISTS connector_templates_description_length_check
    `);

    await client.query('COMMIT');
    console.log('✅ Removed connector_templates.description length constraint');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to remove connector_templates.description length constraint:', error);
    throw error;
  }
}

