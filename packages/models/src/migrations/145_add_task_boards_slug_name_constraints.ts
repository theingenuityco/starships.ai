import type { Client } from 'pg';

/**
 * Migration 145: Enforce task board slug/name constraints at the DB level.
 *
 * Mirrors channels constraints:
 * - `task_boards.slug`: lowercase, URL-safe, hyphen-only; 1..100 chars
 * - `task_boards.name`: trimmed; non-empty; 1..200 chars (already limited by column type)
 *
 * Notes:
 * - This migration does NOT mutate existing rows. If existing data violates constraints,
 *   the migration fails so it can be fixed explicitly.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      DO $$
      DECLARE
        bad_slug_count integer;
        bad_name_count integer;
      BEGIN
        SELECT count(*) INTO bad_slug_count
          FROM task_boards
         WHERE
           slug IS NULL
           OR length(slug) < 1
           OR length(slug) > 100
           OR slug <> btrim(slug)
           OR slug <> lower(slug)
           OR slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';

        SELECT count(*) INTO bad_name_count
          FROM task_boards
         WHERE
           name IS NULL
           OR length(name) < 1
           OR length(name) > 200
           OR name <> btrim(name);

        IF bad_slug_count > 0 OR bad_name_count > 0 THEN
          RAISE EXCEPTION 'Cannot add task board constraints: % invalid slug(s), % invalid name(s). Fix existing rows in task_boards first.', bad_slug_count, bad_name_count;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_task_boards_slug_format'
        ) THEN
          ALTER TABLE task_boards
            ADD CONSTRAINT ck_task_boards_slug_format
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
           WHERE conname = 'ck_task_boards_name_trimmed'
        ) THEN
          ALTER TABLE task_boards
            ADD CONSTRAINT ck_task_boards_name_trimmed
            CHECK (
              length(name) BETWEEN 1 AND 200
              AND name = btrim(name)
            );
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
    await client.query('ALTER TABLE task_boards DROP CONSTRAINT IF EXISTS ck_task_boards_name_trimmed;');
    await client.query('ALTER TABLE task_boards DROP CONSTRAINT IF EXISTS ck_task_boards_slug_format;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

