import type { Client } from 'pg';

/**
 * Migration 125: Allow attaching a view to a channel.
 *
 * A channel can optionally reference a starship-scoped `views.id` so the UI can
 * offer a "pinned/attached view" experience per channel.
 *
 * NOTE: We enforce "same starship" in application logic (channels.starship_id vs views.starship_id).
 */
export async function up(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS attached_view_id VARCHAR(255) NULL REFERENCES views(id) ON DELETE SET NULL
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_channels_attached_view_id ON channels(attached_view_id)
  `);
}

export async function down(client: Client): Promise<void> {
  await client.query(`DROP INDEX IF EXISTS idx_channels_attached_view_id`);
  await client.query(`
    ALTER TABLE channels
    DROP COLUMN IF EXISTS attached_view_id
  `);
}

