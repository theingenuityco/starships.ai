import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS bundles (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('agent_bundle', 'room_bundle')),
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
      created_by_user_id TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS bundle_versions (
      id TEXT PRIMARY KEY,
      bundle_id TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
      version TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by_user_id TEXT NULL,
      source_starship_id TEXT NULL,
      source_starship_slug TEXT NULL,
      schema_version TEXT NOT NULL DEFAULT '1',
      bundle_hash TEXT NOT NULL,
      artifact_key TEXT NOT NULL,
      artifact_size BIGINT NOT NULL,
      artifact_sha256 TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      file_count INT NOT NULL DEFAULT 0,
      agents_count INT NOT NULL DEFAULT 0,
      tools_count INT NOT NULL DEFAULT 0,
      rooms_count INT NOT NULL DEFAULT 0,
      views_count INT NOT NULL DEFAULT 0,
      datasets_count INT NOT NULL DEFAULT 0,
      task_boards_count INT NOT NULL DEFAULT 0,
      UNIQUE (bundle_id, version)
    );
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_bundle_versions_bundle_id ON bundle_versions(bundle_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_bundle_versions_content_sha256 ON bundle_versions(content_sha256);`);
}

