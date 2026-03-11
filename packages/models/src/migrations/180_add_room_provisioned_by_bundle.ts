import type { Client } from 'pg';

/**
 * Migration 180: Add provisioned_by_bundle column to rooms.
 *
 * This column tracks which rooms were provisioned by a specific bundle
 * (e.g. "lead-generation"), so that frontend and backend logic can
 * distinguish bundle-created rooms from user-created rooms that happen
 * to share the same slug.
 */
export async function up(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS provisioned_by_bundle TEXT NULL
  `);
}

export async function down(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE rooms
    DROP COLUMN IF EXISTS provisioned_by_bundle
  `);
}

