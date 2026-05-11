import type { Client } from 'pg';

/**
 * Migration 189: Add docs tables
 *
 * Starship-scoped markdown documents that can be pinned to rooms.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS docs (
        id           VARCHAR(255) PRIMARY KEY,
        starship_id  VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        title        VARCHAR(300) NOT NULL,
        slug         VARCHAR(100) NOT NULL,
        content      TEXT NOT NULL DEFAULT '',
        archived     BOOLEAN NOT NULL DEFAULT FALSE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE (starship_id, slug)
      );

      CREATE INDEX IF NOT EXISTS idx_docs_starship_id ON docs(starship_id);
      CREATE INDEX IF NOT EXISTS idx_docs_starship_archived ON docs(starship_id, archived);
      CREATE INDEX IF NOT EXISTS idx_docs_starship_created_at ON docs(starship_id, created_at);

      CREATE TABLE IF NOT EXISTS room_docs (
        room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
        doc_id               VARCHAR(255) NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
        position             INTEGER NOT NULL,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by           VARCHAR(255) NULL,

        PRIMARY KEY (room_conversation_id, doc_id)
      );

      CREATE INDEX IF NOT EXISTS idx_room_docs_room ON room_docs(room_conversation_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_room_docs_room_position ON room_docs(room_conversation_id, position);
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
      DROP TABLE IF EXISTS room_docs;
      DROP TABLE IF EXISTS docs;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
