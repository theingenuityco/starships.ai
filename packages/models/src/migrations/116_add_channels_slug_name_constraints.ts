import type { Client } from 'pg';

/**
 * Migration 116: Enforce channel slug/name constraints at the DB level.
 *
 * Goals:
 * - `channels.slug`: lowercase, URL-safe, hyphen-only; 1..100 chars
 * - `channels.name`: trimmed (no leading/trailing whitespace); non-empty; 1..100 chars
 *
 * Notes:
 * - This migration does NOT mutate existing channel rows. If any existing data violates
 *   the new constraints, the migration will fail with a clear error so it can be fixed
 *   explicitly (no silent trimming/normalization).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Fail-fast validation so we never silently "fix" user-entered data.
    await client.query(`
      DO $$
      DECLARE
        bad_slug_count integer;
        bad_name_count integer;
      BEGIN
        SELECT count(*) INTO bad_slug_count
          FROM channels
         WHERE
           slug IS NULL
           OR length(slug) < 1
           OR length(slug) > 100
           OR slug <> btrim(slug)
           OR slug <> lower(slug)
           OR slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';

        SELECT count(*) INTO bad_name_count
          FROM channels
         WHERE
           name IS NULL
           OR length(name) < 1
           OR length(name) > 100
           OR name <> btrim(name);

        IF bad_slug_count > 0 OR bad_name_count > 0 THEN
          RAISE EXCEPTION 'Cannot add channel constraints: % invalid slug(s), % invalid name(s). Fix existing rows in channels first.', bad_slug_count, bad_name_count;
        END IF;
      END $$;
    `);

    // Add DB-level CHECK constraints (idempotent).
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_channels_slug_format'
        ) THEN
          ALTER TABLE channels
            ADD CONSTRAINT ck_channels_slug_format
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
           WHERE conname = 'ck_channels_name_trimmed'
        ) THEN
          ALTER TABLE channels
            ADD CONSTRAINT ck_channels_name_trimmed
            CHECK (
              length(name) BETWEEN 1 AND 100
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
    await client.query('ALTER TABLE channels DROP CONSTRAINT IF EXISTS ck_channels_name_trimmed;');
    await client.query('ALTER TABLE channels DROP CONSTRAINT IF EXISTS ck_channels_slug_format;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

