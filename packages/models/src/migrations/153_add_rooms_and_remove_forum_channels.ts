import type { Client } from 'pg';

/**
 * Migration 153: Add rooms (forum containers) + pin tables, migrate forum channels, and remove forum implementation.
 *
 * Hard cutover:
 * - `channels.channel_type='forum'` rows are migrated into `rooms` (same backing conversation id).
 * - Forum channel rows are removed from `channels`.
 * - `channels.channel_type` column + CHECK constraint are dropped, so forum channels cannot exist anymore.
 *
 * Notes:
 * - Thread membership remains modeled via `conversations.parent_conversation_id` (child conversations).
 *   Since rooms keep the same backing conversation id as the migrated forum channel, existing threads remain intact.
 * - Room pins are references to existing starship-scoped resources (views/datasets/task boards).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Rooms table (conversation-backed)
    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        conversation_id VARCHAR(255) PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        slug VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        is_private BOOLEAN NOT NULL DEFAULT false,
        topic TEXT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_rooms_starship_id ON rooms(starship_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rooms_is_private ON rooms(is_private);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_starship_slug_ci ON rooms(starship_id, lower(slug));`);

    // Pin tables (ordered, de-duped per room)
    await client.query(`
      CREATE TABLE IF NOT EXISTS room_pinned_views (
        room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
        view_id VARCHAR(255) NOT NULL REFERENCES views(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) NULL,
        PRIMARY KEY (room_conversation_id, view_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_room_pinned_views_room ON room_pinned_views(room_conversation_id);`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_room_pinned_views_room_position ON room_pinned_views(room_conversation_id, position);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS room_pinned_datasets (
        room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
        dataset_id VARCHAR(255) NOT NULL REFERENCES starship_datasets(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) NULL,
        PRIMARY KEY (room_conversation_id, dataset_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_room_pinned_datasets_room ON room_pinned_datasets(room_conversation_id);`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_room_pinned_datasets_room_position ON room_pinned_datasets(room_conversation_id, position);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS room_pinned_task_boards (
        room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
        board_id VARCHAR(255) NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) NULL,
        PRIMARY KEY (room_conversation_id, board_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_room_pinned_task_boards_room ON room_pinned_task_boards(room_conversation_id);`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_room_pinned_task_boards_room_position ON room_pinned_task_boards(room_conversation_id, position);`
    );

    // Migrate forum channels -> rooms (idempotent)
    await client.query(`
      INSERT INTO rooms (conversation_id, starship_id, slug, name, is_private, topic, created_at, updated_at)
      SELECT c.conversation_id, c.starship_id, c.slug, c.name, c.is_private, c.topic, c.created_at, c.updated_at
        FROM channels c
       WHERE c.channel_type = 'forum'
      ON CONFLICT (conversation_id) DO NOTHING;
    `);

    // Migrate attached view on forum channels -> first pinned view (position 0)
    await client.query(`
      INSERT INTO room_pinned_views (room_conversation_id, view_id, position, created_at, created_by)
      SELECT c.conversation_id, c.attached_view_id, 0, NOW(), NULL
        FROM channels c
       WHERE c.channel_type = 'forum'
         AND c.attached_view_id IS NOT NULL
      ON CONFLICT (room_conversation_id, view_id) DO NOTHING;
    `);

    // Enforce room slug/name constraints at the DB level (idempotent).
    // Mirror channel constraints (migration 116).
    await client.query(`
      DO $$
      DECLARE
        bad_slug_count integer;
        bad_name_count integer;
      BEGIN
        SELECT count(*) INTO bad_slug_count
          FROM rooms
         WHERE
           slug IS NULL
           OR length(slug) < 1
           OR length(slug) > 100
           OR slug <> btrim(slug)
           OR slug <> lower(slug)
           OR slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';

        SELECT count(*) INTO bad_name_count
          FROM rooms
         WHERE
           name IS NULL
           OR length(name) < 1
           OR length(name) > 100
           OR name <> btrim(name);

        IF bad_slug_count > 0 OR bad_name_count > 0 THEN
          RAISE EXCEPTION 'Cannot add room constraints: % invalid slug(s), % invalid name(s). Fix existing rows in rooms first.', bad_slug_count, bad_name_count;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_rooms_slug_format'
        ) THEN
          ALTER TABLE rooms
            ADD CONSTRAINT ck_rooms_slug_format
            CHECK (
              length(slug) BETWEEN 1 AND 100
              AND slug = btrim(slug)
              AND slug = lower(slug)
              AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
            );
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_rooms_name_trimmed'
        ) THEN
          ALTER TABLE rooms
            ADD CONSTRAINT ck_rooms_name_trimmed
            CHECK (
              length(name) BETWEEN 1 AND 100
              AND name = btrim(name)
            );
        END IF;
      END $$;
    `);

    // If any starship default channel pointer references a migrated forum channel,
    // re-point it to #lobby (chat channel).
    await client.query(`
      UPDATE starships s
         SET default_channel_conversation_id = (
               SELECT c2.conversation_id
                 FROM channels c2
                WHERE c2.starship_id = s.id
                  AND lower(c2.slug) = 'lobby'
                  AND (c2.channel_type IS NULL OR c2.channel_type <> 'forum')
                LIMIT 1
             ),
             updated_at = NOW()
       WHERE s.default_channel_conversation_id IN (
               SELECT c.conversation_id
                 FROM channels c
                WHERE c.channel_type = 'forum'
             );
    `);

    // Remove forum channel rows from channels (rooms are the new source of truth)
    await client.query(`DELETE FROM channels WHERE channel_type = 'forum';`);

    // Drop channel_type column + check constraint so forum channels cannot exist.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_name = 'channels'
             AND column_name = 'channel_type'
        ) THEN
          ALTER TABLE channels DROP CONSTRAINT IF EXISTS ck_channels_channel_type;
          ALTER TABLE channels DROP COLUMN IF EXISTS channel_type;
        END IF;
      END $$;
    `);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Best-effort rollback: re-add channel_type (chat-only) and drop rooms + pin tables.
    // This does NOT restore forum channels back into channels.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_name = 'channels'
             AND column_name = 'channel_type'
        ) THEN
          ALTER TABLE channels
            ADD COLUMN channel_type VARCHAR(20) NOT NULL DEFAULT 'chat';
          ALTER TABLE channels
            ADD CONSTRAINT ck_channels_channel_type CHECK (channel_type IN ('chat'));
        END IF;
      END $$;
    `);

    await client.query('DROP TABLE IF EXISTS room_pinned_task_boards;');
    await client.query('DROP TABLE IF EXISTS room_pinned_datasets;');
    await client.query('DROP TABLE IF EXISTS room_pinned_views;');
    await client.query('DROP TABLE IF EXISTS rooms;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

