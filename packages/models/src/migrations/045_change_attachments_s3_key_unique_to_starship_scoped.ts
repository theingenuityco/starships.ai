import type { Client } from 'pg';

/**
 * Migration 045: Scope attachment S3 key uniqueness to starship
 *
 * Prior schema enforced global uniqueness on attachments.s3_key.
 * That prevents reusing the same underlying S3 object across starships (e.g. templated assets).
 *
 * New schema enforces uniqueness on (starship_id, s3_key) instead.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Drop the prior global unique constraint (and its backing index).
    // Default name from migration 007 is `attachments_s3_key_key`.
    await client.query(`ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_s3_key_key`);

    // Add starship-scoped uniqueness.
    await client.query(
      `ALTER TABLE attachments
       ADD CONSTRAINT attachments_starship_id_s3_key_key UNIQUE (starship_id, s3_key)`
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_starship_id_s3_key_key`);

    // Restore global uniqueness (may fail if duplicates exist across starships).
    await client.query(
      `ALTER TABLE attachments
       ADD CONSTRAINT attachments_s3_key_key UNIQUE (s3_key)`
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
