import type { Client } from 'pg';

/**
 * Migration 076: Add optional starship profile fields (description + website_url)
 *
 * Adds:
 * - starships.description TEXT NOT NULL DEFAULT ''
 * - starships.website_url TEXT NULL
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE starships
        ADD COLUMN IF NOT EXISTS description TEXT;
    `);

    await client.query(`
      ALTER TABLE starships
        ADD COLUMN IF NOT EXISTS website_url TEXT;
    `);

    // Ensure description is always present (required field)
    await client.query(`UPDATE starships SET description = '' WHERE description IS NULL;`);
    await client.query(`ALTER TABLE starships ALTER COLUMN description SET DEFAULT '';`);
    await client.query(`ALTER TABLE starships ALTER COLUMN description SET NOT NULL;`);

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
      ALTER TABLE starships
        DROP COLUMN IF EXISTS website_url;
    `);

    await client.query(`
      ALTER TABLE starships
        DROP COLUMN IF EXISTS description;
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
