import type { Client } from 'pg';

/**
 * Extend connector providers to include google_drive.
 *
 * The original connectors table (008_add_starship_connectors) defined a CHECK
 * constraint limiting provider to ('linkedin', 'discord'). This migration
 * updates that constraint to also allow 'google_drive'.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Drop the old CHECK constraint if it exists and recreate it with google_drive
    await client.query(`
      ALTER TABLE connectors
      DROP CONSTRAINT IF EXISTS connectors_provider_check
    `);

    await client.query(`
      ALTER TABLE connectors
      ADD CONSTRAINT connectors_provider_check
      CHECK (provider IN ('linkedin', 'discord', 'google_drive'))
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
    // Revert to the original constraint that only allowed linkedin and discord
    await client.query(`
      ALTER TABLE connectors
      DROP CONSTRAINT IF EXISTS connectors_provider_check
    `);

    await client.query(`
      ALTER TABLE connectors
      ADD CONSTRAINT connectors_provider_check
      CHECK (provider IN ('linkedin', 'discord'))
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}


