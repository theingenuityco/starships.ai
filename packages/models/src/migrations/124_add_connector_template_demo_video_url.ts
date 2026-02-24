import type { Client } from 'pg';

/**
 * Migration 124: Add optional demo_video_url column to connector_templates.
 *
 * This stores an optional per-connector demo video URL (e.g. YouTube)
 * used by the client to render education videos in the Connect Apps step.
 */
export async function up(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE connector_templates
    ADD COLUMN IF NOT EXISTS demo_video_url TEXT
  `);
}

export async function down(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE connector_templates
    DROP COLUMN IF EXISTS demo_video_url
  `);
}

